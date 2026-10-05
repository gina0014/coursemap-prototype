/* ============================================================================
   CourseMap — tests/ai/integration.test.mjs
   ----------------------------------------------------------------------------
   HTTP 级集成测试（本地起真实服务器，复用生产 handler，零外部调用）。
   覆盖：health / malformed request / empty message / message too long /
         404 / OPTIONS 预检 / CORS allowlist / rate limit / envelope 结构。

   完整 LLM 管线在 HTTP 层的验证位于 live.deepseek.test.mjs（有 Key 才跑）；
   Mock 管线逻辑已在 unit.test.mjs 的 orchestrator 级别覆盖。
   ========================================================================== */

import { createServer } from 'node:http';
import { handleAIRequest } from '../../server/httpHandler.mjs';

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); }
  else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

const server = createServer((req, res) => { handleAIRequest(req, res).catch(() => {}); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const ORIGIN = 'http://127.0.0.1:8799';

async function post(path, body, headers = {}) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

console.log('================================================');
console.log('CourseMap AI integration tests (HTTP, no live LLM)');
console.log('================================================');

/* ---- I-01 health ---- */
const health = await (await fetch(`${base}/api/ai/health`)).json();
check('I-01', 'health 返回统一 envelope 且不泄内部信息', health.success === true
  && health.data.status === 'ok' && !JSON.stringify(health).includes('DEEPSEEK'));

/* ---- I-02 malformed request ---- */
const bad = await post('/api/ai/advisor', 'not-json{{{');
check('I-02', 'malformed JSON → BAD_REQUEST', bad.status === 400 && bad.json.error.code === 'BAD_REQUEST');

/* ---- I-03 empty message ---- */
const empty = await post('/api/ai/advisor', { message: '' });
check('I-03', '空 message → BAD_REQUEST', empty.status === 400 && empty.json.error.code === 'BAD_REQUEST');

/* ---- I-04 message too long ---- */
const long = await post('/api/ai/advisor', { message: 'x'.repeat(700) });
check('I-04', '超长 message → MESSAGE_TOO_LONG', long.status === 413 && long.json.error.code === 'MESSAGE_TOO_LONG');

/* ---- I-05 404 route ---- */
const nf = await post('/api/ai/nope', { message: 'x' });
check('I-05', '未知路由 → 404 envelope', nf.status === 404 && nf.json.success === false);

/* ---- I-06 OPTIONS 预检 ---- */
const opt = await fetch(`${base}/api/ai/advisor`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
check('I-06', 'OPTIONS 返回 204 + CORS 头', opt.status === 204
  && opt.headers.get('access-control-allow-origin') === ORIGIN);

/* ---- I-07 CORS allowlist：非白名单 origin 被拒 ---- */
const evil = await post('/api/ai/advisor', { message: 'hi' }, { Origin: 'https://evil.example.com' });
check('I-07', '非白名单 Origin → 403', evil.status === 403 && evil.json.error.code === 'ORIGIN_NOT_ALLOWED');

/* ---- I-08 rate limit（默认 10 req/min/IP；上面已消耗部分额度，重发到超限）---- */
let last = null;
for (let i = 0; i < 12; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  last = await post('/api/ai/advisor', { message: '你好' }, { Origin: ORIGIN, 'X-Forwarded-For': '198.51.100.7' });
}
check('I-08', '超频 → RATE_LIMITED（server-side）', last.json.error && last.json.error.code === 'RATE_LIMITED', JSON.stringify(last.json));

/* ---- I-09 error envelope 永不包含 stack / secret ---- */
check('I-09', '错误响应不含敏感关键词', !JSON.stringify(last.json).match(/stack|sk-[A-Za-z0-9]{10,}|api[_-]?key/i));

/* ---- I-10 无 Key 时 advisor 诚实降级（NOT_CONFIGURED），核心平台不受影响 ---- */
const noKey = await post('/api/ai/advisor', { message: '我想学Python' }, { Origin: ORIGIN, 'X-Forwarded-For': '198.51.100.9' });
check('I-10', '无 Key → NOT_CONFIGURED（不伪造接入）', noKey.json.error && noKey.json.error.code === 'NOT_CONFIGURED'
  && noKey.json.error.message.includes('课程搜索'));

server.close();

console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('  -', f);
  process.exit(1);
}
