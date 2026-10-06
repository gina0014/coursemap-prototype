/* ============================================================================
   CourseMap — tests/ai/routing.test.mjs
   ----------------------------------------------------------------------------
   路由一致性测试（部署正确性防线）。

   背景（真实生产事故）：
     server/httpHandler.mjs 是平台无关入口，同时处理
       GET  /api/ai/health
       POST /api/ai/advisor
     本地 dev-server 由我们自己按 pathname 分派 → 两个路由都通。
     但 **Vercel 按文件系统路由**：只提交了 api/ai/advisor.js 时，
     生产环境 GET /api/ai/health 直接 404 → 前端 probeBackend() 永远判定
     「后端不可用」→ AI Beta 引擎在公网无法启用（静默降级，极难发现）。

   本测试断言：
     R-01 httpHandler 声明的每个 /api 路由，都有对应的 api/**.js Serverless 入口
     R-02 每个 api 入口文件都 re-export handleAIRequest（不会漂移成空壳）
     R-03 vercel.json functions 覆盖全部 api 入口（保证 includeFiles/maxDuration 生效）
     R-04 vercel.json functions 不包含不存在的文件（防止残留配置）
     R-05 .env.example 不含任何真实密钥值（只允许空值/示例）

   运行：node tests/ai/routing.test.mjs   （退出码 0 = 全部通过）
   ========================================================================== */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); }
  else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ---- 提取 handler 中声明的路由 ---- */
const handlerSrc = read('server/httpHandler.mjs');
const declaredRoutes = [...handlerSrc.matchAll(/route === '(\/api\/[^']+)'/g)].map((m) => m[1]);
const uniqueRoutes = [...new Set(declaredRoutes)].sort();

check('R-00', '从 httpHandler 解析到路由', uniqueRoutes.length >= 2,
  `routes=${JSON.stringify(uniqueRoutes)}`);

/* ---- 路由 → Vercel 入口文件路径 ---- */
const entryOf = (route) => `${route.replace(/^\//, '')}.js`; // /api/ai/health → api/ai/health.js

const vercel = JSON.parse(read('vercel.json'));
const fnKeys = Object.keys(vercel.functions || {});

for (const route of uniqueRoutes) {
  const entry = entryOf(route);

  /* R-01 */
  const exists = existsSync(join(ROOT, entry));
  check('R-01', `路由 ${route} 有 Serverless 入口 ${entry}`, exists,
    exists ? '' : `缺失 ${entry} —— 生产环境该路由会 404`);

  /* R-02 */
  if (exists) {
    const src = read(entry);
    check('R-02', `入口 ${entry} re-export handleAIRequest`,
      /handleAIRequest/.test(src) && /export\s*\{[^}]*handleAIRequest[^}]*\}/.test(src));
  }

  /* R-03 */
  check('R-03', `vercel.json functions 覆盖 ${entry}`, fnKeys.includes(entry),
    `functions=${JSON.stringify(fnKeys)}`);
}

/* R-04 —— 反向检查：配置里不留不存在的文件 */
for (const key of fnKeys) {
  check('R-04', `vercel.json 条目 ${key} 确实存在`, existsSync(join(ROOT, key)));
}

/* R-05 —— .env.example 不得含真实密钥（值必须为空）---- */
const envExample = read('.env.example');
const keyLines = envExample.split(/\r?\n/)
  .filter((l) => /^\s*DEEPSEEK_API_KEY\s*=/.test(l));
check('R-05', '.env.example 中 DEEPSEEK_API_KEY 为空值',
  keyLines.length === 1 && /^DEEPSEEK_API_KEY\s*=\s*$/.test(keyLines[0].trim()),
  `line=${JSON.stringify(keyLines)}`);

console.log('------------------------------------------------');
console.log(`PASS: ${passed}   FAIL: ${failures.length}`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('================================================');
