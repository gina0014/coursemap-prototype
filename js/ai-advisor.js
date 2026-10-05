/* ============================================================================
   CourseMap（学途） — ai-advisor.js
   ----------------------------------------------------------------------------
   AI Learning Advisor 的 v0.1 实现：

     Natural Language
       ↓ Rule-based Structured Parser（无 LLM）
     LearningDecisionRequest（结构化约束）
       ↓ CourseMap Retrieval（search.js 的规则检索）
     LearningDecisionResponse（推荐 + 解释 + 证据 + 不确定性）

   诚实性硬约束：
     - 本实现 = Prototype Decision Assistant，**不是 LLM**，UI 必须明示。
     - 解析失败的字段返回 null（未知），**不猜测**。
     - 所有推荐必须带 evidence（来源与数据类别）与 uncertainty。
     - 预留 LLM Adapter 接口：未来接入时密钥只存在于服务端，
       前端/GitHub Pages 永远不出现 secret。

   架构分层（docs/product/11_AI_Architecture.md）：
     LLM = Interaction / Reasoning Layer（未来）
     CourseMap Data = Evidence Layer（现在）
     Learning Graph = Knowledge Layer
     Learner Outcome = Feedback Layer（未来）
   ========================================================================== */

import { AI } from './config.js';
import { searchResources, matchGoals } from './search.js';
import { pathsCoveringGoal } from './derive.js';
import { normalizeText } from './utils.js';

/* ----------------------------------------------------------------------------
   LearningDecisionRequest 解析（Rule-based）
   -------------------------------------------------------------------------- */

const LEVEL_PATTERNS = [
  { re: /零基础|没基础|从未|小白|初学者/, level: 'beginner' },
  { re: /有基础|学过|有一定|进阶/, level: 'intermediate' },
  { re: /高级|深入|高阶/, level: 'advanced' },
];

const GOAL_KEYWORDS = [
  { keywords: ['数据分析'], goalName: 'Python 数据分析' },
  { keywords: ['python', 'py'], goalName: 'Python 入门' },
  { keywords: ['机器学习', 'ml'], goalName: '机器学习基础' },
  { keywords: ['r语言', 'r 语言', 'tidyverse'], goalName: 'R 语言入门' },
  { keywords: ['统计'], goalName: '科研统计基础' },
  { keywords: ['单细胞', 'scrna', 'rna-seq'], goalName: '单细胞 RNA-seq 入门' },
  { keywords: ['文献'], goalName: '文献检索' },
  { keywords: ['写作', '论文'], goalName: '学术英语写作' },
  { keywords: ['六级', 'cet6', 'cet-6'], goalName: '英语六级' },
  { keywords: ['ai', 'gpt', 'ai工具', 'ai 工具'], goalName: 'AI 工具使用' },
  { keywords: ['可视化'], goalName: '数据可视化' },
  { keywords: ['sql', '数据库'], goalName: 'SQL 与数据库入门' },
];

/**
 * 自然语言 → LearningDecisionRequest。
 * 每个字段独立解析；解析不到 = null（诚实呈现，不猜测）。
 *
 * @returns {request, parseNotes: string[], confidence: 'high'|'medium'|'low'}
 */
export function parseDecisionRequest(text) {
  const raw = String(text || '');
  const lower = normalizeText(raw);
  const request = {
    goal: null,
    current_level: null,
    known_skills: [],
    budget: null,
    available_hours_per_week: null,
    target_duration: null,
    language: null,
    preferred_learning_style: null,
    certificate_requirement: null,
    resource_type: null,
    career_goal: null,
  };
  const notes = [];

  // 预算：¥200 / 200元 / 预算200（第一个出现的金额，避免把「三个月」误读）
  const budgetMatch = raw.match(/(?:¥|￥|预算\s*)\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/) || raw.match(/(\d+(?:\.\d+)?)\s*元/);
  if (budgetMatch) {
    request.budget = Number(budgetMatch[1]);
    notes.push(`预算 = ¥${request.budget}（由金额表达式中解析）`);
  } else if (/免费|不花钱|零成本/.test(lower)) {
    request.budget = 0;
    notes.push('预算 = 0（用户声明免费）');
  } else {
    notes.push('预算：未解析到（视为不限）');
  }

  // 每周时间：每周5小时 / 一周5h / 每天1小时（折算每周 7h）
  const weekly = raw.match(/每[周个星]期?\s*(\d+(?:\.\d+)?)\s*(?:小时|h|hr)/) || raw.match(/一周\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/);
  if (weekly) {
    request.available_hours_per_week = Number(weekly[1]);
    notes.push(`每周可投入 = ${request.available_hours_per_week} 小时`);
  } else {
    const daily = raw.match(/每天\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/);
    if (daily) {
      request.available_hours_per_week = Math.round(Number(daily[1]) * 7);
      notes.push(`每周可投入 = ${request.available_hours_per_week} 小时（由「每天 ${daily[1]} 小时」折算）`);
    } else {
      notes.push('每周时间：未解析到（视为不限）');
    }
  }

  // 目标周期：三个月 / 3个月 / 半年 / 一年
  const duration = raw.match(/([一二两三三四五六]|半|\d+)\s*个?月/) || raw.match(/(\d+)\s*周/);
  if (duration) {
    request.target_duration = duration[0];
    notes.push(`目标周期 = ${request.target_duration}（仅作为说明性约束，v0.1 不据此过滤）`);
  } else {
    notes.push('目标周期：未解析到');
  }

  // 基础水平
  for (const { re, level } of LEVEL_PATTERNS) {
    if (re.test(raw)) {
      request.current_level = level;
      notes.push(`当前基础 = ${level}（由水平关键词解析）`);
      break;
    }
  }
  if (!request.current_level) notes.push('当前基础：未解析到（视为不限）');

  // 学习目标：先精确匹配 goal 关键词表，再回落到 aliases 检索
  let goalMatch = null;
  for (const entry of GOAL_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(normalizeText(kw))) { goalMatch = entry.goalName; break; }
    }
    if (goalMatch) break;
  }
  if (goalMatch) {
    request.goal = goalMatch;
    notes.push(`学习目标 = ${goalMatch}（由目标关键词表解析）`);
  } else {
    notes.push('学习目标：未解析到（需要用户在结构化表单中补充）');
  }

  // 语言偏好
  if (/英文|英语授课/.test(raw)) { request.language = 'en'; notes.push('语言 = 英文'); }
  else if (/中文/.test(raw)) { request.language = 'zh'; notes.push('语言 = 中文'); }

  // 证书要求
  if (/证书|认证/.test(raw)) { request.certificate_requirement = true; notes.push('需要证书 = 是'); }

  // 学习方式
  if (/直播|带教|有人教/.test(raw)) { request.preferred_learning_style = 'instructor_led'; notes.push('偏好模式 = 直播/带教'); }
  else if (/自学|自己安排/.test(raw)) { request.preferred_learning_style = 'self_paced'; notes.push('偏好模式 = 自学节奏'); }

  const parsedFields = [request.goal, request.budget !== null, request.available_hours_per_week !== null,
    request.current_level].filter(Boolean).length;
  const confidence = parsedFields >= 3 ? 'high' : (parsedFields >= 2 ? 'medium' : 'low');

  return { request, parseNotes: notes, confidence };
}

/* ----------------------------------------------------------------------------
   决策响应构造（调用真实 CourseMap 结构化数据）
   -------------------------------------------------------------------------- */

/**
 * @param {object} ctx data-loader buildContext 结果
 * @param {object} request LearningDecisionRequest（parseDecisionRequest 产出）
 * @returns LearningDecisionResponse
 */
export function buildDecisionResponse(ctx, request) {
  const response = {
    interpreted_goal: null,
    constraints: { ...request },
    recommended_resources: [],
    recommended_path: null,
    estimated_cost: null,
    estimated_duration: null,
    reasoning_summary: '',
    evidence: [],
    source_refs: [],
    verification_status: 'unverified',
    uncertainty: [],
    alternative_options: [],
    // 本模块实现的是本地规则引擎（前端降级引擎）；AI.mode 描述平台主引擎，不混用
    engine: 'rule_based_prototype',
  };

  // 目标解析：名称 → goal 实体
  let goalId = null;
  if (request.goal) {
    const matched = matchGoals(ctx, request.goal);
    if (matched.length) {
      goalId = matched[0].goal.goal_id;
      response.interpreted_goal = matched[0].goal;
    } else {
      response.uncertainty.push(`目标「${request.goal}」在当前数据集中没有匹配项。`);
    }
  } else {
    response.uncertainty.push('未解析到学习目标，本次推荐基于预算与时间约束的通用排序。');
  }

  // 检索：结构化查询走 search.js（单一检索实现）
  const query = {
    q: '',
    goal: goalId,
    subject: null,
    difficulty: request.current_level === 'beginner' ? 'beginner' : null,
    budget: request.budget,
    language: request.language,
    durationMax: null,
    workloadMax: request.available_hours_per_week,
    cert: request.certificate_requirement === true ? true : null,
    mode: request.preferred_learning_style,
    provider: null,
    verification: null,
    freeOnly: false,
    sort: 'rating',
    page: 1,
  };
  let result = searchResources(ctx, query);

  // 渐进放宽（每步都记录在 reasoning 中，可解释）
  const relaxSteps = [];
  if (result.total === 0 && query.workloadMax !== null) {
    query.workloadMax = null;
    relaxSteps.push('放宽每周时间约束');
    result = searchResources(ctx, query);
  }
  if (result.total === 0 && query.cert === true) {
    query.cert = null;
    relaxSteps.push('放宽证书要求');
    result = searchResources(ctx, query);
  }
  if (result.total === 0 && query.difficulty !== null) {
    query.difficulty = null;
    relaxSteps.push('放宽难度要求');
    result = searchResources(ctx, query);
  }
  if (result.total === 0 && query.budget !== null) {
    query.budget = null;
    relaxSteps.push('放宽预算约束');
    result = searchResources(ctx, query);
  }

  response.recommended_resources = result.allRows.slice(0, AI.maxRecommendations).map((s) => ({
    resource_id: s.resource.resource_id,
    title: s.resource.title,
    provider: s.provider ? s.provider.name : null,
    fee: s.fee ? s.fee.fee : null,
    currency: s.fee ? s.fee.currency : null,
    duration_hours: s.resource.duration_hours,
    weekly_workload_hours: s.resource.weekly_workload_hours,
    difficulty: s.resource.difficulty,
    certificate_available: s.resource.certificate_available,
    rating: s.rating.overall,
    rating_count: s.rating.count,
    data_class: s.resource.data_class,
    verification_status: s.resource.verification_status,
    source_ids: s.resource.source_ids,
  }));

  // 学习路径推荐（Goal → Path 的一级连接）
  if (goalId !== null) {
    const paths = pathsCoveringGoal(ctx, goalId);
    if (paths.length) {
      response.recommended_path = { path_id: paths[0].path_id, name: paths[0].name };
    }
  }

  // 估算：只对已推荐资源做真实加总；缺失值不计入、也不伪装
  const knownFees = response.recommended_resources
    .map((r) => (r.fee === 0 ? 0 : r.fee))
    .filter((v) => typeof v === 'number');
  const knownDurations = response.recommended_resources
    .map((r) => r.duration_hours)
    .filter((v) => typeof v === 'number');
  response.estimated_cost = knownFees.length
    ? { min: Math.min(...knownFees), max: Math.max(...knownFees), unknown_count: response.recommended_resources.length - knownFees.length }
    : null;
  response.estimated_duration = knownDurations.length
    ? { min: Math.min(...knownDurations), max: Math.max(...knownDurations), unknown_count: response.recommended_resources.length - knownDurations.length }
    : null;

  // 推理摘要（规则可解释，逐条列明）
  const reasons = [];
  if (goalId !== null) reasons.push(`按学习目标「${response.interpreted_goal.name}」筛选资源`);
  if (request.current_level) reasons.push(`难度限定为 ${request.current_level}`);
  if (request.budget !== null) reasons.push(`费用 ≤ ¥${request.budget}（费用未知的资源不参与命中）`);
  if (request.available_hours_per_week !== null) reasons.push(`每周工作量 ≤ ${request.available_hours_per_week} 小时`);
  if (request.certificate_requirement) reasons.push('仅保留提供证书的资源');
  reasons.push('按学习者评分排序（样本不足的评分不参与前置筛选）');
  if (relaxSteps.length) reasons.push(`约束过紧时依次：${relaxSteps.join(' → ')}`);
  response.reasoning_summary = reasons.join('；') + '。';

  // 证据与来源
  const seenSources = new Set();
  for (const rec of response.recommended_resources) {
    for (const sid of rec.source_ids || []) {
      if (!seenSources.has(sid)) {
        seenSources.add(sid);
        const source = ctx.indexes.sourceById.get(sid);
        if (source) {
          response.source_refs.push({
            source_id: source.source_id,
            title: source.title,
            source_type: source.source_type,
            url: source.url,
            retrieved_at: source.retrieved_at,
            usage_permission: source.usage_permission,
          });
        }
      }
    }
    response.evidence.push({
      resource_id: rec.resource_id,
      title: rec.title,
      data_class: rec.data_class,
      verification_status: rec.verification_status,
      rating_count: rec.rating_count,
      why: [
        rec.rating_count > 0 ? `${rec.rating_count} 条学习者评价（均值 ${rec.rating}）` : '暂无评价（不做评分断言）',
        rec.fee === 0 ? '免费' : (rec.fee === null || rec.fee === undefined ? '费用未知（未计入估算）' : `费用 ¥${rec.fee}`),
        rec.certificate_available === true ? '提供证书' : (rec.certificate_available === false ? '不提供证书' : '证书信息未知'),
      ].join(' · '),
    });
  }
  if (response.recommended_resources.some((r) => r.data_class === 'demo')) {
    response.uncertainty.push('当前数据集全部为演示数据（DEMO），推荐结果仅用于原型验证，不构成任何真实课程建议。');
  }
  if (response.estimated_cost && response.estimated_cost.unknown_count > 0) {
    response.uncertainty.push(`${response.estimated_cost.unknown_count} 个推荐资源费用未知，未计入费用估算。`);
  }

  return response;
}

/* ----------------------------------------------------------------------------
   LLM Adapter 接口位（本轮不接入任何真实 LLM）
   ----------------------------------------------------------------------------
   未来实现约定（docs/product/11_AI_Architecture.md §5）：
     1. 适配器运行在后端 / Serverless 代理上，密钥不出服务端。
     2. 输入 = LearningDecisionRequest；输出 = LearningDecisionResponse（同一 schema）。
     3. LLM 只做意图解析与解释生成；检索与排序必须仍走 CourseMap 结构化数据。
   -------------------------------------------------------------------------- */

export function createLlmAdapter() {
  return {
    available: false,
    reason: 'no server-side LLM credentials in prototype; rule-based parser active',
    async decide(request) {
      // 降级路径：没有 LLM 时直接使用规则引擎（永远可用的 fallback）
      return { adapter: 'rule_based_fallback', request };
    },
  };
}

export const AI_ENGINE_LABEL = AI.label;
export const AI_DISCLAIMER = AI.disclaimer;
