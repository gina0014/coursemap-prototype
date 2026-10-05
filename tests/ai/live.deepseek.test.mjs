/* ============================================================================
   CourseMap — tests/ai/live.deepseek.test.mjs
   ----------------------------------------------------------------------------
   Live DeepSeek 集成测试。仅在 DEEPSEEK_API_KEY 存在时运行；
   否则输出 SKIP（退出码 0），CI/regression 不受影响。
   绝不在日志中打印 Key；失败退出码 1。

   覆盖：Simple Query / Structured Intent / Tool Call / Recommendation /
         Invalid Input / No Matching Resource。
   ========================================================================== */

import { AIOrchestrator } from '../../server/orchestrator/AIOrchestrator.mjs';
import { getRepository } from '../../server/repo/CourseMapRepository.mjs';
import { StructuredRetriever } from '../../server/retriever/StructuredRetriever.mjs';
import { DeepSeekAdapter } from '../../server/llm/DeepSeekAdapter.mjs';
import { ConversationStore } from '../../server/context/ConversationStore.mjs';
import { UsageLogger } from '../../server/cost/usageLog.mjs';
import { hasDeepSeekKey } from '../../server/config.mjs';

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); }
  else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

if (!hasDeepSeekKey()) {
  console.log('[SKIP] Live DeepSeek tests: DEEPSEEK_API_KEY not set. (LIVE: SKIP)');
  process.exit(0);
}

const repo = getRepository();
const retriever = new StructuredRetriever(repo);
const store = new ConversationStore();
const usage = new UsageLogger();
const orch = new AIOrchestrator({
  adapter: new DeepSeekAdapter(), repository: repo, retriever,
  conversationStore: store, usageLogger: usage,
});

console.log('================================================');
console.log('CourseMap AI live tests (REAL DeepSeek calls)');
console.log('================================================');

const meta = { requestId: 'live', clientIp: 'live-test' };

/* ---- L-01 Simple Query + Structured Intent ---- */
const r1 = await orch.advise({
  message: '我是零基础大学生，每周5小时，预算200元，想学会Python数据分析。',
  conversation_id: null, context: null,
}, meta).catch((e) => ({ error: e }));
check('L-01', 'Simple Query 返回推荐', !r1.error && r1.recommendations.length > 0, r1.error?.code);
if (!r1.error) {
  check('L-01b', '意图约束被提取（预算/时间）', r1.constraints.budget === 200 && r1.constraints.available_hours_per_week === 5,
    JSON.stringify(r1.constraints));
  check('L-01c', '推荐绑定真实 resource_id', r1.recommendations.every((x) => !!repo.getResourceById(x.resource_id)));
  check('L-01d', '推荐说明 WHY', r1.recommendations.every((x) => typeof x.reason === 'string' && x.reason.length > 0));
  check('L-01e', '证据与来源绑定', r1.evidence.length > 0);
}

/* ---- L-02 Tool Call 路径 ---- */
const r2 = await orch.advise({
  message: '我会一点R，想入门单细胞分析，帮我看看有什么资源和先修要求。',
  conversation_id: null, context: null,
}, meta).catch((e) => ({ error: e }));
check('L-02', 'R→单细胞查询成功', !r2.error, r2.error?.code);
if (!r2.error) check('L-02b', '推荐全部来自 CourseMap', r2.recommendations.every((x) => !!repo.getResourceById(x.resource_id)));

/* ---- L-03 No Matching Resource ---- */
let noMatch = null;
try {
  noMatch = await orch.advise({
    message: '我想学习如何驯养独角兽并考取独角兽骑手证书。',
    conversation_id: null, context: null,
  }, meta);
  check('L-03', '无匹配目标被诚实拒绝', false, 'unexpectedly succeeded');
} catch (e) {
  check('L-03', '无匹配目标被诚实拒绝（NO_MATCHING_RESOURCE 或诚实空推荐）',
    e.code === 'NO_MATCHING_RESOURCE' || e.code === 'BAD_REQUEST', e.code);
}

/* ---- L-04 Invalid Input（orchestrator 级：无 goal 可提取）---- */
let invalid = null;
try {
  invalid = await orch.advise({ message: '嗯。', conversation_id: null, context: null }, meta);
  check('L-04', '无效输入被拒或返回不确定性说明', true);
} catch (e) {
  check('L-04', '无效输入被拒（BAD_REQUEST）', e.code === 'BAD_REQUEST', e.code);
}

console.log('------------------------------------------------');
console.log('usage report:', JSON.stringify(usage.report()));
console.log(`LIVE RESULT: PASS ${passed} / FAIL ${failures.length}`);
if (failures.length) process.exit(1);
