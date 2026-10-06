/* ============================================================================
   CourseMap — tests/ai/model-output.test.mjs
   ----------------------------------------------------------------------------
   生产缺陷回归：INVALID_MODEL_OUTPUT（502）与「平台遗留退役模型名」。

   背景（2026-10-06 生产验证证据 docs/ai-integration/evidence/30_*）：
     48 项检查 PASS 41 / FAIL 7，7 条失败中有 3 条直接是
       status=502 { error.code: "INVALID_MODEL_OUTPUT" }
     另有 health 对外公布 `model: "deepseek-chat"`（2026-07-24 已退役名）。
   这两件事都**不是**「模型不会答」，而是平台侧把「模型答对了但格式带毛边」
   与「平台配置遗留」处理成了硬失败。

   本测试锁定四个契约：
     ① extractJsonObject：稳健提取（围栏/解释性前缀/尾逗号/截断兜底），
        且**绝不**发明字段（修不回来就返回 null）。
     ② chatJSON：解析失败时第 2 次请求必须**改变请求**（修复指令 + 更大预算），
        而不是原样重发。
     ③ chatWithTools + expectJson：终局轮 JSON 带毛边时可自愈；两次都失败才抛。
     ④ config：退役模型名只作为 Deprecation Map 的键存在，且映射到当前受支持模型。

   纪律：
     - **绝不调用真实 DeepSeek**：通过替换 globalThis.fetch 注入脚本化响应。
       因此可离线、可复现、零成本、零密钥。
     - 断言基于可复算事实；不锁定具体文案，只锁定行为契约。
   运行：node tests/ai/model-output.test.mjs   （退出码 0 = 全部通过）
   ========================================================================== */

import { extractJsonObject, withJsonRepairHint, JSON_REPAIR_HINT } from '../../server/llm/jsonUtil.mjs';
import { DeepSeekAdapter } from '../../server/llm/DeepSeekAdapter.mjs';
import { ApiError, ERROR_CODES } from '../../server/errors.mjs';

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); }
  else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ==========================================================================
   ① extractJsonObject —— 提取与最小修复
   ========================================================================== */

check('J-01', '纯 JSON 对象直接解析', extractJsonObject('{"a":1}')?.a === 1);
check('J-02', '带前后空白的 JSON', extractJsonObject('\n\n {"a":1} \n')?.a === 1);
check('J-03', 'markdown 围栏（带 json 标注）',
  extractJsonObject('```json\n{"a":1,"b":[2,3]}\n```')?.b?.[1] === 3);
check('J-04', 'markdown 围栏（无语言标注）', extractJsonObject('```\n{"a":1}\n```')?.a === 1);
check('J-05', '围栏未闭合（被 max_tokens 截断）也能提取',
  extractJsonObject('```json\n{"summary":"ok","recommendations":[]}')?.summary === 'ok');
check('J-06', '解释性前缀（"这是结果：{...}"）也能提取',
  extractJsonObject('好的，这是推荐结果：\n{"summary":"ok","recommendations":[{"resource_id":101}]}\n希望有帮助。')?.recommendations?.[0]?.resource_id === 101);
check('J-07', '尾逗号（对象与数组）被修复',
  extractJsonObject('{"a":[1,2,],"b":3,}')?.b === 3);
check('J-08', '字符串内的右花括号不会被切错',
  extractJsonObject('{"note":"包含 } 与 ,} 的字符串","ok":true}')?.ok === true);
check('J-09', '字符串内的引号转义不会破坏扫描',
  extractJsonObject('{"s":"他说\\"你好\\"","n":1}')?.n === 1);
check('J-10', '嵌套对象与数组混合',
  JSON.stringify(extractJsonObject('{"a":{"b":[{"c":1}]}}')) === '{"a":{"b":[{"c":1}]}}');
check('J-11', '多个 JSON 对象时取第一个可解析的',
  extractJsonObject('{"first":1} 然后 {"second":2}')?.first === 1);
check('J-12', '完全不是 JSON → null（绝不发明对象）',
  extractJsonObject('抱歉，我无法回答这个问题。') === null);
check('J-13', '空串 / 非字符串 → null',
  extractJsonObject('') === null && extractJsonObject(null) === null && extractJsonObject(undefined) === null);
check('J-14', '顶层数组不被当作对象返回（契约是对象）',
  extractJsonObject('[1,2,3]') === null || typeof extractJsonObject('[1,2,3]') === 'object');
check('J-15', '**不修补语义**：缺失字段不会被凭空补上',
  (() => { const o = extractJsonObject('{"summary":"只有摘要"}'); return o && !('recommendations' in o) && !('fee' in o); })());
check('J-16', '未闭合字符串的截断 JSON 不返回半成品对象',
  extractJsonObject('{"summary":"没写完') === null);

/* 修复指令 */
{
  const msgs = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U1' }];
  const out = withJsonRepairHint(msgs);
  check('J-17', '修复指令追加到最后一条 user 消息（不新增角色，避免连续两条 user）',
    out.length === msgs.length && out[1].content.startsWith('U1') && out[1].content.includes(JSON_REPAIR_HINT.trim().split('\n')[1]));
  check('J-18', '原消息对象不被就地修改（纯函数）',
    msgs[1].content === 'U1');
}

/* ==========================================================================
   ② / ③ 适配器层：脚本化 fetch
   --------------------------------------------------------------------------
   通过替换 globalThis.fetch 注入响应序列 —— 真实走 DeepSeekAdapter 的
   #chat / chatJSON / chatWithTools 代码路径，但不产生任何网络调用。
   ========================================================================== */

const originalFetch = globalThis.fetch;
/** 记录每次请求体，供断言「第 2 次请求确实变了」 */
let fetchLog = [];

function stubFetch(responses) {
  fetchLog = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    let body = null;
    try { body = JSON.parse(init.body); } catch { /* ignore */ }
    fetchLog.push({ url: String(url), body });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    const payload = typeof r === 'function' ? r(body) : r;
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  return () => { i = 0; };
}

function apiResponse(content, { model = 'deepseek-v4-flash', finish = 'stop' } = {}) {
  return {
    model,
    choices: [{ message: { role: 'assistant', content }, finish_reason: finish }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

const adapter = () => new DeepSeekAdapter({ apiKey: 'test-key-not-a-secret' });

/* J-20 首个响应即为干净 JSON → 只发一次请求 */
try {
  stubFetch([apiResponse('{"intent":"ok"}')]);
  const a = adapter();
  const r = await a.chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-20', '干净 JSON：一次请求即成功', r.content.intent === 'ok' && fetchLog.length === 1,
    `requests=${fetchLog.length}`);
} catch (e) { check('J-20', '干净 JSON：一次请求即成功', false, String(e && e.message)); }

/* J-21 带解释性前缀 → 无需重试 */
try {
  stubFetch([apiResponse('这是结果：\n{"intent":"ok"}\n（结束）')]);
  const r = await adapter().chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-21', '解释性前缀：无需重试即可解析', r.content.intent === 'ok' && fetchLog.length === 1,
    `requests=${fetchLog.length}`);
} catch (e) { check('J-21', '解释性前缀：无需重试即可解析', false, String(e && e.message)); }

/* J-22 截断（finish_reason=length）但 JSON 完整 → 仍然成功（旧实现直接判失败） */
try {
  stubFetch([apiResponse('{"summary":"ok","recommendations":[{"resource_id":101}]}', { finish: 'length' })]);
  const r = await adapter().chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-22', 'finish_reason=length 但 JSON 可解析 → 成功（旧实现 502）',
    r.content.summary === 'ok' && fetchLog.length === 1, `requests=${fetchLog.length}`);
} catch (e) { check('J-22', 'finish_reason=length 但 JSON 可解析 → 成功（旧实现 502）', false, String(e && e.message)); }

/* J-23 首次不可解析 → 第 2 次成功；且第 2 次请求必须「变了」 */
try {
  stubFetch([apiResponse('抱歉，我无法输出 JSON。'), apiResponse('{"intent":"recovered"}')]);
  const r = await adapter().chatJSON({ messages: [{ role: 'user', content: 'ASK' }] });
  const second = fetchLog[1];
  const secondMsg = second && second.body.messages[second.body.messages.length - 1].content || '';
  check('J-23', '首次不可解析 → 重试后成功', r.content.intent === 'recovered' && fetchLog.length === 2,
    `requests=${fetchLog.length}`);
  check('J-24', '第 2 次请求追加了 JSON 修复指令（不是原样重发）',
    secondMsg.includes('不是合法 JSON'), secondMsg.slice(0, 60));
  check('J-25', '第 2 次请求提高了 token 预算（截断是真实诱因）',
    Number(second.body.max_tokens) >= Number(fetchLog[0].body.max_tokens),
    `first=${fetchLog[0].body.max_tokens} second=${second.body.max_tokens}`);
  check('J-26', '两次请求都显式关闭思考模式（不依赖服务端默认值）',
    fetchLog.every((f) => f.body.thinking && f.body.thinking.type === 'disabled'));
} catch (e) { check('J-23', '首次不可解析 → 重试后成功', false, String(e && e.message)); }

/* J-27 两次都不可解析 → INVALID_MODEL_OUTPUT 且 status 502（诚实的失败，不伪造成功） */
try {
  stubFetch([apiResponse('nope'), apiResponse('still nope')]);
  await adapter().chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-27', '两次都无法解析 → 抛 INVALID_MODEL_OUTPUT/502', false, 'did not throw');
} catch (err) {
  check('J-27', '两次都无法解析 → 抛 INVALID_MODEL_OUTPUT/502',
    err instanceof ApiError && err.code === ERROR_CODES.INVALID_MODEL_OUTPUT && err.status === 502,
    `code=${err && err.code} status=${err && err.status}`);
  check('J-28', '失败详情含诊断线索（finishReason / 是否为空），且不含密钥',
    !!err.detail && typeof err.detail.finishReason === 'string'
    && !JSON.stringify(err.detail).includes('test-key-not-a-secret'),
    JSON.stringify(err.detail));
}

/* J-29 chatWithTools + expectJson：终局轮带围栏也能自愈，不额外请求 */
try {
  stubFetch([apiResponse('```json\n{"summary":"B","recommendations":[]}\n```')]);
  const b = await adapter().chatWithTools({
    messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 't' } }],
    handleToolCall: async () => ({}), expectJson: true,
  });
  check('J-29', 'chatWithTools(expectJson)：带围栏 JSON 直接解析（无额外轮次）',
    b.json && b.json.summary === 'B' && fetchLog.length === 1, `requests=${fetchLog.length}`);
} catch (e) { check('J-29', 'chatWithTools(expectJson)：带围栏 JSON 直接解析（无额外轮次）', false, String(e && e.message)); }

/* J-30 chatWithTools + expectJson：终局轮非 JSON → 追加一轮收口重问 */
try {
  stubFetch([apiResponse('我想推荐 101 号课程，但没有输出 JSON。'), apiResponse('{"summary":"fixed","recommendations":[{"resource_id":101}]}')]);
  const b = await adapter().chatWithTools({
    messages: [{ role: 'user', content: 'x' }], tools: [], handleToolCall: async () => ({}), expectJson: true,
  });
  const last = fetchLog[fetchLog.length - 1];
  const roles = last.body.messages.map((m) => m.role).join(',');
  check('J-30', 'chatWithTools：终局非 JSON → 收口重问后成功',
    b.json && b.json.summary === 'fixed' && fetchLog.length === 2, `requests=${fetchLog.length}`);
  check('J-31', '收口重问保持角色交替（不以两条连续 user 结束）',
    roles.endsWith('assistant,user'), roles);
  check('J-32', '收口重问已去掉 tools（强制收口为文本 JSON）',
    last.body.tools === undefined, JSON.stringify(last.body.tools));
} catch (e) { check('J-30', 'chatWithTools：终局非 JSON → 收口重问后成功', false, String(e && e.message)); }

/* J-33 upstream 报告的 served model 被记录（用于观测「配置 vs 实际」） */
try {
  stubFetch([apiResponse('{"ok":1}', { model: 'deepseek-v4-pro' })]);
  const a = adapter();
  await a.chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-33', '记录上游实际服务的模型名（served model）',
    a.model === 'deepseek-v4-pro' && a.configuredModel === 'deepseek-v4-flash',
    `served=${a.model} configured=${a.configuredModel}`);
} catch (e) { check('J-33', '记录上游实际服务的模型名（served model）', false, String(e && e.message)); }

/* J-34 上游 401 → AI_UNAVAILABLE，且绝不透出 key */
try {
  globalThis.fetch = async () => new Response('unauthorized', { status: 401 });
  await adapter().chatJSON({ messages: [{ role: 'user', content: 'x' }] });
  check('J-34', '上游 401 → AI_UNAVAILABLE（不透出 key）', false, 'did not throw');
} catch (err) {
  check('J-34', '上游 401 → AI_UNAVAILABLE（不透出 key）',
    err instanceof ApiError && err.code === ERROR_CODES.AI_UNAVAILABLE
    && !String(err.message).includes('test-key-not-a-secret'),
    `code=${err && err.code} msg=${err && err.message}`);
}

globalThis.fetch = originalFetch;

console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
