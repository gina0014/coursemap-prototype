/* ============================================================================
   CourseMap — tests/ai/data1.test.mjs
   ----------------------------------------------------------------------------
   Phase Data-1 + AI Production Activation 验收测试（Mock LLM + 真实数据集）。

   覆盖规格模块：
     R  Real AI Test         —— 真实 OER 资源可被检索并作为已核验推荐返回
     S  Hallucination Test   —— 不存在的课程必须被拒绝（CODE-ENFORCED）
     T  Unknown Field Test   —— 未核验字段必须明说，禁止模型编数字
     U  License Test         —— 免费 ≠ 开放许可 ≠ 公有领域 ≠ 允许商用

   纪律：
     - 绝不调用真实 DeepSeek（MockLLMAdapter），保证可离线、可复现、零成本。
     - 断言全部基于「运行时可计算的事实」，不硬编码具体数值（资源条数除外，
       因为条数本身就是本轮交付目标，需显式锁定下限）。
   运行：node tests/ai/data1.test.mjs   （退出码 0 = 全部通过）
   ========================================================================== */

import { AIOrchestrator } from '../../server/orchestrator/AIOrchestrator.mjs';
import { getRepository } from '../../server/repo/CourseMapRepository.mjs';
import { StructuredRetriever } from '../../server/retriever/StructuredRetriever.mjs';
import { sanitizeIntent } from '../../server/orchestrator/intentSchema.mjs';
import { SYSTEM_PROMPT_V1, recommendationUserPrompt } from '../../server/prompts/learning-advisor-v1.mjs';
import { MockLLMAdapter } from '../../server/llm/MockLLMAdapter.mjs';
import { ApiError, ERROR_CODES } from '../../server/errors.mjs';
import { ConversationStore } from '../../server/context/ConversationStore.mjs';
import { UsageLogger } from '../../server/cost/usageLog.mjs';
import { CONFIG } from '../../server/config.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const realResources = repo.resources.filter((r) => r.data_class === 'real' && r.status === 'published');
const demoResources = repo.resources.filter((r) => r.data_class === 'demo' && r.status === 'published');
const realSources = repo.sources.filter((s) => s.data_class === 'real');

/* 选一条真实的、可被「Python 入门」检索到的资源作为被测对象。 */
const PY_GOAL_ID = 1;
const realPy = repo.orderByDataClass(repo.getResourcesByGoal(PY_GOAL_ID, 200))
  .find((r) => r.data_class === 'real');
const OCW_SOURCE_ID = 101;
const OPENSTAX_SOURCE_IDS = [137, 138, 139, 140];

function mkOrchestrator(mock) {
  return new AIOrchestrator({
    adapter: mock,
    repository: repo,
    retriever,
    conversationStore: new ConversationStore(),
    usageLogger: new UsageLogger(),
  });
}

console.log('================================================');
console.log('CourseMap Data-1 acceptance tests (R/S/T/U, mock LLM)');
console.log('================================================');

/* ==========================================================================
   R — Real AI Test：真实 OER 可检索、可水合、可溯源
   ========================================================================== */

check('R-00', '数据集含真实资源（>0）', realResources.length > 0, `real=${realResources.length}`);
check('R-00b', '数据集含真实来源（>0）', realSources.length > 0, `realSources=${realSources.length}`);
check('R-00c', '真实资源 ID 与演示资源 ID 区间严格分离',
  realResources.every((r) => Number(r.resource_id) >= 101)
    && demoResources.every((r) => Number(r.resource_id) < 101));

/* R-01 检索：以「Python 入门」为目标的候选集必须包含真实资源 */
const rRet = retriever.retrieve(sanitizeIntent({ goal: 'Python 入门' }).intent, 12);
check('R-01', '「Python 入门」检索候选非空', rRet.goal && rRet.candidates.length > 0,
  `candidates=${rRet.candidates.length}`);
check('R-01b', '候选集包含带官方来源的真实资源',
  rRet.candidates.some((c) => c.data_class === 'real'),
  `real in candidates=${rRet.candidates.filter((c) => c.data_class === 'real').length}`);
check('R-01c', '检索返回 data_class_counts（真实/演示构成可披露）',
  !!rRet.data_class_counts && typeof rRet.data_class_counts.real === 'number');

/* R-02 real-first 排序：同一层内 real 优先，但不无条件置顶 */
const synthetic = [
  { resource_id: 1, data_class: 'demo', verification_status: 'unverified', difficulty: 'beginner' },
  { resource_id: 101, data_class: 'real', verification_status: 'editorial_verified', difficulty: 'beginner' },
  { resource_id: 2, data_class: 'demo', verification_status: 'unverified', difficulty: 'beginner' },
];
const ordered = repo.orderByDataClass(synthetic);
check('R-02', 'orderByDataClass：同层内 real 排在 demo 之前', ordered[0].data_class === 'real');
check('R-02b', 'orderByDataClass 不丢失元素', ordered.length === synthetic.length);

/* R-03 orchestrator 端到端：真实资源被水合，且带官方链接与许可 */
const mockReal = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 入门', current_level: 'beginner', budget: 0 }).intent,
  toolCalls: [{ name: 'search_learning_resources', args: { goal: 'Python 入门' } }],
  final: {
    recommendations: [{ resource_id: realPy.resource_id, reason: '免费且面向初学者', fit_factors: ['免费'], tradeoffs: [] }],
    general_advice: [], uncertainties: [], summary: '推荐入门课程', path_ref: null, ai_schedule: null,
  },
});
const respReal = await mkOrchestrator(mockReal)
  .advise({ message: '我是零基础大学生，想免费学 Python', conversation_id: null, context: null },
    { requestId: 'r3', clientIp: 'test' });

check('R-03', '返回 1 条推荐', respReal.recommendations.length === 1, `got=${respReal.recommendations.length}`);
const rec0 = respReal.recommendations[0];
check('R-03b', '推荐 data_class = real', rec0.data_class === 'real', `got=${rec0.data_class}`);
check('R-03c', '推荐携带 source（非 null）', !!rec0.source && !!rec0.source.official_url);
check('R-03d', 'official_url 是合法 https 链接',
  /^https?:\/\//.test(rec0.official_url || ''), `official_url=${rec0.official_url}`);
check('R-03e', 'official_url 与 Repository 的 url 一致（不伪造）',
  rec0.official_url === repo.getResourceById(realPy.resource_id).url);
check('R-03f', '推荐 license 非空', typeof rec0.license === 'string' && rec0.license.length > 0,
  `license=${rec0.license}`);
check('R-03g', 'recommendations[].sources 带 official_url（可点击溯源）',
  Array.isArray(rec0.sources) && rec0.sources.length > 0
    && rec0.sources.every((s) => /^https?:\/\//.test(s.official_url || '')));
check('R-03h', 'verified_recommendation = true', rec0.verified_recommendation === true);
check('R-03i', '推荐费用为 Repository 的真实值（免费 = 0，非 null）',
  rec0.fee === repo.getResourceById(realPy.resource_id).fee, `fee=${rec0.fee}`);
check('R-03j', 'response.grounding 报告已核验推荐数',
  !!respReal.grounding && respReal.grounding.verified_recommendations >= 1,
  JSON.stringify(respReal.grounding));
check('R-03k', 'response.data_class_counts 反映数据集真实/演示构成',
  !!respReal.data_class_counts && respReal.data_class_counts.real > 0);
check('R-03l', 'evidence 绑定 resource_id 与 source_refs',
  respReal.evidence.length === 1 && Array.isArray(respReal.evidence[0].source_refs)
    && respReal.evidence[0].source_refs.length > 0);
check('R-03m', '推荐包含学习目标名（Repository 水合）',
  Array.isArray(rec0.learning_goal_names) && rec0.learning_goal_names.length > 0);

/* R-04 混合推荐：真实优先，但演示资源不被静默隐藏，且披露混合构成 */
const mockMix = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 入门' }).intent,
  final: {
    recommendations: [
      { resource_id: realPy.resource_id, reason: '免费' },
      { resource_id: demoResources[0].resource_id, reason: '演示条目' },
    ],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
const respMix = await mkOrchestrator(mockMix)
  .advise({ message: 'x', conversation_id: null, context: null }, { requestId: 'r4', clientIp: 'test' });
check('R-04', '混合推荐两条都保留（不静默丢弃演示条目）', respMix.recommendations.length === 2);
check('R-04b', '混合推荐被明确披露（uncertainties 含真实/演示说明）',
  respMix.uncertainties.some((u) => u.includes('真实') && u.includes('DEMO')),
  JSON.stringify(respMix.uncertainties));
check('R-04c', 'grounding.verified_recommendations 只计已核验真实资源',
  respMix.grounding.verified_recommendations === 1, JSON.stringify(respMix.grounding));

/* ==========================================================================
   S — Hallucination Test：不存在的课程必须被拒绝
   ========================================================================== */

/* S-01 幻觉 ID 与真实 ID 混合 → 幻觉被剔除，真实保留 */
const mockHalluMix = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 入门' }).intent,
  final: {
    recommendations: [
      { resource_id: 'CM-HALLUCINATED-COURSE-9999', reason: '并不存在的课' },
      { resource_id: realPy.resource_id, reason: '真实课程' },
    ],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
const respHalluMix = await mkOrchestrator(mockHalluMix)
  .advise({ message: 'x', conversation_id: null, context: null }, { requestId: 's1', clientIp: 'test' });
check('S-01', '幻觉资源被剔除，仅保留真实资源', respHalluMix.recommendations.length === 1
  && respHalluMix.recommendations[0].resource_id === realPy.resource_id);
check('S-01b', 'rejected_resource_ids 记录幻觉 ID',
  respHalluMix.rejected_resource_ids.includes('CM-HALLUCINATED-COURSE-9999'));
check('S-01c', '幻觉资源 ID 不出现在 recommendations/evidence 中',
  !JSON.stringify(respHalluMix.recommendations).includes('HALLUCINATED'));

/* S-02 只有幻觉 ID → 拒绝整个回答（INVALID_MODEL_OUTPUT），不编造 */
const mockHalluOnly = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 入门' }).intent,
  final: {
    recommendations: [{ resource_id: 'CM-HALLUCINATED-COURSE-9999', reason: '并不存在的课' }],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
await throwsApiError('S-02', '仅幻觉资源 → INVALID_MODEL_OUTPUT（拒绝回答）',
  () => mkOrchestrator(mockHalluOnly)
    .advise({ message: 'x', conversation_id: null, context: null }, { requestId: 's2', clientIp: 'test' }),
  ERROR_CODES.INVALID_MODEL_OUTPUT);

/* S-03 不存在的学习目标 → NO_MATCHING_RESOURCE（友好语义，不编造） */
const mockNoGoal = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: '量子炼丹与时空穿梭' }).intent,
  final: { recommendations: [], general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null },
});
await throwsApiError('S-03', 'CourseMap 未收录的目标 → NO_MATCHING_RESOURCE',
  () => mkOrchestrator(mockNoGoal)
    .advise({ message: '我想学量子炼丹', conversation_id: null, context: null }, { requestId: 's3', clientIp: 'test' }),
  ERROR_CODES.NO_MATCHING_RESOURCE);

/* S-04 规则引擎同样不得为不存在的目标编造资源 */
const noMatch = retriever.retrieve(sanitizeIntent({ goal: '量子炼丹与时空穿梭' }).intent, 12);
check('S-04', '未收录目标检索候选为 0（不靠模糊匹配编造）', noMatch.total === 0,
  `total=${noMatch.total}`);

/* ==========================================================================
   T — Unknown Field Test：未核验字段必须明说，禁止编数字
   ========================================================================== */

const realRow = repo.getResourceById(realPy.resource_id);
check('T-00', '被测真实资源 duration_hours 确实为 null（数据事实）', realRow.duration_hours === null,
  `duration_hours=${realRow.duration_hours}`);

const mockUnknown = new MockLLMAdapter({
  intent: sanitizeIntent({ goal: 'Python 入门' }).intent,
  final: {
    /* 模型即使"凭空给出" duration，平台也不得采纳（hydration 覆盖） */
    recommendations: [{ resource_id: realPy.resource_id, reason: 'x', duration_hours: 42 }],
    general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
  },
});
const respUnknown = await mkOrchestrator(mockUnknown)
  .advise({ message: '这个课程需要多少小时？', conversation_id: null, context: null },
    { requestId: 't1', clientIp: 'test' });
const recU = respUnknown.recommendations[0];

check('T-01', '模型给出的 duration_hours=42 未被采纳（仍为 null）', recU.duration_hours === null,
  `duration_hours=${recU.duration_hours}`);
check('T-01b', 'unknown_fields 包含 duration_hours', recU.unknown_fields.includes('duration_hours'),
  JSON.stringify(recU.unknown_fields));
check('T-02', 'unknown_fields 包含 rating（无评价数据）', recU.unknown_fields.includes('rating'));
check('T-03', 'uncertainties 显式声明「未核验字段，AI 不给数值」',
  respUnknown.uncertainties.some((u) => u.includes('未核验') && u.includes('不会给出数值')),
  JSON.stringify(respUnknown.uncertainties));
check('T-04', 'grounding.unknown_fields 非空且可枚举',
  respUnknown.grounding.unknown_fields.length > 0,
  JSON.stringify(respUnknown.grounding.unknown_fields));

/* T-05 未核验字段的措辞必须进入发给模型的指令（不是靠模型自觉） */
const stageBPrompt = recommendationUserPrompt([], null, sanitizeIntent({ goal: 'Python 入门' }).intent, false);
check('T-05', 'Stage B 指令包含「CourseMap 当前未核验该字段」约束',
  stageBPrompt.includes('CourseMap 当前未核验该字段'));
check('T-05b', 'Stage B 指令禁止模型自行输出费用/时长/难度/证书/评分/许可事实字段',
  /Do NOT output fee/.test(stageBPrompt) && /duration/.test(stageBPrompt)
    && /certificate/.test(stageBPrompt) && /rating/.test(stageBPrompt)
    && /license/.test(stageBPrompt));
check('T-05c', 'Stage B 指令禁止编造 resource_id',
  /Never fabricate IDs/.test(stageBPrompt));
check('T-05d', 'Stage B 指令禁止把 NonCommercial 升级为 public domain / commercial',
  /public domain/.test(stageBPrompt) && /commercial use allowed/.test(stageBPrompt));
check('T-06', 'SYSTEM_PROMPT 声明 null/unknown 不得猜测',
  /null|unknown/i.test(SYSTEM_PROMPT_V1));

/* ==========================================================================
   U — License Test：免费 ≠ 开放许可 ≠ 公有领域 ≠ 允许商用
   ========================================================================== */

const ocw = repo.sources.find((s) => Number(s.source_id) === OCW_SOURCE_ID);
check('U-00', 'MIT OCW 来源存在', !!ocw);
check('U-01', 'MIT OCW 许可为 CC BY-NC-SA 4.0', ocw.license === 'CC BY-NC-SA 4.0', `license=${ocw.license}`);
check('U-01b', 'MIT OCW 明确非公有领域（免费 ≠ 公有领域）', ocw.public_domain === false);
check('U-01c', 'MIT OCW 明确禁止商用', ocw.commercial_use === false);
check('U-01d', 'MIT OCW 要求署名 + 相同方式共享',
  ocw.attribution_required === true && ocw.share_alike === true);
check('U-01e', '许可链接存在', /^https?:\/\//.test(ocw.license_url || ''));

const stax = repo.sources.find((s) => Number(s.source_id) === OPENSTAX_SOURCE_IDS[0]);
check('U-02', 'OpenStax 来源存在', !!stax);
check('U-02b', 'OpenStax 同样为 CC BY-NC-SA 4.0 且非公有领域',
  stax.license === 'CC BY-NC-SA 4.0' && stax.public_domain === false);
check('U-03', '不同提供方的 AI 训练许可被正确区分（OCW=true / OpenStax=false）',
  ocw.ai_training_allowed === true && stax.ai_training_allowed === false,
  `ocw=${ocw.ai_training_allowed} stax=${stax.ai_training_allowed}`);

/* U-04 全部真实来源必须带许可（VR-E12 数据层强制） */
check('U-04', '所有真实来源都带 license（无来源=不许发布）',
  realSources.every((s) => typeof s.license === 'string' && s.license.length > 0));
check('U-04b', '所有真实来源都带官方链接',
  realSources.every((s) => /^https?:\/\//.test(s.official_url || s.url || '')));
check('U-04c', '没有任何真实来源被误标为公有领域或允许商用',
  realSources.every((s) => s.public_domain !== true && s.commercial_use !== true),
  JSON.stringify(realSources.filter((s) => s.public_domain === true || s.commercial_use === true)
    .map((s) => s.source_id)));

/* U-05 licenseSummaryFor：许可事实由 Repository 提供，供 UI 与 AI 共同使用 */
const lic = repo.licenseSummaryFor(realPy.resource_id);
check('U-05', 'licenseSummaryFor 返回许可摘要', Array.isArray(lic) && lic.length > 0);
check('U-05b', '摘要含 public_domain / commercial_use / ai_training_allowed 布尔字段',
  typeof lic[0].public_domain === 'boolean'
    && typeof lic[0].commercial_use === 'boolean'
    && typeof lic[0].ai_training_allowed === 'boolean');
check('U-05c', 'licenseSummaryFor 的 public_domain 为 false（免费≠公有领域）', lic[0].public_domain === false);

/* U-06 许可语义必须进入 AI 指令，避免模型把免费说成可商用 */
check('U-06', 'SYSTEM_PROMPT 声明 Free ≠ Open ≠ Public Domain ≠ Commercial',
  /Free/i.test(SYSTEM_PROMPT_V1) && /Public Domain/i.test(SYSTEM_PROMPT_V1)
    && /Commercial/i.test(SYSTEM_PROMPT_V1));

/* ==========================================================================
   I — DeepSeek Model Audit：模型名必须落在官方当前模型表内
   --------------------------------------------------------------------------
   官方模型表核验于 2026-10-06（https://api-docs.deepseek.com/zh-cn）：
     当前：deepseek-v4-flash（V4-Flash-0731）、deepseek-v4-pro（V4-Pro-0813）、
           deepseek-v4-flash-vision-exp（实验）
     停用：deepseek-chat / deepseek-reasoner —— 2026-07-24 15:59 UTC 起返回 HTTP 错误
   本轮真实缺陷：曾把默认值写成 `deepseek-flash`（缺少 `v4-`），官方表中不存在该名称。
   ========================================================================== */

const OFFICIAL_WRONG = /^deepseek-(chat|reasoner|flash)$/i;
const OFFICIAL_OK = /^deepseek-v4-(flash|pro|flash-vision-exp)$/;

check('I-01', 'CONFIG.deepseek.model 是官方当前模型名', OFFICIAL_OK.test(CONFIG.deepseek.model),
  `model=${CONFIG.deepseek.model}`);
check('I-01b', 'CONFIG.deepseek.model 不是已停用/拼写错误的名称',
  !OFFICIAL_WRONG.test(CONFIG.deepseek.model), `model=${CONFIG.deepseek.model}`);
check('I-02', 'base_url 为官方端点', CONFIG.deepseek.baseUrl === 'https://api.deepseek.com',
  `baseUrl=${CONFIG.deepseek.baseUrl}`);
check('I-03', '思考模式默认关闭（两段式管线需低延迟可复现）', CONFIG.deepseek.thinking === false,
  `thinking=${CONFIG.deepseek.thinking}`);
check('I-04', '输出 token 上限已设置（成本约束）', Number(CONFIG.deepseek.maxOutputTokens) > 0,
  `maxOutputTokens=${CONFIG.deepseek.maxOutputTokens}`);
check('I-05', '超时已设置（防止请求悬挂）', Number(CONFIG.deepseek.timeoutMs) > 0,
  `timeoutMs=${CONFIG.deepseek.timeoutMs}`);

/* 代码库中不得残留已停用模型名字面量（注释与文档可以提，作为迁移说明） */
const bannedInCode = [
  'server/config.mjs', '.env.example', 'server/llm/DeepSeekAdapter.mjs',
  'api/ai/health.js', 'api/ai/advisor.js',
];
const residual = bannedInCode.filter((rel) => {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  // 允许出现在注释中（迁移说明），禁止出现在赋值/字符串默认值上
  const lines = text.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l));
  return lines.some((l) => /['"]deepseek-(chat|reasoner|flash)['"]/.test(l));
});
check('I-06', '代码默认值中无已停用/错误模型名字面量', residual.length === 0,
  residual.join(', '));

/* ---- 汇总 ---- */
console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
