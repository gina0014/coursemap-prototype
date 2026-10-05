/* ============================================================================
   CourseMap（学途） — derive.js
   ----------------------------------------------------------------------------
   **唯一业务计算点**（单一真源原则）。
   页面与组件只消费本文件产出的派生结果，不得各自重复实现公式。

   核心规则：
     - 评分只由该资源自己的 published 评价聚合（不偷用 Provider 级信息）
     - 费用取 observed_at 最新的合格观测；费用未知 = null，禁止当成 0
     - 样本不足必须标记 limited（不给少量评价披上统计结论的外衣）
     - 对比统计全部运行时计算，禁止 hardcode
   ========================================================================== */

import { THRESHOLDS, FIT_SCORE } from './config.js';
import { daysSince } from './utils.js';
import { AGGREGATE_PROVENANCE, FEE_VERIFICATION } from './labels.js';

/* ----------------------------------------------------------------------------
   费用
   -------------------------------------------------------------------------- */

/**
 * 当前费用 = observed_at 最新的 published 观测（平局按 fee_observation_id 大者）。
 * 无任何观测时回退到 resources.fee 本身（登记值），仍带 observed_at。
 * @returns null | {fee, currency, observedAt, ageDays, needsRecheck, verificationStatus, feeType}
 */
export function currentFee(ctx, resourceId) {
  const rows = (ctx.indexes.feesByResource.get(resourceId) || [])
    .filter((r) => r.status === 'published');
  let latest = null;
  for (const row of rows) {
    if (!latest || row.observed_at > latest.observed_at
      || (row.observed_at === latest.observed_at && row.fee_observation_id > latest.fee_observation_id)) {
      latest = row;
    }
  }
  const resource = ctx.indexes.resourceById.get(resourceId);
  if (!latest) {
    // 回退登记值：同样必须带观测日期
    if (!resource || resource.fee === null || resource.fee === undefined) return null;
    return {
      fee: resource.fee,
      currency: resource.currency,
      observedAt: resource.observed_at,
      ageDays: daysSince(resource.observed_at),
      needsRecheck: daysSince(resource.observed_at) > THRESHOLDS.feeRecheckDays,
      verificationStatus: resource.verification_status,
      feeType: 'full',
      fromObservation: false,
    };
  }
  return {
    fee: latest.fee,
    currency: latest.currency,
    observedAt: latest.observed_at,
    ageDays: daysSince(latest.observed_at),
    needsRecheck: daysSince(latest.observed_at) > THRESHOLDS.feeRecheckDays,
    verificationStatus: latest.verification_status,
    feeType: latest.fee_type,
    fromObservation: true,
  };
}

export function feeVerificationTone(status) {
  const meta = pickMeta(FEE_VERIFICATION, status);
  return meta && meta.tone === 'verified' ? 'verified' : (meta && meta.tone === 'unknown' ? 'unknown' : 'unverified');
}

function pickMeta(map, key) {
  if (!key) return null;
  const entry = map[key];
  return entry || null;
}

/* ----------------------------------------------------------------------------
   评分聚合（评价对象 = Learning Resource，不是 Provider）
   -------------------------------------------------------------------------- */

export function ratingSampleState(count) {
  if (!count || count <= 0) return 'none';
  return count < THRESHOLDS.ratingMinSample ? 'limited' : 'sufficient';
}

export function aggregateProvenance(reviews) {
  if (!reviews.length) return 'none';
  const hasDemo = reviews.some((r) => (r.data_class || 'demo') === 'demo' || r.review_origin === 'demo_dataset');
  const hasReal = reviews.some((r) => (r.data_class || 'demo') === 'real' && r.review_origin !== 'demo_dataset');
  if (hasDemo && hasReal) return 'mixed';
  if (hasReal) return 'real_only';
  return 'demo_only';
}

/**
 * @returns {overall:number|null, count, sampleState, provenance,
 *           wouldRecommendPct:number|null, dimensions:{contentQuality, difficultyMatch, practicalValue, workloadAccuracy}}
 */
export function ratingAggregate(ctx, resourceId) {
  const rows = (ctx.indexes.reviewsByResource.get(resourceId) || [])
    .filter((r) => r.status === 'published');
  const count = rows.length;
  const provenance = aggregateProvenance(rows);
  const overall = count === 0
    ? null
    : rows.reduce((s, r) => s + r.overall_rating, 0) / count;
  const recommends = rows.filter((r) => r.would_recommend === true).length;
  const mean = (key) => (count === 0 ? null : rows.reduce((s, r) => s + (r[key] ?? 0), 0) / count);
  return {
    overall,
    count,
    sampleState: ratingSampleState(count),
    provenance,
    wouldRecommendPct: count === 0 ? null : Math.round((recommends / count) * 100),
    dimensions: {
      contentQuality: mean('content_quality'),
      difficultyMatch: mean('difficulty_match'),
      practicalValue: mean('practical_value'),
      workloadAccuracy: mean('workload_accuracy'),
    },
  };
}

/* ----------------------------------------------------------------------------
   资源摘要（页面渲染的标准输入）
   -------------------------------------------------------------------------- */

/**
 * @returns null | {
 *   resource, provider, subject, goals: Skill 下拉引用, skills,
 *   fee, rating, isDemo, prereqSkills, pathsCovering
 * }
 */
export function resourceSummary(ctx, resource) {
  if (!resource) return null;
  const provider = ctx.indexes.providerById.get(resource.provider_id) || null;
  const subject = ctx.indexes.subjectById.get(resource.subject_id) || null;
  const goals = (resource.learning_goal_ids || [])
    .map((id) => ctx.indexes.goalById.get(id)).filter(Boolean);
  const skills = (resource.skill_ids || [])
    .map((id) => ctx.indexes.skillById.get(id)).filter(Boolean);
  const prereqSkills = (resource.prerequisite_skill_ids || [])
    .map((id) => ctx.indexes.skillById.get(id)).filter(Boolean);
  return {
    resource,
    provider,
    subject,
    goals,
    skills,
    prereqSkills,
    fee: currentFee(ctx, resource.resource_id),
    rating: ratingAggregate(ctx, resource.resource_id),
    isDemo: resource.data_class === 'demo',
  };
}

/* ----------------------------------------------------------------------------
   同目标对比（P-05 的教育领域重构）
   ----------------------------------------------------------------------------
   比较单位：同一 Learning Goal 下的多个 Learning Resources。
   统计全部运行时计算；缺失费用/时长不参与 min/max，也不计为 0。
   -------------------------------------------------------------------------- */

export function goalComparison(ctx, goalId) {
  const goal = ctx.indexes.goalById.get(goalId) || null;
  const rows = (ctx.indexes.resourcesByGoal.get(goalId) || [])
    .filter((r) => r.status === 'published')
    .map((r) => resourceSummary(ctx, r))
    .filter(Boolean);

  const feeValues = rows.map((s) => (s.fee ? s.fee.fee : null)).filter((v) => typeof v === 'number');
  const durationValues = rows.map((s) => s.resource.duration_hours)
    .filter((v) => typeof v === 'number');
  const ratingValues = rows.map((s) => s.rating.overall).filter((v) => typeof v === 'number');

  const min = (arr) => (arr.length ? Math.min(...arr) : null);
  const max = (arr) => (arr.length ? Math.max(...arr) : null);

  const feeStats = {
    min: min(feeValues),
    max: max(feeValues),
    spread: feeValues.length ? Math.round((Math.max(...feeValues) - Math.min(...feeValues)) * 100) / 100 : null,
    withFee: feeValues.length,
    withoutFee: rows.length - feeValues.length,
    available: feeValues.length > 0,
    cheapest: pickBy(rows, (s) => (s.fee ? s.fee.fee : null), 'min'),
  };
  const durationStats = {
    min: min(durationValues),
    max: max(durationValues),
    shortest: pickBy(rows, (s) => s.resource.duration_hours, 'min'),
    longest: pickBy(rows, (s) => s.resource.duration_hours, 'max'),
    available: durationValues.length > 0,
  };
  const ratingStats = {
    max: max(ratingValues),
    best: pickBy(rows, (s) => s.rating.overall, 'max'),
    available: ratingValues.length > 0,
  };

  const providerCount = new Set(rows.map((s) => (s.provider ? s.provider.provider_id : null))).size;

  return {
    goal,
    rows,
    resourceCount: rows.length,
    providerCount,
    feeStats,
    durationStats,
    ratingStats,
  };
}

function pickBy(rows, getter, mode) {
  let best = null;
  for (const row of rows) {
    const value = getter(row);
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    if (!best || (mode === 'min' ? value < getter(best) : value > getter(best))) best = row;
  }
  return best;
}

/* ----------------------------------------------------------------------------
   技能图（轻量 JSON adjacency）
   -------------------------------------------------------------------------- */

/** 某技能的全部（传递闭包）前置技能，按拓扑序返回（先修在前）。 */
export function skillPrerequisiteChain(ctx, skillId) {
  const chain = [];
  const seen = new Set([skillId]);
  const visit = (id) => {
    const skill = ctx.indexes.skillById.get(id);
    if (!skill) return;
    for (const pid of skill.prerequisite_skill_ids || []) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      visit(pid);
      chain.push(pid);
    }
  };
  visit(skillId);
  return chain.map((id) => ctx.indexes.skillById.get(id)).filter(Boolean);
}

/** 目标的前置目标链（按依赖顺序展开，不含自身）。 */
export function goalPrerequisiteChain(ctx, goalId) {
  const chain = [];
  const seen = new Set([goalId]);
  const visit = (id) => {
    const goal = ctx.indexes.goalById.get(id);
    if (!goal) return;
    for (const pid of goal.prerequisite_goal_ids || []) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      visit(pid);
      chain.push(pid);
    }
  };
  visit(goalId);
  return chain.map((id) => ctx.indexes.goalById.get(id)).filter(Boolean);
}

/* ----------------------------------------------------------------------------
   学习路径视图
   -------------------------------------------------------------------------- */

/**
 * @returns null | {path, goals, steps: [{step, skill, goal, core: summaries, optional: summaries}]}
 */
export function pathView(ctx, pathId) {
  const path = ctx.indexes.pathById.get(pathId);
  if (!path) return null;
  const steps = (ctx.indexes.stepsByPath.get(pathId) || [])
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      step,
      skill: step.skill_id ? ctx.indexes.skillById.get(step.skill_id) || null : null,
      goal: step.goal_id ? ctx.indexes.goalById.get(step.goal_id) || null : null,
      core: (step.core_resource_ids || [])
        .map((id) => resourceSummary(ctx, ctx.indexes.resourceById.get(id)))
        .filter(Boolean),
      optional: (step.optional_resource_ids || [])
        .map((id) => resourceSummary(ctx, ctx.indexes.resourceById.get(id)))
        .filter(Boolean),
    }));
  return {
    path,
    goals: (path.goal_ids || []).map((id) => ctx.indexes.goalById.get(id)).filter(Boolean),
    steps,
  };
}

/** 覆盖某目标的路径（供「从 Goal 进入 Learning Path」使用）。 */
export function pathsCoveringGoal(ctx, goalId) {
  return ctx.paths.filter((p) => (p.goal_ids || []).includes(goalId));
}

/* ----------------------------------------------------------------------------
   实验性学习适配分（接口位；v0.1 不计算）
   -------------------------------------------------------------------------- */

/**
 * v0.1 明确返回 unavailable：教育效果无法由输入字段加权合成。
 * 未来实现必须：展示组成部分与权重、保持 experimental=true、可关闭。
 */
export function learningFitScore() {
  return { available: false, value: null, experimental: FIT_SCORE.experimental, frozen: FIT_SCORE.frozen, reason: FIT_SCORE.disclaimer };
}

/** Provider 详情：Provider 级信息 ≠ Resource 级质量（不合成 Provider 评分）。 */
export function providerView(ctx, providerId) {
  const provider = ctx.indexes.providerById.get(providerId);
  if (!provider) return null;
  const resources = (ctx.indexes.resourcesByProvider.get(providerId) || [])
    .filter((r) => r.status === 'published')
    .map((r) => resourceSummary(ctx, r))
    .filter(Boolean);
  const subjectIds = new Set(resources.map((s) => s.subject?.subject_id).filter(Boolean));
  const goalIds = new Set();
  for (const s of resources) for (const g of s.goals) goalIds.add(g.goal_id);
  return {
    provider,
    resources,
    subjects: [...subjectIds].map((id) => ctx.indexes.subjectById.get(id)).filter(Boolean),
    goalsCovered: [...goalIds].map((id) => ctx.indexes.goalById.get(id)).filter(Boolean),
  };
}
