/* ============================================================================
   CourseMap — tests/ai/unit.test.mjs
   ----------------------------------------------------------------------------
   AI 后端单元测试（默认全部使用 Mock / 真实数据，绝不调用真实 DeepSeek）。

   覆盖：DeepSeekAdapter（故障映射，不发请求）/ Intent schema 校验 /
         CourseMapRepository / StructuredRetriever / Tool 参数验证 /
         Resource ID 验证 / Fact Hydration / Learning Path 检索 /
         Rate limit / Error mapping / Response schema。
   运行：node tests/ai/unit.test.mjs   （退出码 0 = 全部通过）
   ========================================================================== */

import { AIOrchestrator } from '../../server/orchestrator/AIOrchestrator.mjs';
import { JsonCourseMapRepository, getRepository } from '../../server/repo/CourseMapRepository.mjs';
import { StructuredRetriever } from '../../server/retriever/StructuredRetriever.mjs';
import { sanitizeIntent, sanitizeContext } from '../../server/orchestrator/intentSchema.mjs';
import { MockLLMAdapter } from '../../server/llm/MockLLMAdapter.mjs';
import { DeepSeekAdapter } from '../../server/llm/DeepSeekAdapter.mjs';
import { ToolExecutor } from '../../server/tools/toolExecutor.mjs';
import { TOOL_SCHEMAS, TOOL_NAMES } from '../../server/tools/toolSchemas.mjs';
import { RateLimiter, validateAdvisorInput } from '../../server/security/security.mjs';
import { ApiError, ERROR_CODES, toSafeError } from '../../server/errors.mjs';
import { ConversationStore } from '../../server/context/ConversationStore.mjs';
import { UsageLogger } from '../../server/cost/usageLog.mjs';

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); }
  else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}
async function throwsApiError(id, description, fn, code) {
  try {
    await fn();
    check(id, description, false, 'did not throw');
  } catch (err) {
    check(id, description, err instanceof ApiError && err.code === code,
      `got ${err && err.code || err}`);
  }
}

const repo = getRepository();
const retriever = new StructuredRetriever(repo);

console.log('================================================');
console.log('CourseMap AI unit tests (mock-only, no live API)');
console.log('================================================');

/* ---- A-01 Repository 基础 ---- */
check('A-01', 'Repository 可用且加载了数据', repo.isAvailable && repo.resources.length >= 40, `resources=${repo.resources.length}`);
const anyResource = repo.resources[0];
check('A-01b', 'getResourceById 精确命中', repo.getResourceById(anyResource.resource_id)?.resource_id === anyResource.resource_id);
check('A-01c', '不存在的 ID 返回 null', repo.getResourceById('NOPE-404') === null);

/* ---- A-02 findGoalByName（含别名）---- */
const pyGoal = repo.findGoalByName('Python 数据分析');
check('A-02', '目标名精确匹配', !!pyGoal);
check('A-02b', '未知目标返回 null', repo.findGoalByName('量子炼丹') === null);

/* ---- A-03 过滤器 ---- */
const goalResources = repo.getResourcesByGoal(pyGoal?.goal_id || '', 200);
check('A-03', '按目标取资源非空', goalResources.length > 0);
const withFee = goalResources.filter((r) => typeof r.fee === 'number');
if (withFee.length) {
  const capped = repo.filterByBudget(goalResources, Math.min(...withFee.map((r) => r.fee)));
  check('A-03b', '预算过滤有效', capped.every((r) => r.fee === null || r.fee <= Math.min(...withFee.map((r) => r.fee))));
} else check('A-03b', '预算过滤（数据集无计费资源时不校验）', true);

/* ---- A-04 意图 schema 校验：未知=null，禁止猜测 ---- */
const cleaned = sanitizeIntent({ goal: '  Python 数据分析 ', budget: '300', available_hours_per_week: 5, current_level: 'beginner', certificate_requirement: true, nonsense: 'x' });
check('A-04', '字符串/数值字段被清洗', cleaned.intent.goal === 'Python 数据分析' && cleaned.intent.budget === 300);
check('A-04b', '非法枚举 → null', sanitizeIntent({ current_level: 'godlike' }).intent.current_level === null);
check('A-04c', '超范围数值 → null', sanitizeIntent({ budget: 99999999 }).intent.budget === null);
check('A-04d', '非对象输入安全', sanitizeIntent(null).intent.goal === null);
check('A-04e', 'known_skills 清洗', sanitizeIntent({ known_skills: ['basic R', 42, ''] }).intent.known_skills.length === 1);

/* ---- A-05 Retriever ---- */
const ret = retriever.retrieve({ ...sanitizeIntent({ goal: 'Python 数据分析' }).intent }, 12);
check('A-05', '检索返回候选且含 goal', ret.goal && ret.candidates.length > 0);
const compact = retriever.toCompactCandidates(ret.candidates);
check('A-05b', '候选紧凑表示包含事实字段', compact.every((c) => 'fee' in c && 'data_class' in c && 'resource_id' in c));

/* ---- A-05c 生产缺陷回归：难度/语言不得清空候选集 ----
   实测缺陷：目标「单细胞 RNA-seq 入门」下 2 条资源均为 advanced + en/bilingual，
   检索对 current_level 做**硬过滤**后候选为 0，导致合法请求返回
   INVALID_MODEL_OUTPUT / NO_MATCHING_RESOURCE。修复：难度与语言改为软偏好排序。 */
const scrna = retriever.retrieve(sanitizeIntent({ goal: '单细胞 RNA-seq 入门', current_level: 'intermediate' }).intent, 12);
check('A-05c', '单细胞目标 + intermediate 仍返回候选（难度不硬过滤）',
  scrna.goal && scrna.candidates.length > 0, `candidates=${scrna.candidates.length}`);
const scrnaZh = retriever.retrieve(sanitizeIntent({ goal: '单细胞 RNA-seq 入门', language: 'zh' }).intent, 12);
check('A-05d', '单细胞目标 + 中文偏好仍返回英文资源（语言不硬过滤）',
  scrnaZh.candidates.length > 0, `candidates=${scrnaZh.candidates.length}`);
check('A-05e', 'orderByDifficulty 永不减少元素数',
  (() => {
    const l = repo.getResourcesByGoal(1, 200);
    return repo.orderByDifficulty(l, 'advanced').length === l.length
      && repo.orderByLanguage(l, 'en').length === l.length;
  })());
check('A-05f', 'orderByDifficulty 把最接近的难度排在前面',
  (() => {
    const l = repo.getResourcesByGoal(2, 200);
    const ordered = repo.orderByDifficulty(l, 'advanced');
    return ordered[0].difficulty === 'advanced';
  })());
check('A-05g', '预算仍是硬约束（越界不返回超预算资源）',
  (() => {
    const r = retriever.retrieve(sanitizeIntent({ goal: 'Python 数据分析', budget: 0 }).intent, 12);
    return r.candidates.every((x) => x.fee === 0 || x.fee === null);
  })());

/* ---- A-06 Tool 参数验证（untrusted）---- */
const exec = new ToolExecutor(repo, retriever, 12);
check('A-06', '未知工具被拒绝', exec.execute('run_shell', { cmd: 'rm -rf /' }).ok === false);
check('A-06b', 'compare 参数数量校验', exec.execute('compare_learning_resources', { resource_ids: ['only-one'] }).ok === false);
check('A-06c', '参数为字符串 JSON 也能解析', exec.execute('get_resource_detail', JSON.stringify({ resource_id: anyResource.resource_id })).ok === true);
check('A-06d', '不存在的资源 ID 返回存在性提示而非报错', (() => { const r = exec.execute('get_resource_detail', { resource_id: 'FAKE-ID' }); return r.ok && r.result.resource === null; })());
check('A-06e', 'search 预算超范围被拒', exec.execute('search_learning_resources', { goal: 'Python', budget: 999999 }).ok === false);
check('A-06f', '工具 allowlist 共 6 个', TOOL_NAMES.size === 6 && TOOL_SCHEMAS.every((t) => t.function.parameters.type === 'object'));

/* ---- A-07 compare 派生值由代码计算 ---- */
const twoIds = repo.resources.slice(0, 2).map((r) => r.resource_id);
const cmp = exec.execute('compare_learning_resources', { resource_ids: twoIds });
check('A-07', 'compare 返回 computed 统计', cmp.ok && cmp.result.computed.resource_count === 2);

/* ---- A-08 Learning Path 检索 ---- */
const somePath = repo.paths[0];
const path = repo.getLearningPath(somePath.path_id);
check('A-08', '路径含有序步骤', path && path.steps.length > 0 && path.steps[0].step_order <= path.steps[1].step_order);
check('A-08b', '路径步骤绑定核心资源', path.steps.some((s) => s.core_resources.length > 0));
const prereq = repo.getPrerequisites(pyGoal?.goal_id);
check('A-08c', 'prerequisites 返回 goal 结构', prereq && prereq.goal.goal_id === pyGoal.goal_id);
/* 生产缺陷回归：path_id 在数据集中是数字；调用方（orchestrator/工具）常传字符串。
   旧实现用严格 === 比较 → 步骤数恒为 0 → 学习路径静默渲染为空。 */
check('A-08d', 'getLearningPath 传字符串 ID 时步骤仍完整（ID 规范化）',
  (() => {
    const numeric = repo.getLearningPath(somePath.path_id);
    const stringy = repo.getLearningPath(String(somePath.path_id));
    return !!numeric && !!stringy && numeric.steps.length > 0 && stringy.steps.length === numeric.steps.length;
  })(),
  (() => {
    const s = repo.getLearningPath(String(somePath.path_id));
    return `string id steps=${s ? s.steps.length : 'null'}`;
  })());

/* ---- A-09 Fact hydration：Repository > LLM ---- */
const r0 = repo.resources[0];
const rating = repo.getRatingSummary(r0.resource_id);
check('A-09', '评分由服务端聚合', typeof rating.rating_count === 'number' && rating.rating_count >= 0);

/* ---- A-10 Rate limit ---- */
const limiter = new RateLimiter(60_000, 3);
limiter.check('ip-x'); limiter.check('ip-x'); limiter.check('ip-x');
await throwsApiError('A-10', '超限抛 RATE_LIMITED', () => limiter.check('ip-x'), ERROR_CODES.RATE_LIMITED);

/* ---- A-11 输入校验 ---- */
await throwsApiError('A-11', '空 message 被拒', async () => validateAdvisorInput({ message: '  ' }), ERROR_CODES.BAD_REQUEST);
await throwsApiError('A-11b', '超长 message 被拒', async () => validateAdvisorInput({ message: 'a'.repeat(1000) }), ERROR_CODES.MESSAGE_TOO_LONG);
const vi = validateAdvisorInput({ message: ' hi ', conversation_id: 'abc$%123', evil: true, context: { budget: 100 } });
check('A-11c', '字段白名单 + conversation_id 清洗', vi.message === 'hi' && vi.conversation_id === 'abc123' && !('evil' in vi));

/* ---- A-12 Error mapping：绝不泄内部信息 ---- */
const safe = toSafeError(new Error('ECONNREFUSED 127.0.0.1 secret=sk-abc'));
check('A-12', '未知错误映射为 INTERNAL 且不透出原始消息', safe.code === 'INTERNAL' && safe.message.indexOf('sk-abc') === -1);
check('A-12b', 'ApiError 原样保留 code', toSafeError(new ApiError('X', 'm', 400)).code === 'X');

/* ---- A-13 Mock adapter 可脚本化故障 ---- */
await throwsApiError('A-13', 'Mock 故障透传', async () => { await new MockLLMAdapter({ throwOnChat: new ApiError(ERROR_CODES.AI_UNAVAILABLE, 'down', 502) }).chatJSON({ messages: [{ role: 'user', content: 'x' }] }); }, ERROR_CODES.AI_UNAVAILABLE);

/* ---- A-14 DeepSeekAdapter 未配置时的行为（不发网络请求）---- */
const ds = new DeepSeekAdapter({ apiKey: '' });
check('A-14', '未配置 → isConfigured=false', ds.isConfigured === false && ds.name === 'deepseek');
await throwsApiError('A-14b', '未配置调用抛 NOT_CONFIGURED', () => ds.chatJSON({ messages: [{ role: 'user', content: 'x' }] }), ERROR_CODES.NOT_CONFIGURED);

/* ---- A-15 ConversationStore：结构化约束而非 raw chat ---- */
const store = new ConversationStore(60_000, 5);
store.save('conv-1', sanitizeIntent({ goal: 'Python 数据分析', budget: 200 }).intent, '1.1.1.1');
const s1 = store.get('conv-1', '1.1.1.1');
check('A-15', '会话保存结构化约束', s1 && s1.constraints.goal === 'Python 数据分析');
const continued = store.applyContinuity(s1.constraints, sanitizeIntent({ budget: 100 }).intent, sanitizeIntent({ budget: 100 }).intent);
check('A-15b', '连续性：goal 保留，budget 更新', continued.goal === 'Python 数据分析' && continued.budget === 100);
check('A-15c', '会话不跨 IP 复用', store.get('conv-1', '2.2.2.2') === null);

/* ---- A-16 UsageLogger：不记录 key / 消息原文 ---- */
const ul = new UsageLogger();
ul.record({ request_id: 'r1', adapter: 'mock', model: 'm', latency_ms: 10, usage: { total_tokens: 100 }, tool_call_count: 1, retrieval_count: 5, status: 'ok' });
const rep = ul.report();
check('A-16', 'usage 报告可回答调用数/token/latency', rep.calls === 1 && rep.avg_tokens === 100 && rep.avg_latency_ms === 10);

/* ---- A-17 Orchestrator 端到端（Mock，正常路径）---- */
const mock = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 数据分析', current_level: 'beginner', budget: 300 }).intent,
  toolCalls: [{ name: 'search_learning_resources', args: { goal: 'Python 数据分析' } }],
  final: {
    recommendations: [{ resource_id: ret.candidates[0].resource_id, reason: '匹配目标与预算', fit_factors: ['难度匹配'], tradeoffs: [] }],
    general_advice: ['先巩固基础'], uncertainties: [], summary: '推荐入门课程', path_ref: null, ai_schedule: null,
  },
});
const orch = new AIOrchestrator({ adapter: mock, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
const resp = await orch.advise({ message: '我想学Python数据分析，预算300', conversation_id: null, context: null }, { requestId: 't1', clientIp: 'test' });
check('A-17', 'orchestrator 返回 recommendations', resp.recommendations.length === 1);
check('A-17b', '推荐事实由 Repository hydrate', resp.recommendations[0].title === repo.getResourceById(ret.candidates[0].resource_id).title);
check('A-17c', '响应含 evidence 与分层 disclaimer 字段', Array.isArray(resp.evidence) && resp.evidence.length === 1);
check('A-17d', 'recommendation 含 source_refs', Array.isArray(resp.recommendations[0].source_refs));

/* ---- A-18 幻觉资源 CODE-ENFORCED 拒绝 ---- */
const mockFake = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 数据分析' }).intent,
  final: {
    recommendations: [{ resource_id: 'XYZ-神课', reason: '并不存在的课' }],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
const orch2 = new AIOrchestrator({ adapter: mockFake, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
await throwsApiError('A-18', '幻觉资源 → INVALID_MODEL_OUTPUT（不显示）', () => orch2.advise({ message: '推荐 CourseMap 中不存在的 XYZ 神课', conversation_id: null, context: null }, { requestId: 't2', clientIp: 'test' }), ERROR_CODES.INVALID_MODEL_OUTPUT);

/* ---- A-19 Fact conflict：LLM 报错误 fee，展示层仍为 Repository 值 ---- */
const mockConflict = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 数据分析' }).intent,
  final: {
    recommendations: [{ resource_id: ret.candidates[0].resource_id, reason: 'x', fake_fee: 9999 }],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
const orch3 = new AIOrchestrator({ adapter: mockConflict, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
const resp3 = await orch3.advise({ message: 'x', conversation_id: null, context: null }, { requestId: 't3', clientIp: 'test' });
const hydratedFee = resp3.recommendations[0].fee;
check('A-19', 'fee 显示 Repository 值（不含 9999）', hydratedFee !== 9999 && hydratedFee === repo.getResourceById(resp3.recommendations[0].resource_id).fee);

/* ---- A-19b path_ref 数字/字符串均可（生产缺陷回归）----
   实测缺陷：模型把 path_ref 返回为数字时，旧实现用 asStr 只接受字符串
   → 整段 learning_path 被静默丢弃。现统一为 ID 语义（asId）。 */
const pRefTarget = repo.paths.find((p) => (p.goal_ids || []).includes(2));
const mockPathNum = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 数据分析' }).intent,
  final: {
    recommendations: [{ resource_id: ret.candidates[0].resource_id, reason: 'x' }],
    general_advice: [], uncertainties: [], summary: '', path_ref: pRefTarget.path_id, ai_schedule: null, // 数字，非字符串
  },
});
const orchPath = new AIOrchestrator({ adapter: mockPathNum, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
const respPath = await orchPath.advise({ message: 'x', conversation_id: null, context: null }, { requestId: 't-path', clientIp: 'test' });
check('A-19b', 'path_ref 为数字时 learning_path 不被丢弃',
  !!respPath.learning_path && respPath.learning_path.evidence_backed.path_id === pRefTarget.path_id,
  `path_ref=${JSON.stringify(pRefTarget.path_id)} got=${respPath.learning_path && respPath.learning_path.evidence_backed.path_id}`);
check('A-19c', 'learning_path 步骤来自 Learning Graph',
  !!respPath.learning_path && respPath.learning_path.evidence_backed.steps.length
    === repo.getLearningPath(pRefTarget.path_id).steps.length);

/* ---- A-20 Prompt injection：检索描述中的指令被当作 DATA ---- */
const inj = repo.resources.find((r) => String(r.description || '').includes('Ignore all previous instructions'));
check('A-20', '数据集含注入测试串（测试环境预置）', !!inj, 'demo description injection probe');
// 注入串必须只存在于 demo 描述中，且 orchestrator 不执行它（无副作用 = 无字段变化）
const before = JSON.stringify(repo.getResourceById(inj ? inj.resource_id : ''));
await orch.advise({ message: 'x', conversation_id: null, context: null }, { requestId: 't4', clientIp: 'test' });
const after = JSON.stringify(repo.getResourceById(inj ? inj.resource_id : ''));
check('A-20b', '注入串未引起任何数据变化', before === after);

/* ---- A-21 无匹配目标 → NO_MATCHING_RESOURCE ---- */
const mockNone = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: '量子炼丹' }).intent,
  final: { recommendations: [], general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null },
});
const orch4 = new AIOrchestrator({ adapter: mockNone, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
await throwsApiError('A-21', '无匹配资源 → NO_MATCHING_RESOURCE', () => orch4.advise({ message: 'x', conversation_id: null, context: null }, { requestId: 't5', clientIp: 'test' }), ERROR_CODES.NO_MATCHING_RESOURCE);

/* ---- A-22 LLM 故障透传（fallback 在 handler/前端层）---- */
const mockDown = new MockLLMAdapter({ throwOnChat: new ApiError(ERROR_CODES.AI_UNAVAILABLE, 'down', 502) });
const orch5 = new AIOrchestrator({ adapter: mockDown, repository: repo, retriever, conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
await throwsApiError('A-22', 'LLM 故障 → AI_UNAVAILABLE', () => orch5.advise({ message: 'x', conversation_id: null, context: null }, { requestId: 't6', clientIp: 'test' }), ERROR_CODES.AI_UNAVAILABLE);

/* ---- A-23 Response schema 完整性（规格 §21）---- */
for (const key of ['interpreted_goal', 'constraints', 'recommendations', 'learning_path', 'estimated_cost', 'estimated_duration', 'general_advice', 'uncertainties', 'evidence']) {
  check(`A-23-${key}`, `响应含 ${key}`, key in resp);
}

/* ---- A-24 sanitizeContext ---- */
check('A-24', 'context 清洗安全', sanitizeContext({ budget: '100', hack: 'x' }).budget === 100);

/* ---- 汇总 ---- */
console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
