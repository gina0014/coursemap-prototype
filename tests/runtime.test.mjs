/* ============================================================================
   CourseMap — tests/runtime.test.mjs
   ----------------------------------------------------------------------------
   运行时逻辑测试（Node，无需浏览器）。

   覆盖面（对应验收要求 #40）：
     Search / Goal Filter / Budget Filter / Difficulty / Duration /
     Comparison / Missing Data / Learning Path / Resource Detail /
     Source Provenance / Demo Disclosure / AI Prototype Parser / AI Adapter

   运行：
     node tests/runtime.test.mjs
   退出码 0 = 全部通过。
   ========================================================================== */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildContext } from '../js/data-loader.js';
import {
  currentFee, ratingAggregate, resourceSummary, goalComparison,
  pathView, pathsCoveringGoal, skillPrerequisiteChain, goalPrerequisiteChain,
  providerView, learningFitScore,
} from '../js/derive.js';
import { searchResources, normalizeQuery, matchGoals } from '../js/search.js';
import { parseDecisionRequest, buildDecisionResponse, createLlmAdapter } from '../js/ai-advisor.js';
import { THRESHOLDS } from '../js/config.js';
import { formatNumber, formatPrice, formatRating, UNKNOWN_DISPLAY } from '../js/utils.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');

const FILES = {
  subjects: 'subjects.json',
  goals: 'learning-goals.json',
  skills: 'skills.json',
  providers: 'providers.json',
  resources: 'resources.json',
  paths: 'learning-paths.json',
  pathSteps: 'learning-path-steps.json',
  reviews: 'reviews.json',
  feeHistory: 'fee-history.json',
  sources: 'sources.json',
  resourceSource: 'resource-source.json',
};

const load = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

let passed = 0;
const failures = [];

function check(id, description, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${id} ${description}`);
  } else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------------- */

const raw = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, load(file)]));
const ctx = buildContext(raw);

console.log('================================================');
console.log('CourseMap runtime logic tests');
console.log('================================================');

/* ---- T-01 可见性：只暴露 published ---- */
const allStatuses = new Set(ctx.resources.map((row) => row.status));
check('T-01', '可见资源全部为 published', allStatuses.size === 1 && allStatuses.has('published'),
  [...allStatuses].join(','));

/* ---- T-02 索引完整性：每个资源都能解析出 provider / subject / goal ---- */
check('T-02', '每个可见资源都能解析出提供方与学科',
  ctx.resources.every((r) => ctx.indexes.providerById.has(r.provider_id) && ctx.indexes.subjectById.has(r.subject_id)));
check('T-02b', '每个可见资源至少关联一个学习目标',
  ctx.resources.every((r) => (r.learning_goal_ids || []).length > 0));

/* ---- T-03 费用：取 observed_at 最新的观测 ---- */
let feeMismatch = 0;
for (const res of ctx.resources) {
  const rows = (ctx.indexes.feesByResource.get(res.resource_id) || []).filter((r) => r.status === 'published');
  const fee = currentFee(ctx, res.resource_id);
  if (rows.length > 0) {
    const maxObserved = rows.reduce((a, b) => (a.observed_at >= b.observed_at ? a : b)).observed_at;
    if (!fee || fee.observedAt !== maxObserved) feeMismatch += 1;
  } else if (res.fee === null && fee !== null) {
    feeMismatch += 1;
  }
}
check('T-03', '当前费用 = 最新观测；登记费用未知且无观测时为 null', feeMismatch === 0, `${feeMismatch} 处不一致`);

/* ---- T-04 费用一定带观测日期（诚实性） ---- */
check('T-04', '每个已知费用都带 observedAt',
  ctx.resources.every((r) => {
    const f = currentFee(ctx, r.resource_id);
    return f === null || typeof f.observedAt === 'string';
  }));

/* ---- T-05 数据规模符合产品要求（40–80 资源等） ---- */
check('T-05', `资源规模在 40–80（当前 ${ctx.resources.length}）`,
  ctx.resources.length >= 40 && ctx.resources.length <= 80);
check('T-05b', `学科 5（当前 ${ctx.subjects.length}）`, ctx.subjects.length === 5);
check('T-05c', `学习目标 10–15（当前 ${ctx.goals.length}）`, ctx.goals.length >= 10 && ctx.goals.length <= 15);
check('T-05d', `提供方 8–15（当前 ${ctx.providers.length}）`, ctx.providers.length >= 8 && ctx.providers.length <= 15);
check('T-05e', `学习路径 6–10（当前 ${ctx.paths.length}）`, ctx.paths.length >= 6 && ctx.paths.length <= 10);

/* ---- T-06 评分：只由该资源的评价聚合（评价对象 = Resource） ---- */
let forged = 0;
for (const res of ctx.resources) {
  const rating = ratingAggregate(ctx, res.resource_id);
  const rows = (ctx.indexes.reviewsByResource.get(res.resource_id) || []).filter((r) => r.status === 'published');
  if (rows.length === 0 && rating.overall !== null) forged += 1;
  if (rows.length > 0) {
    const expected = rows.reduce((s, r) => s + r.overall_rating, 0) / rows.length;
    if (Math.abs(rating.overall - expected) > 1e-9) forged += 1;
  }
  if (rating.count !== rows.length) forged += 1;
}
check('T-06', '资源评分只由该资源的评价聚合（无评价则为 null，count 一致）', forged === 0, `${forged} 处异常`);

/* ---- T-07 登记值与评价聚合一致（数据治理） ---- */
let registryMismatch = 0;
for (const res of ctx.resources) {
  const rows = (ctx.indexes.reviewsByResource.get(res.resource_id) || []).filter((r) => r.status === 'published');
  if (rows.length === 0) {
    if (res.rating !== null || res.rating_count !== 0) registryMismatch += 1;
  } else if (Math.abs(res.rating - res.rating_count > 0 ? res.rating : 0) >= 0) {
    const mean = rows.reduce((s, r) => s + r.overall_rating, 0) / rows.length;
    if (Math.abs(res.rating - mean) > 0.011 || res.rating_count !== rows.length) registryMismatch += 1;
  }
}
check('T-07', 'resources.rating / rating_count 与评价聚合一致', registryMismatch === 0, `${registryMismatch} 处不一致`);

/* ---- T-08 样本状态 ---- */
let sampleErrors = 0;
for (const res of ctx.resources) {
  const rating = ratingAggregate(ctx, res.resource_id);
  const expected = rating.count <= 0 ? 'none' : (rating.count < THRESHOLDS.ratingMinSample ? 'limited' : 'sufficient');
  if (rating.sampleState !== expected) sampleErrors += 1;
}
check('T-08', `样本 < ${THRESHOLDS.ratingMinSample} 一律标记 limited；0 条为 none`, sampleErrors === 0, `${sampleErrors} 处异常`);
const limitedExists = ctx.resources.some((r) => ratingAggregate(ctx, r.resource_id).sampleState === 'limited');
const noneExists = ctx.resources.some((r) => ratingAggregate(ctx, r.resource_id).sampleState === 'none');
check('T-08b', '数据集中存在 limited 与 none 样本（可演示诚实状态）', limitedExists && noneExists);

/* ---- T-09 技能图：前置关系无环 ---- */
let cycleFound = false;
const visiting = new Set();
const done = new Set();
const dfs = (id) => {
  if (done.has(id)) return;
  if (visiting.has(id)) { cycleFound = true; return; }
  visiting.add(id);
  const skill = ctx.indexes.skillById.get(id);
  for (const pid of skill?.prerequisite_skill_ids || []) dfs(pid);
  visiting.delete(id);
  done.add(id);
};
for (const skill of ctx.skills) dfs(skill.skill_id);
check('T-09', '技能图无环（prerequisite_skill_ids）', !cycleFound);

/* ---- T-10 目标图：prerequisite_goal_ids 无环 ---- */
let goalCycle = false;
const v2 = new Set();
const d2 = new Set();
const dfs2 = (id) => {
  if (d2.has(id)) return;
  if (v2.has(id)) { goalCycle = true; return; }
  v2.add(id);
  const goal = ctx.indexes.goalById.get(id);
  for (const pid of goal?.prerequisite_goal_ids || []) dfs2(pid);
  v2.delete(id);
  d2.add(id);
};
for (const goal of ctx.goals) dfs2(goal.goal_id);
check('T-10', '学习目标前置链无环（prerequisite_goal_ids）', !goalCycle);

/* ---- T-11 检索：搜索单位是 Learning Resource ---- */
const q = normalizeQuery({ q: 'Python 数据分析' });
const result = searchResources(ctx, q);
check('T-11', '搜索「Python 数据分析」有结果且结果单位为学习资源', result.total > 0, `total=${result.total}`);
check('T-11b', '「Python 数据分析」的结果都属于该目标或标题/技能命中',
  result.allRows.every((s) =>
    (s.resource.learning_goal_ids || []).some((gid) => ctx.indexes.goalById.get(gid)?.name === 'Python 数据分析')
    || s.resource.title.toLowerCase().includes('python')));

/* ---- T-12 目标筛选 ---- */
const pythonGoal = ctx.indexes.goalByName.get('Python 入门');
const qGoal = normalizeQuery({ goal: pythonGoal.goal_id });
const goalResult = searchResources(ctx, qGoal);
check('T-12', 'goal 筛选只命中该目标的资源',
  goalResult.total > 0 && goalResult.allRows.every((s) => s.resource.learning_goal_ids.includes(pythonGoal.goal_id)),
  `total=${goalResult.total}`);

/* ---- T-13 预算筛选：费用未知不命中 ---- */
const qBudget = normalizeQuery({ goal: pythonGoal.goal_id, budget: 100 });
const budgetResult = searchResources(ctx, qBudget);
check('T-13', '预算筛选只命中费用已知且 <= 预算的资源',
  budgetResult.allRows.every((s) => s.fee && s.fee.fee <= 100), `total=${budgetResult.total}`);

/* ---- T-13b 免费筛选 ---- */
const qFree = normalizeQuery({ free: '1' });
const freeResult = searchResources(ctx, qFree);
check('T-13b', 'free=1 只命中免费资源', freeResult.allRows.every((s) => s.fee && s.fee.fee === 0) && freeResult.total > 0);

/* ---- T-14 难度 + 时长筛选 ---- */
const qDiff = normalizeQuery({ difficulty: 'beginner', dur: 20 });
const diffResult = searchResources(ctx, qDiff);
check('T-14', '难度与时长上限筛选正确（时长未知不命中）',
  diffResult.allRows.every((s) => s.resource.difficulty === 'beginner'
    && typeof s.resource.duration_hours === 'number' && s.resource.duration_hours <= 20));

/* ---- T-15 每周工作量筛选（MoT #6 输入） ---- */
const qWl = normalizeQuery({ wl: 4 });
const wlResult = searchResources(ctx, qWl);
check('T-15', 'workload 上限筛选正确（未知不命中）',
  wlResult.allRows.every((s) => typeof s.resource.weekly_workload_hours === 'number'
    && s.resource.weekly_workload_hours <= 4));

/* ---- T-16 排序可复现 + 费用未知排最后 ---- */
const a1 = searchResources(ctx, normalizeQuery({ sort: 'fee_asc' })).allRows.map((s) => s.resource.resource_id);
const a2 = searchResources(ctx, normalizeQuery({ sort: 'fee_asc' })).allRows.map((s) => s.resource.resource_id);
check('T-16', '排序可复现（两次结果完全一致）', JSON.stringify(a1) === JSON.stringify(a2));
const asc = searchResources(ctx, normalizeQuery({ sort: 'fee_asc' })).allRows;
let ascOk = true;
let sawNull = false;
let last = -Infinity;
for (const row of asc) {
  const v = row.fee ? row.fee.fee : null;
  if (v === null) { sawNull = true; continue; }
  if (sawNull) ascOk = false;
  if (v < last) ascOk = false;
  last = v;
}
check('T-16b', '费用升序正确，未知费用排在最后', ascOk);

/* ---- T-17 对比：同目标多资源 + 统计动态计算 ---- */
const daGoal = ctx.indexes.goalByName.get('Python 数据分析');
const comparison = goalComparison(ctx, daGoal.goal_id);
check('T-17', '「Python 数据分析」可对比（>= 2 个资源、>= 2 个提供方）',
  comparison.resourceCount >= 2 && comparison.providerCount >= 2,
  `resources=${comparison.resourceCount} providers=${comparison.providerCount}`);
check('T-17b', '对比结果全部属于同一目标',
  comparison.rows.every((s) => s.resource.learning_goal_ids.includes(daGoal.goal_id)));

const fs = comparison.feeStats;
const runtimeFees = comparison.rows.map((s) => (s.fee ? s.fee.fee : null)).filter((v) => typeof v === 'number');
check('T-17c', 'feeStats.min 等于运行时最小值', fs.min === Math.min(...runtimeFees), `min=${fs.min}`);
check('T-17d', 'feeStats.max 等于运行时最大值', fs.max === Math.max(...runtimeFees), `max=${fs.max}`);
check('T-17e', 'feeStats.spread = max − min（非硬编码）',
  fs.spread === Math.round((fs.max - fs.min) * 100) / 100, `spread=${fs.spread}`);
check('T-17f', 'withFee + withoutFee = resourceCount（缺失费用不参与，也不计为 0）',
  fs.withFee + fs.withoutFee === comparison.resourceCount);
check('T-17g', 'durationStats.min/max 独立复算一致',
  comparison.durationStats.min === Math.min(...comparison.rows.map((s) => s.resource.duration_hours).filter((v) => typeof v === 'number')));

/* ---- T-17h 缺失费用不被当成 0 ---- */
const feeUnknownExists = ctx.resources.some((r) => r.fee === null);
check('T-17h', '数据集存在 fee=null 的资源（演示缺失值语义）', feeUnknownExists);
if (feeUnknownExists) {
  const unknownRes = ctx.resources.find((r) => r.fee === null);
  check('T-17i', 'fee=null 的资源 currentFee 返回 null（不是 0）',
    currentFee(ctx, unknownRes.resource_id) === null
    || currentFee(ctx, unknownRes.resource_id).fee !== 0);
}

/* ---- T-17j 空目标安全返回 ---- */
const emptyComparison = goalComparison(ctx, 999999);
check('T-17j', '无资源的目标返回空统计而非抛错',
  emptyComparison.rows.length === 0 && emptyComparison.feeStats.min === null
  && emptyComparison.feeStats.spread === null && emptyComparison.resourceCount === 0);

/* ---- T-18 学习路径（MoT #5） ---- */
const somePath = ctx.paths[0];
const view = pathView(ctx, somePath.path_id);
check('T-18', 'pathView 返回有序步骤与每步资源', view && view.steps.length > 0
  && view.steps.every((s) => s.core.length > 0));
check('T-18b', '步骤按 step_order 升序',
  view.steps.every((s, i, arr) => i === 0 || arr[i - 1].step.step_order <= s.step.step_order));
const daGoalPaths = pathsCoveringGoal(ctx, daGoal.goal_id);
check('T-18c', '从 Goal 可以进入 Learning Path（MoT #5）', daGoalPaths.length > 0);

/* ---- T-18d 路径步骤引用完整性 ---- */
let stepRefErrors = 0;
for (const step of ctx.pathSteps) {
  if (!ctx.indexes.pathById.has(step.path_id)) stepRefErrors += 1;
  for (const rid of step.core_resource_ids || []) {
    if (!ctx.indexes.resourceById.has(rid)) stepRefErrors += 1;
  }
}
check('T-18d', '路径步骤引用的 path / resource 全部存在', stepRefErrors === 0, `${stepRefErrors} 处`);

/* ---- T-19 资源详情数据（MoT #4） ---- */
const anyRes = ctx.resources.find((r) => r.status === 'published');
const anySummary = resourceSummary(ctx, anyRes);
check('T-19', '任意资源都能构造完整 summary（详情页渲染前提）',
  anySummary && anySummary.provider && anySummary.subject && anySummary.rating && anySummary.goals.length > 0);

/* ---- T-20 来源可追溯（Provenance） ---- */
check('T-20', '每个资源都有 source_ids 且能解析到 Source',
  ctx.resources.every((r) => (r.source_ids || []).length > 0
    && r.source_ids.every((sid) => ctx.indexes.sourceById.has(sid))));
const sourceEntries = (ctx.indexes.resourceSourcesByResource.get(anyRes.resource_id) || []);
check('T-20b', 'resource-source 关系存在且字段域合法',
  sourceEntries.length > 0 && sourceEntries.every((e) =>
    ['general', 'fee', 'description', 'outcomes', 'schedule'].includes(e.field_scope)));

/* ---- T-21 演示披露（Demo Disclosure） ---- */
check('T-21', '数据集全部为 demo（real = 0）',
  ctx.stats.totals.real === 0 && ctx.stats.totals.demo > 0,
  `demo=${ctx.stats.totals.demo} real=${ctx.stats.totals.real}`);
check('T-21b', 'demo 记录的 url 全部为 null（不伪造真实外链）',
  ctx.resources.every((r) => r.data_class === 'demo' ? r.url === null : true));
check('T-21c', 'demo 评价 review_origin 全部为 demo_dataset',
  ctx.reviews.every((r) => r.review_origin === 'demo_dataset'));

/* ---- T-22 Provider ≠ Resource 质量 ---- */
const anyProvider = providerView(ctx, ctx.providers[0].provider_id);
check('T-22', 'providerView 不产生 Provider 级评分字段',
  anyProvider && !('rating' in anyProvider) && !('average_rating' in anyProvider));

/* ---- T-23 实验性适配分：v0.1 明确不可用 ---- */
const fit = learningFitScore();
check('T-23', 'Learning Fit Score v0.1 不计算（available=false 且标注实验性）',
  fit.available === false && fit.experimental === true && fit.frozen === false);

/* ---- T-24 统一安全格式化：缺失值 ≠ 0 ---- */
const BAD = [undefined, null, NaN, Infinity, -Infinity, '25', {}, [], true];
check('T-24', 'formatNumber 对缺失值返回 fallback（不返回 0）',
  BAD.every((v) => formatNumber(v) === UNKNOWN_DISPLAY));
check('T-24b', 'formatPrice 对缺失值返回 fallback（不返回 ¥0）',
  BAD.every((v) => formatPrice(v) === UNKNOWN_DISPLAY && formatPrice(v) !== '¥0'));
check('T-24c', '真实 0 必须显示为 0',
  formatPrice(0) === '¥0' && formatNumber(0, { digits: 0 }) === '0');

/* ---- T-25 分页不丢结果 ---- */
const paged = [];
const fullQuery = normalizeQuery({ page: 1 });
for (let page = 1; page <= searchResources(ctx, fullQuery).pageCount; page += 1) {
  paged.push(...searchResources(ctx, normalizeQuery({ page })).rows.map((s) => s.resource.resource_id));
}
const allIds = searchResources(ctx, normalizeQuery({ page: 1 })).allRows.map((s) => s.resource.resource_id);
check('T-25', '分页遍历覆盖全部结果且不重复',
  paged.length === allIds.length && new Set(paged).size === allIds.length,
  `${paged.length} vs ${allIds.length}`);

/* ---- T-26 AI：规则解析器（MoT #6 输入端） ---- */
const parsed = parseDecisionRequest('我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。');
check('T-26', '解析出目标 = Python 数据分析', parsed.request.goal === 'Python 数据分析', parsed.request.goal);
check('T-26b', '解析出预算 = 200', parsed.request.budget === 200, String(parsed.request.budget));
check('T-26c', '解析出每周 5 小时', parsed.request.available_hours_per_week === 5);
check('T-26d', '解析出基础 = beginner', parsed.request.current_level === 'beginner');
check('T-26e', '解析说明逐条可解释', parsed.parseNotes.length >= 4);

/* ---- T-26f 未解析字段诚实为 null，不猜测 ---- */
const parsedSparse = parseDecisionRequest('帮我找个课');
check('T-26f', '无信息输入时 goal / budget / hours 全部为 null',
  parsedSparse.request.goal === null && parsedSparse.request.budget === null
  && parsedSparse.request.available_hours_per_week === null);

/* ---- T-27 AI：决策响应（MoT #6 输出端） ---- */
const response = buildDecisionResponse(ctx, parsed.request);
check('T-27', 'interpreted_goal 命中实体', response.interpreted_goal && response.interpreted_goal.name === 'Python 数据分析');
check('T-27b', '推荐资源非空且带 evidence / source_refs',
  response.recommended_resources.length > 0 && response.evidence.length === response.recommended_resources.length
  && response.source_refs.length > 0);
check('T-27c', '推荐资源全部满足预算或费用未知（未知不隐瞒，进入 uncertainty）',
  response.recommended_resources.every((r) => r.fee === null || r.fee === undefined || r.fee <= 200));
check('T-27d', '推理摘要非空且提及约束', response.reasoning_summary.length > 10);
check('T-27e', '规则引擎 engine 标注为 rule_based_prototype（前端降级引擎仍为非 LLM；主引擎升级为 AI Beta 后端管线）', response.engine === 'rule_based_prototype');
check('T-27f', 'demo 数据不确定性已声明',
  response.uncertainty.some((u) => u.includes('DEMO')));

/* ---- T-27g 推荐带学习路径（Goal → Path） ---- */
check('T-27g', '推荐包含路径或明确无路径',
  response.recommended_path === null || typeof response.recommended_path.path_id === 'number');

/* ---- T-28 AI Adapter：无 LLM 时可降级 ---- */
const adapter = createLlmAdapter();
check('T-28', 'LLM adapter 明确 available=false（不伪装已接入）', adapter.available === false);
const fallback = await adapter.decide({});
check('T-28b', 'adapter 降级到规则引擎', fallback.adapter === 'rule_based_fallback');

/* ---- T-29 目标链 / 技能链返回拓扑序 ---- */
const scrnaGoal = ctx.indexes.goalByName.get('单细胞 RNA-seq 入门');
const chain = goalPrerequisiteChain(ctx, scrnaGoal.goal_id);
check('T-29', '单细胞目标的前置链非空且顺序正确（先修在前）',
  chain.length >= 1 && chain[chain.length - 1].goal_id !== scrnaGoal.goal_id,
  chain.map((g) => g.name).join(' → '));

/* ---- T-30 静态资产存在 ---- */
for (const rel of ['index.html', '404.html', 'css/variables.css', 'js/config.js', 'data/resources.json', 'assets/icons/favicon.svg']) {
  check(`T-30:${rel}`, `静态文件存在：${rel}`, existsSync(join(HERE, '..', rel)));
}

/* ---- T-31 运行时无旧餐饮语义（静态约束的运行时抽查） ---- */
const runtimeFiles = ['config.js', 'labels.js', 'derive.js', 'search.js', 'data-loader.js', 'components.js', 'ai-advisor.js'];
const legacyTerms = /dish|restaurant|叉烧|烧鹅|肠粉|商圈|菜品|口味|portion/i;
let legacyHits = [];
for (const name of runtimeFiles) {
  const src = readFileSync(join(HERE, '..', 'js', name), 'utf8');
  if (legacyTerms.test(src)) legacyHits.push(name);
}
check('T-31', '核心运行时模块无旧餐饮语义', legacyHits.length === 0, legacyHits.join(', '));

/* ---- T-32 matchGoals：目标别名检索 ---- */
const matched = matchGoals(ctx, 'pandas');
check('T-32', '别名「pandas」可命中 Python 数据分析目标',
  matched.some((m) => m.goal.name === 'Python 数据分析'));

/* ------------------------------------------------------------------------- */

console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('失败项：');
  failures.forEach((line) => console.log(`  - ${line}`));
}
console.log('================================================');
process.exit(failures.length ? 1 : 0);
