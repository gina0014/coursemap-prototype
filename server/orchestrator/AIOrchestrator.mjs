/* ============================================================================
   CourseMap AI Backend — orchestrator/AIOrchestrator.mjs
   ----------------------------------------------------------------------------
   管线（ADR-004，CourseMap = Source of Truth）：

     用户消息
       ↓ 输入校验（security/inputValidation）
       ↓ 会话上下文合并（context/ConversationStore）
       ↓ [LLM Stage A] Intent Extraction（JSON 输出 + schema 校验）
       ↓ StructuredRetriever 检索候选（CourseMap Data = Evidence）
       ↓ [LLM Stage B] Tool-calling 推理（allowlist 工具，参数 untrusted）
       ↓ 终局 JSON 校验
       ↓ CODE-ENFORCED 资源 ID 校验（幻觉资源直接剔除/拒绝）
       ↓ Fact Hydration（fee/provider/duration/rating/certificate/source 全部
         由 Repository 重新取数，不信模型回传）
       ↓ LearningDecisionResponse（Evidence-backed + General advice 分层）
       ↓ 统一 envelope

   硬约束：
     - 模型只能「解释证据」，不能「定义证据」。
     - 候选为空时返回 NO_MATCHING_RESOURCE（友好语义），不编造。
     - LLM 故障 → 上层走 Graceful Degradation（核心功能不依赖 AI）。
   ========================================================================== */

import { ApiError, ERROR_CODES } from '../errors.mjs';
import { CONFIG } from '../config.mjs';
import { sanitizeIntent } from './intentSchema.mjs';
import { extractJsonObject } from '../llm/jsonUtil.mjs';
import { SYSTEM_PROMPT_V1, intentExtractionUserPrompt, recommendationUserPrompt } from '../prompts/learning-advisor-v1.mjs';
import { ToolExecutor } from '../tools/toolExecutor.mjs';
import { TOOL_SCHEMAS } from '../tools/toolSchemas.mjs';

function asStr(v, maxLen = 200) {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, maxLen);
  return s.length ? s : null;
}

/** ID 接受 string / number（数据集 resource_id 为整数）。 */
function asId(v, maxLen = 40) {
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim().slice(0, maxLen);
    return s.length ? s : null;
  }
  return null;
}

/* Module O —— CourseMap 未核验的字段。
   规则：Repository 里为 null 的事实字段，AI 必须明说「CourseMap 当前未核验该字段」，
   不得自行补充。这里在服务端**用代码列出**这些字段，而不是指望模型自觉：
   模型即使编数字，前端也只看这份清单。 */
const TRACKED_FACT_FIELDS = [
  'difficulty', 'duration_hours', 'weekly_workload_hours',
  'certificate_available', 'rating',
];

function unknownFieldsOf(resource, ratingSummary) {
  const out = [];
  for (const field of TRACKED_FACT_FIELDS) {
    if (field === 'rating') {
      if (ratingSummary.rating === null || ratingSummary.rating === undefined) out.push('rating');
      continue;
    }
    if (resource[field] === null || resource[field] === undefined) out.push(field);
  }
  if (!resource.description) out.push('description');
  if (!resource.observed_at) out.push('observed_at');
  return out;
}

export class AIOrchestrator {
  constructor({ adapter, repository, retriever, conversationStore, usageLogger }) {
    this.adapter = adapter;
    this.repo = repository;
    this.retriever = retriever;
    this.store = conversationStore;
    this.usageLog = usageLogger;
    this._catalogue = null;
  }

  /** CourseMap 规范目标清单（惰性构建，供 Stage A 选择而非创造目标名）。 */
  _goalCatalogue() {
    if (!this._catalogue) {
      this._catalogue = (this.repo.goals || []).map((g) => ({
        goal_id: g.goal_id,
        name: g.name,
        aliases: (g.aliases || []).slice(0, 4),
      }));
    }
    return this._catalogue;
  }

  /**
   * @param {{ message, conversation_id, context }} input 已过输入校验
   * @param {{ requestId, clientIp }} meta
   * @returns {Promise<{success:true, data:object, meta:object}>}
   */
  async advise(input, meta) {
    const startedAt = Date.now();
    const { message, conversation_id: conversationId } = input;
    const requestContext = sanitizeIntent(input.context).intent;

    // ---- 会话上下文（structured constraints 优先，非全量 raw chat）----
    const session = this.store.get(conversationId, meta.clientIp);
    const mergedContext = this.store.merge(session, requestContext);

    // ---- Stage A：意图解析（LLM JSON 输出 + schema 校验）----
    const intentMessages = [
      { role: 'system', content: SYSTEM_PROMPT_V1 },
      { role: 'user', content: intentExtractionUserPrompt(message,
        mergedContext && (mergedContext.goal || mergedContext.budget !== null) ? mergedContext : null,
        this._goalCatalogue()) },
    ];
    const a = await this.adapter.chatJSON({ messages: intentMessages, temperature: 0.1 });
    const { intent: llmIntent, warnings: intentWarnings } = sanitizeIntent(a.content);

    // 用户在 context 中显式给出的约束优先于模型抽取（用户 > 模型）
    const intent = { ...llmIntent };
    for (const key of Object.keys(intent)) {
      if (requestContext[key] !== null && requestContext[key] !== undefined
        && !(Array.isArray(requestContext[key]) && requestContext[key].length === 0)) {
        intent[key] = requestContext[key];
      }
    }
    // 会话延续：上一轮已确认的目标/约束在本轮消息未提及时保留
    const finalIntent = this.store.applyContinuity(mergedContext, intent, llmIntent);

    if (!finalIntent.goal) {
      // 语义修正（生产缺陷记录，2026-10-06）：
      // 「没能识别出学习目标」不是**请求格式**问题 —— 请求本身完全合法，
      // 只是内容无法映射到 CourseMap 的任何目标。旧实现返回 400 BAD_REQUEST，
      // 与「无匹配资源（404 NO_MATCHING_RESOURCE）」语义冲突：
      //   · 前端/CI 会把 400 读成「客户端 bug」，掩盖真实的「没听懂」；
      //   · 生产验证 H-02（诱导不存在的 ID）因此被判 FAIL，掩盖了
      //     「系统其实正确地拒绝了」这一事实。
      // 统一为 404 NO_MATCHING_RESOURCE：与 N-00 同一条诚实语义。
      throw new ApiError(ERROR_CODES.NO_MATCHING_RESOURCE,
        '未能从你的描述中识别学习目标。请告诉我你想学什么，例如「想入门 Python 数据分析」；'
        + '也可以直接使用「找课程」浏览 CourseMap 收录的全部目标。', 404,
        { intentWarnings });
    }

    // ---- 检索：候选证据集（DATA, not instruction）----
    const retrieval = this.retriever.retrieve(finalIntent, CONFIG.limits.maxRetrievalResults);
    const compact = this.retriever.toCompactCandidates(retrieval.candidates);

    // ---- Stage B：Tool-calling 推理 ----
    const executor = new ToolExecutor(this.repo, this.retriever, CONFIG.limits.maxRetrievalResults);
    const handleToolCall = (name, args) => Promise.resolve(executor.execute(name, args));

    const stageBMessages = [
      { role: 'system', content: SYSTEM_PROMPT_V1 },
      { role: 'user', content: recommendationUserPrompt(
        compact, retrieval.goal, finalIntent, retrieval.total > compact.length) },
    ];
    const b = await this.adapter.chatWithTools({
      messages: stageBMessages,
      tools: TOOL_SCHEMAS,
      handleToolCall,
    });

    let finalJson;
    try {
      finalJson = JSON.parse(String(b.content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
    } catch {
      throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回格式异常，请重试。', 502, { stage: 'B' });
    }
    if (!finalJson || typeof finalJson !== 'object' || Array.isArray(finalJson)) {
      throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回格式异常，请重试。', 502, { stage: 'B', shape: 'not-object' });
    }

    // ---- CODE-ENFORCED：幻觉资源防线 ----
    const rawRecs = Array.isArray(finalJson.recommendations) ? finalJson.recommendations : [];
    const rejected = [];
    const seen = new Set();
    const validRecs = [];
    for (const rec of rawRecs.slice(0, 6)) {
      if (!rec || typeof rec !== 'object') continue;
      const id = asId(rec.resource_id, 40);
      const exists = id ? this.repo.getResourceById(id) : null;
      if (!exists) { rejected.push(id); continue; }
      if (seen.has(id)) continue;
      seen.add(id);
      validRecs.push(rec);
    }

    // ---- Fact Hydration：展示值全部从 Repository 重取，不信模型 ----
    const recommendations = validRecs.map((rec) => {
      const r = this.repo.getResourceById(asId(rec.resource_id, 40));
      const rating = this.repo.getRatingSummary(r.resource_id);
      const sources = this.repo.getSourcesForResource(r.resource_id);
      const licenses = this.repo.licenseSummaryFor
        ? this.repo.licenseSummaryFor(r.resource_id)
        : [];
      const primary = licenses[0] || null;
      return {
        resource_id: r.resource_id,
        // ---- 以下字段全部 hydrated（Repository > LLM）----
        title: r.title,
        provider: this.repo.getProvider(r.provider_id)?.name || null,
        provider_id: r.provider_id,
        subject_id: r.subject_id,
        learning_goal_names: (r.learning_goal_ids || [])
          .map((gid) => this.repo.goalById ? this.repo.goalById(gid)?.name : null)
          .filter(Boolean),
        fee: r.fee,
        currency: r.currency,
        duration_hours: r.duration_hours,
        weekly_workload_hours: r.weekly_workload_hours,
        difficulty: r.difficulty,
        level_official: r.level_official ?? null,
        language: r.language,
        learning_mode: r.learning_mode,
        certificate_available: r.certificate_available,
        rating: rating.rating,
        rating_count: rating.rating_count,
        verification_status: r.verification_status,
        data_class: r.data_class,
        url: r.url,
        // ---- Module F/N：来源与官方链接（水合自 Source，不由模型生成）----
        official_url: primary ? primary.official_url : (r.url || null),
        source: primary,
        license: primary ? primary.license : null,
        observed_at: r.observed_at || null,
        // ---- Module O：CourseMap 尚未核验的字段必须显式暴露，交由前端/模型明说 ----
        unknown_fields: unknownFieldsOf(r, rating),
        /* Module N：没有 Source 的推荐不得被当作「已核验推荐」。
           真实资源由 VR-C05 在数据层强制绑定来源；此处再做一次运行期断言。 */
        verified_recommendation: Boolean(primary && primary.official_url),
        // ---- 模型提供的解释（reasoning，允许保留但截断）----
        reason: asStr(rec.reason, 400),
        fit_factors: Array.isArray(rec.fit_factors) ? rec.fit_factors.slice(0, 5).map((s) => asStr(s, 80)).filter(Boolean) : [],
        tradeoffs: Array.isArray(rec.tradeoffs) ? rec.tradeoffs.slice(0, 5).map((s) => asStr(s, 80)).filter(Boolean) : [],
        source_refs: sources.map((s) => s.source.source_id),
        sources: sources.map((s) => ({
          source_id: s.source.source_id, title: s.source.title,
          source_type: s.source.source_type, verification_status: s.source.verification_status,
          provider: s.source.provider || null,
          official_url: s.source.official_url || s.source.url || null,
          license: s.source.license || null,
          license_url: s.source.license_url || null,
          observed_at: s.source.observed_at || s.source.retrieved_at || null,
        })),
      };
    });

    // ---- Learning Path（evidence-backed 结构 + AI schedule 分层）----
    // path_ref 用 asId：与 resource_id 一样，模型可能返回数字或字符串，
    // 若只接受字符串会**静默丢失**整段学习路径（生产缺陷记录）。
    let learningPath = null;
    const pathRef = asId(finalJson.path_ref, 40);
    if (pathRef) {
      const p = this.repo.getLearningPath(pathRef);
      if (p) {
        learningPath = {
          evidence_backed: {
            path_id: p.path_id,
            name: p.name,
            description: p.description,
            goal_ids: p.goal_ids,
            steps: p.steps.map((s) => ({
              step_order: s.step_order,
              title: s.title,
              skill: s.skill ? s.skill.name : null,
              goal: s.goal ? s.goal.name : null,
              core_resource_ids: s.core_resource_ids,
              core_resources: s.core_resources.map((cr) => ({
                resource_id: cr.resource_id, title: cr.title, fee: cr.fee,
                duration_hours: cr.duration_hours, data_class: cr.data_class,
              })),
            })),
          },
          ai_generated_schedule: asStr(finalJson.ai_schedule, 800),
          note: 'steps 为 CourseMap Learning Graph 事实（evidence-backed）；ai_generated_schedule 为 AI 规划建议，仅供参考。',
        };
      }
    }

    // ---- 无匹配资源（诚实语义）----
    if (recommendations.length === 0 && !learningPath) {
      if (retrieval.total === 0) {
        // 把「识别到的目标」回显出来：既方便用户改述，也让线上问题可诊断
        // （生产缺陷记录：只回「没有匹配资源」时无法判断是目标识别错还是数据缺失）
        const parsed = asStr(finalIntent.goal, 40);
        throw new ApiError(ERROR_CODES.NO_MATCHING_RESOURCE,
          (parsed
            ? `CourseMap 数据集中没有找到与「${parsed}」匹配的学习资源。`
            : 'CourseMap 数据集中没有找到与该目标匹配的学习资源。')
          + '你可以换一种说法，或使用「找课程」浏览 CourseMap 收录的全部目标。', 404,
          { rejectedIds: rejected, parsedGoal: parsed });
      }
      if (rejected.length > 0) {
        // 模型引用了不存在的资源且没有给出任何真实推荐 → 视为不可信输出
        throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT,
          'AI 推荐未能通过数据校验，请重试。', 502, { rejectedIds: rejected });
      }
    }

    // ---- 汇总证据与不确定性 ----
    const evidence = recommendations.map((r) => ({
      resource_id: r.resource_id,
      data_class: r.data_class,
      verification_status: r.verification_status,
      source_refs: r.source_refs,
    }));
    const uncertainties = Array.isArray(finalJson.uncertainties)
      ? finalJson.uncertainties.slice(0, 5).map((s) => asStr(s, 200)).filter(Boolean)
      : [];
    // 硬约束未能命中时的显式说明（诚实语义：不静默吞掉放宽）
    for (const note of retrieval.relaxations || []) {
      uncertainties.push(`${note}；已按最接近的条件给出候选，请自行判断是否适用。`);
    }
    /* Module P：真实 / DEMO 必须同时说清楚。
       注意不能再用「目标 data_class」做判断 —— 目标属于分类节点，
       与具体资源是否为真实核验资源无关，混用会给出错误的披露。 */
    const demoCount = recommendations.filter((r) => r.data_class === 'demo').length;
    const realCount = recommendations.length - demoCount;
    if (demoCount > 0 && realCount > 0) {
      uncertainties.push(`本次推荐混合了 ${realCount} 条已核验真实资源与 ${demoCount} 条 DEMO 演示资源：标有「查看官方资源」的为可溯源的真实资源，DEMO 条目仅用于演示，不代表真实存在的课程。`);
    } else if (demoCount > 0) {
      uncertainties.push('本次推荐全部基于 DEMO 演示数据集（data_class=demo），并非真实核验课程；请勿据此判断真实课程是否存在。');
    } else if (realCount > 0) {
      uncertainties.push('本次推荐全部为带官方来源与许可记录的真实资源（data_class=real）；CourseMap 只保存元数据与官方链接，不复制课程正文。');
    }
    const unverifiedFieldNames = [...new Set(recommendations.flatMap((r) => r.unknown_fields))];
    if (unverifiedFieldNames.length) {
      uncertainties.push(`以下字段 CourseMap 当前未核验，AI 不会给出数值：${unverifiedFieldNames.join('、')}。`);
    }

    const latencyMs = Date.now() - startedAt;
    const usage = {
      stageA: a.usage, stageB: b.usage,
      total_tokens: (a.usage?.total_tokens || 0) + (b.usage?.total_tokens || 0),
    };
    this.usageLog?.record({
      request_id: meta.requestId, adapter: this.adapter.name, model: this.adapter.model || this.adapter.name,
      latency_ms: latencyMs, usage, tool_call_count: executor.callCount,
      retrieval_count: retrieval.candidates.length, status: 'ok',
    });

    return {
      interpreted_goal: retrieval.goal
        ? { goal_id: retrieval.goal.goal_id, name: retrieval.goal.name, data_class: retrieval.goal.data_class }
        : { goal_id: null, name: asStr(finalIntent.goal, 80), data_class: null },
      constraints: finalIntent,
      recommendations,
      learning_path: learningPath,
      estimated_cost: recommendations.some((r) => r.fee !== null)
        ? recommendations.reduce((s, r) => s + (r.fee || 0), 0)
        : null,
      estimated_duration: recommendations.some((r) => r.duration_hours !== null)
        ? recommendations.reduce((s, r) => s + (r.duration_hours || 0), 0)
        : null,
      general_advice: Array.isArray(finalJson.general_advice)
        ? finalJson.general_advice.slice(0, 5).map((s) => asStr(s, 300)).filter(Boolean)
        : [],
      summary: asStr(finalJson.summary, 500),
      uncertainties,
      rejected_resource_ids: rejected,
      parse_warnings: intentWarnings,
      evidence,
      // ---- Module P：数据集真实/演示构成（前端披露用）----
      data_class_counts: this.repo.dataClassCounts ? this.repo.dataClassCounts() : null,
      // ---- Grounding 元信息：让「证据约束」可被前端与测试断言 ----
      grounding: {
        verified_recommendations: recommendations.filter((r) => r.verified_recommendation).length,
        total_recommendations: recommendations.length,
        unknown_fields: unverifiedFieldNames,
        policy: 'LLM 只解释证据；资源身份/费用/时长/难度/证书/评分/来源全部由 CourseMap Repository 水合。',
      },
    };
  }
}
