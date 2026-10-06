/* ============================================================================
   CourseMap — scripts/verify/wait_for_deploy.mjs
   ----------------------------------------------------------------------------
   部署闸门：在开始生产验证之前，确认「正在验证的部署」就是本次推送的部署。

   为什么必须存在：
     push 到 master 会同时触发（a）Vercel 重新部署，与（b）本验证流水线。
     两者是并行的，验证可能在 Vercel 尚未完成 redeploy 时就开始跑，
     结果会拿**旧代码**去验**新修复**，把正确答案误判为失败（真实踩坑）。
     本脚本轮询 /api/ai/health 的 meta.build（部署指纹）直到新部署就绪。

   判定规则（任一满足即通过）：
     1) meta.build 以本次提交短 SHA 开头（Vercel Git 部署：VERCEL_GIT_COMMIT_SHA）；
     2) meta.build 与「开始等待时观测到的 build」不同（覆盖 Vercel CLI 部署：
        build = VERCEL_DEPLOYMENT_ID，每次部署都会变）。
   无法判定时（build === 'local'，即部署环境未注入 Vercel 变量）→ 警告并继续。

   环境变量：
     COURSEMAP_AI_BASE            后端基址（默认生产 Vercel）
     COURSEMAP_EXPECT_BUILD       期望的提交 SHA（CI 传 github.sha）
     DEPLOY_WAIT_MS               最长等待（默认 300000）
     COURSEMAP_DEPLOY_GATE_STRICT '1' = 超时即失败；默认 0（超时警告后继续，
                                  以免在无法判定 build 的环境里卡死流水线）

   退出码：0 = 就绪（或无法判定）；1 = 严格模式下超时。
   ========================================================================== */

const AI_BASE = (process.env.COURSEMAP_AI_BASE || 'https://coursemap-prototype.vercel.app').replace(/\/+$/, '');
const EXPECT = String(process.env.COURSEMAP_EXPECT_BUILD || '').trim();
const EXPECT_SHORT = EXPECT ? EXPECT.slice(0, 12) : '';
const WAIT_MS = Number.parseInt(process.env.DEPLOY_WAIT_MS || '300000', 10);
const STRICT = String(process.env.COURSEMAP_DEPLOY_GATE_STRICT || '0') === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readBuild() {
  try {
    const res = await fetch(`${AI_BASE}/api/ai/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const j = await res.json().catch(() => null);
    const build = j && j.meta && j.meta.build ? String(j.meta.build) : null;
    return { ok: true, status: res.status, build, version: j && j.meta ? j.meta.version : null };
  } catch (e) {
    return { ok: false, status: 0, err: String((e && e.message) || e) };
  }
}

console.log('================================================');
console.log('CourseMap — deploy gate (wait for this commit to go live)');
console.log('================================================');
console.log(`AI backend   : ${AI_BASE}`);
console.log(`Expect build : ${EXPECT_SHORT || '(not provided)'}`);
console.log('------------------------------------------------');

const first = await readBuild();
const baseline = first.ok ? first.build : null;
console.log(`initial health: ok=${first.ok} status=${first.status} build=${baseline ?? '(none)'}${first.err ? ` err=${first.err}` : ''}`);

if (EXPECT_SHORT && baseline && baseline.startsWith(EXPECT_SHORT)) {
  console.log(`[PASS] 部署已是本次提交（build=${baseline}）— 直接进入验证。`);
  process.exit(0);
}

let last = baseline;
const deadline = Date.now() + WAIT_MS;
let attempt = 0;
for (;;) {
  attempt += 1;
  const r = await readBuild();
  if (r.ok && r.build) {
    last = r.build;
    if (EXPECT_SHORT && r.build.startsWith(EXPECT_SHORT)) {
      console.log(`[PASS] 新部署已就绪（build=${r.build} == 本次提交）第 ${attempt} 次探测。`);
      process.exit(0);
    }
    if (baseline && r.build !== baseline) {
      console.log(`[PASS] 检测到新部署（build ${baseline} → ${r.build}）第 ${attempt} 次探测。`);
      process.exit(0);
    }
  }
  if (Date.now() >= deadline) break;
  await sleep(10_000);
}

if (!baseline || baseline === 'local') {
  console.log(`[WARN] 无法判定部署指纹（build=${baseline ?? 'none'}）——部署环境未注入 Vercel 变量。`);
  console.log('       继续执行验证；若流水线失败，请先确认 Vercel 是否已完成 redeploy。');
  process.exit(0);
}

console.log(`[WARN] 等待 ${Math.round(WAIT_MS / 1000)}s 后仍未观测到新部署（当前 build=${last ?? 'unknown'}）。`);
if (STRICT) {
  console.error('[FAIL] 严格模式：未能在超时前确认新部署，拒绝在旧部署上做生产验证。');
  process.exit(1);
}
console.log('       非严格模式：继续执行（验证结果会如实反映当前线上代码）。');
process.exit(0);
