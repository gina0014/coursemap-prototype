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

export class AIOrchestrator {
  constructor({ adapter, repository, retriever, conversationStore, usageLogger }) {
    this.adapter = adapter;
    this.repo = repository;
    this.retriever = retriever;
    this.store = conversationStore;
    this.usageLog = usageLogger;
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
        mergedContext && (mergedContext.goal || mergedContext.budget !== null) ? mergedContext : null) },
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
      throw new ApiError(ERROR_CODES.BAD_REQUEST,
        '未能从你的描述中识别学习目标。请告诉我你想学什么，例如「想入门 Python 数据分析」。', 400,
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
      return {
        resource_id: r.resource_id,
        // ---- 以下字段全部 hydrated（Repository > LLM）----
        title: r.title,
        provider: this.repo.getProvider(r.provider_id)?.name || null,
        provider_id: r.provider_id,
        subject_id: r.subject_id,
        fee: r.fee,
        currency: r.currency,
        duration_hours: r.duration_hours,
        weekly_workload_hours: r.weekly_workload_hours,
        difficulty: r.difficulty,
        language: r.language,
        learning_mode: r.learning_mode,
        certificate_available: r.certificate_available,
        rating: rating.rating,
        rating_count: rating.rating_count,
        verification_status: r.verification_status,
        data_class: r.data_class,
        url: r.url,
        // ---- 模型提供的解释（reasoning，允许保留但截断）----
        reason: asStr(rec.reason, 400),
        fit_factors: Array.isArray(rec.fit_factors) ? rec.fit_factors.slice(0, 5).map((s) => asStr(s, 80)).filter(Boolean) : [],
        tradeoffs: Array.isArray(rec.tradeoffs) ? rec.tradeoffs.slice(0, 5).map((s) => asStr(s, 80)).filter(Boolean) : [],
        source_refs: sources.map((s) => s.source.source_id),
        sources: sources.map((s) => ({
          source_id: s.source.source_id, title: s.source.title,
          source_type: s.source.source_type, verification_status: s.source.verification_status,
        })),
      };
    });

    // ---- Learning Path（evidence-backed 结构 + AI schedule 分层）----
    let learningPath = null;
    const pathRef = asStr(finalJson.path_ref, 40);
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
        throw new ApiError(ERROR_CODES.NO_MATCHING_RESOURCE,
          'CourseMap 数据集中没有找到与该目标匹配的学习资源。你可以尝试其他目标，或使用「找课程」浏览全部目标。', 404,
          { rejectedIds: rejected });
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
    if (retrieval.goal && retrieval.goal.data_class === 'demo') {
      uncertainties.push('当前目标及推荐资源基于 DEMO 数据集（data_class=demo），并非真实核验课程。');
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
    };
  }
}
