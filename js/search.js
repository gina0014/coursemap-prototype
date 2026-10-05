/* ============================================================================
   CourseMap（学途） — search.js
   ----------------------------------------------------------------------------
   检索单位 = Learning Resource（不是 Provider，也不是平台）。

   明确不做（与本项目一贯的工程纪律一致）：
     · 分词依赖 · 同义词推断 · 模糊纠错 · 向量检索 · LLM 调用
   学习目标的同义词只通过 learning-goals.aliases 显式维护。

   规则式检索的代价是没有语义理解，回报是**可解释、可复现、无幻觉**。
   ========================================================================== */

import { SEARCH } from './config.js';
import { normalizeText, stableSort, nullsLast } from './utils.js';
import { resourceSummary } from './derive.js';

/* ----------------------------------------------------------------------------
   匹配打分
   -------------------------------------------------------------------------- */

const SCORE = {
  goalExact: 1000,
  goalAliasExact: 920,
  goalPrefix: 800,
  goalContains: 560,
  titleExact: 900,
  titlePrefix: 720,
  titleContains: 520,
  skillContains: 300,
  subjectContains: 240,
  outcomeContains: 160,
  descriptionContains: 120,
};

function scoreAgainst(text, needle, exactScore, prefixScore, containsScore) {
  const haystack = normalizeText(text);
  if (!haystack) return 0;
  if (haystack === needle) return exactScore;
  if (haystack.startsWith(needle)) return prefixScore;
  if (haystack.includes(needle)) return containsScore;
  return 0;
}

function scoreGoal(goal, needle) {
  if (!goal || !needle) return 0;
  let best = scoreAgainst(goal.name, needle, SCORE.goalExact, SCORE.goalPrefix, SCORE.goalContains);
  for (const alias of goal.aliases || []) {
    best = Math.max(best, scoreAgainst(alias, needle, SCORE.goalAliasExact, SCORE.goalPrefix, SCORE.goalContains));
  }
  const desc = normalizeText(goal.description);
  if (desc && desc.includes(needle)) best = Math.max(best, SCORE.descriptionContains);
  return best;
}

function scoreResource(ctx, resource, needle) {
  const goal = resource._goalBest;
  let score = 0;

  // 学习目标命中（最高权重：搜索单位是目标驱动的资源）
  for (const goalId of resource.learning_goal_ids || []) {
    score = Math.max(score, scoreGoal(ctx.indexes.goalById.get(goalId), needle));
  }

  score = Math.max(score, scoreAgainst(
    resource.title, needle, SCORE.titleExact, SCORE.titlePrefix, SCORE.titleContains,
  ));

  for (const skillId of resource.skill_ids || []) {
    const skill = ctx.indexes.skillById.get(skillId);
    if (skill) score = Math.max(score, scoreAgainst(skill.name, needle, SCORE.skillContains, SCORE.skillContains, SCORE.skillContains));
  }
  const subject = ctx.indexes.subjectById.get(resource.subject_id);
  if (subject) {
    score = Math.max(score, scoreAgainst(subject.name, needle, SCORE.subjectContains, SCORE.subjectContains, SCORE.subjectContains));
  }
  for (const outcome of resource.learning_outcomes || []) {
    if (normalizeText(outcome).includes(needle)) {
      score = Math.max(score, SCORE.outcomeContains);
      break;
    }
  }
  if (normalizeText(resource.description).includes(needle)) {
    score = Math.max(score, SCORE.descriptionContains);
  }
  return score;
}

/* ----------------------------------------------------------------------------
   查询规格（URL query parameter 可分享、可回退）
   -------------------------------------------------------------------------- */

export function normalizeQuery(input = {}) {
  const intOrNull = (v) => {
    if (v === undefined || v === '' || v === null || v === 'all') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const numOrNull = (v) => {
    if (v === undefined || v === '' || v === null || v === 'all') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    q: (input.q || '').trim(),
    goal: intOrNull(input.goal),
    subject: intOrNull(input.subject),
    difficulty: input.difficulty && input.difficulty !== 'all' ? input.difficulty : null,
    budget: numOrNull(input.budget),
    language: input.language && input.language !== 'all' ? input.language : null,
    durationMax: numOrNull(input.dur),
    workloadMax: numOrNull(input.wl),
    cert: input.cert === '1' ? true : input.cert === '0' ? false : null,
    mode: input.mode && input.mode !== 'all' ? input.mode : null,
    provider: intOrNull(input.provider),
    verification: input.verification === 'verified' ? 'verified' : null,
    freeOnly: input.free === '1',
    sort: input.sort || SEARCH.defaultSort,
    page: Math.max(1, intOrNull(input.page) || 1),
  };
}

/* ----------------------------------------------------------------------------
   筛选
   -------------------------------------------------------------------------- */

function passesFilters(summary, query) {
  const { resource, provider, fee } = summary;

  if (query.goal !== null && !(resource.learning_goal_ids || []).includes(query.goal)) return false;
  if (query.subject !== null && resource.subject_id !== query.subject) return false;
  if (query.provider !== null && resource.provider_id !== query.provider) return false;
  if (query.difficulty !== null && resource.difficulty !== query.difficulty) return false;
  if (query.language !== null && resource.language !== query.language) return false;
  if (query.mode !== null && resource.learning_mode !== query.mode) return false;

  if (query.freeOnly) {
    if (!fee || fee.fee !== 0) return false;
  } else if (query.budget !== null) {
    // 费用未知 → **不**参与预算命中（不猜测费用）
    if (!fee || typeof fee.fee !== 'number') return false;
    if (fee.fee > query.budget) return false;
  }

  if (query.durationMax !== null) {
    if (typeof resource.duration_hours !== 'number') return false;
    if (resource.duration_hours > query.durationMax) return false;
  }

  if (query.workloadMax !== null) {
    if (typeof resource.weekly_workload_hours !== 'number') return false;
    if (resource.weekly_workload_hours > query.workloadMax) return false;
  }

  if (query.cert !== null) {
    if (resource.certificate_available !== query.cert) return false;
  }

  if (query.verification === 'verified') {
    const status = summary.fee?.verificationStatus;
    if (status !== 'editorial_verified' && status !== 'provider_confirmed') return false;
  }

  return true;
}

/* ----------------------------------------------------------------------------
   排序
   -------------------------------------------------------------------------- */

function compareFor(sort) {
  switch (sort) {
    case 'fee_asc':
      return (a, b) => nullsLast(a.fee ? a.fee.fee : null) - nullsLast(b.fee ? b.fee.fee : null);
    case 'fee_desc':
      return (a, b) => nullsLast(b.fee ? b.fee.fee : null) - nullsLast(a.fee ? a.fee.fee : null);
    case 'rating':
      return (a, b) => nullsLast(b.rating.overall) - nullsLast(a.rating.overall);
    case 'duration_asc':
      return (a, b) => nullsLast(a.resource.duration_hours) - nullsLast(b.resource.duration_hours);
    case 'workload_asc':
      return (a, b) => nullsLast(a.resource.weekly_workload_hours) - nullsLast(b.resource.weekly_workload_hours);
    case 'relevance':
    default:
      return (a, b) => (b._score || 0) - (a._score || 0);
  }
}

export function sortSummaries(rows, sort) {
  return stableSort(rows, compareFor(sort));
}

/* ----------------------------------------------------------------------------
   主查询
   -------------------------------------------------------------------------- */

/**
 * @returns {{rows, allRows, total, page, pageCount,
 *            mode: 'keyword'|'goal'|'browse', matchedGoals: Array}}
 */
export function searchResources(ctx, query) {
  const needle = normalizeText(query.q);
  const pool = query.goal !== null
    ? (ctx.indexes.resourcesByGoal.get(query.goal) || []).filter((r) => r.status === 'published')
    : ctx.resources.filter((r) => r.status === 'published');

  let scored = pool.map((resource) => ({ resource, score: needle ? scoreResource(ctx, resource, needle) : 1 }));
  if (needle) scored = scored.filter((entry) => entry.score > 0);

  let rows = [];
  for (const entry of scored) {
    const summary = resourceSummary(ctx, entry.resource);
    if (!summary) continue;
    if (!passesFilters(summary, query)) continue;
    summary._score = entry.score;
    rows.push(summary);
  }

  rows = sortSummaries(rows, query.sort);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / SEARCH.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * SEARCH.pageSize;

  return {
    rows: rows.slice(start, start + SEARCH.pageSize),
    allRows: rows,
    total,
    page,
    pageCount,
    mode: needle ? 'keyword' : (query.goal !== null ? 'goal' : 'browse'),
    matchedGoals: needle ? matchGoals(ctx, needle) : [],
  };
}

/* ----------------------------------------------------------------------------
   学习目标匹配（关键词 → 目标直达 / 跨资源对比入口）
   -------------------------------------------------------------------------- */

export function matchGoals(ctx, needleRaw) {
  const needle = normalizeText(needleRaw);
  if (!needle) return [];
  const out = [];
  for (const goal of ctx.goals) {
    const score = scoreGoal(goal, needle);
    if (score <= 0) continue;
    const count = (ctx.indexes.resourcesByGoal.get(goal.goal_id) || [])
      .filter((r) => r.status === 'published').length;
    out.push({ goal, score, resourceCount: count });
  }
  return out.sort((a, b) => (b.score - a.score) || (a.goal.goal_id - b.goal.goal_id));
}

/* ----------------------------------------------------------------------------
   Empty 状态的可执行放宽路径（数量运行时计算，禁止硬编码）
   -------------------------------------------------------------------------- */

export function suggestRelaxations(ctx, query) {
  const suggestions = [];
  const countWith = (patch) => searchResources(ctx, { ...query, ...patch, page: 1 }).total;

  if (query.budget !== null) {
    const ladder = SEARCH.budgetPresets.filter((value) => value > query.budget);
    for (const value of ladder) {
      suggestions.push({
        label: `把预算放宽到 ¥${value} 以内`,
        patch: { budget: value },
        count: countWith({ budget: value }),
      });
      if (suggestions.length >= 2) break;
    }
    suggestions.push({ label: '不限预算', patch: { budget: 'all' }, count: countWith({ budget: 'all' }) });
  }
  if (query.freeOnly) {
    suggestions.push({ label: '包含付费资源', patch: { free: '0' }, count: countWith({ free: '0' }) });
  }
  if (query.goal !== null) {
    suggestions.push({ label: '不限学习目标', patch: { goal: 'all' }, count: countWith({ goal: 'all' }) });
  }
  if (query.subject !== null) {
    suggestions.push({ label: '不限学科', patch: { subject: 'all' }, count: countWith({ subject: 'all' }) });
  }
  if (query.difficulty !== null) {
    suggestions.push({ label: '不限难度', patch: { difficulty: 'all' }, count: countWith({ difficulty: 'all' }) });
  }
  if (query.durationMax !== null) {
    suggestions.push({ label: '不限总时长', patch: { dur: 'all' }, count: countWith({ dur: 'all' }) });
  }
  if (query.workloadMax !== null) {
    suggestions.push({ label: '不限每周投入', patch: { wl: 'all' }, count: countWith({ wl: 'all' }) });
  }
  if (query.cert !== null) {
    suggestions.push({ label: '不限证书', patch: { cert: 'all' }, count: countWith({ cert: 'all' }) });
  }
  if (query.mode !== null) {
    suggestions.push({ label: '不限学习模式', patch: { mode: 'all' }, count: countWith({ mode: 'all' }) });
  }
  if (query.language !== null) {
    suggestions.push({ label: '不限语言', patch: { language: 'all' }, count: countWith({ language: 'all' }) });
  }
  if (query.provider !== null) {
    suggestions.push({ label: '不限提供方', patch: { provider: 'all' }, count: countWith({ provider: 'all' }) });
  }
  if (query.verification === 'verified') {
    suggestions.push({ label: '包含未核验费用', patch: { verification: 'all' }, count: countWith({ verification: 'all' }) });
  }

  return suggestions.filter((item) => item.count > 0);
}
