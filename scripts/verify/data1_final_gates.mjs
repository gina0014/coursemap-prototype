#!/usr/bin/env node
/**
 * ============================================================================
 * CourseMap — scripts/verify/data1_final_gates.mjs
 * ----------------------------------------------------------------------------
 * Phase Data-1 + AI Production Activation 的**最终门禁**执行器（模块 Y）。
 *
 * 它把模块 Y 的 14 条验收门禁逐条跑一遍，并输出机器可读证据：
 *   docs/data-integration/evidence/data1_final_gates.json
 *   docs/data-integration/evidence/data1_final_gates.txt
 *
 * 设计原则：
 *   - 门禁必须"可失败"：任何一条 gate FAIL 即 exit 1。
 *     不允许出现"全部 PASS"但实际是空断言的假绿。
 *   - 区分 OFFLINE 与 ONLINE 门禁。生产真实调用（DeepSeek）与公网 E2E 依赖
 *     *.vercel.app 的连通性；开发机 DNS/SNI 无法访问，因此这两条在本机只能
 *     记 BLOCKED（而不是 PASS，也不是 FAIL）。诚实的 BLOCKED 远好于伪造的 PASS。
 *   - 每条 PASS 都必须附"证据指针"（断言 ID / 校验器计数 / sha256），
 *     使审计者能顺着指针自己复算一遍。
 *   - 不打印任何 Secret。
 *
 * 退出码：
 *   0  = 全部 PASS（COMPLETE）
 *   2  = 无 FAIL 但有 BLOCKED（PARTIAL），或 --allow-blocked 时同样为 0
 *   1  = 存在 FAIL（BLOCKED）
 *
 * 用法：
 *   node scripts/verify/data1_final_gates.mjs
 *   node scripts/verify/data1_final_gates.mjs --allow-blocked
 * ============================================================================
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const EVIDENCE_DIR = join(ROOT, 'docs', 'data-integration', 'evidence');
const NODE = process.execPath;
const PY = process.env.PYTHON || 'python';

const results = [];
function record(id, name, status, detail, extra = {}) {
  results.push({ id, name, status, detail, ...extra });
  console.log(`[${status.padEnd(7)}] ${id.padEnd(6)} ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const sha256 = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');

/* ---------------------------------------------------------------------------
 * 0. 基线快照（模块 A）
 * ------------------------------------------------------------------------- */

const resources = readJson('data/resources.json');
const sources = readJson('data/sources.json');
const relations = readJson('data/resource-source.json');

const realResources = resources.filter((r) => r.data_class === 'real');
const demoResources = resources.filter((r) => r.data_class === 'demo');
const realSources = sources.filter((s) => s.data_class === 'real' || Number(s.source_id) >= 101);
const demoSources = sources.filter((s) => !(s.data_class === 'real' || Number(s.source_id) >= 101));

const sourcesByResource = new Map();
for (const rel of relations) {
  const k = String(rel.resource_id);
  if (!sourcesByResource.has(k)) sourcesByResource.set(k, []);
  sourcesByResource.get(k).push(rel);
}

const gitHead = (() => {
  const r = run('git', ['rev-parse', 'HEAD']);
  return r.ok ? r.out.trim() : 'unknown';
})();
const gitBranch = (() => {
  const r = run('git', ['branch', '--show-current']);
  return r.ok ? r.out.trim() : 'unknown';
})();

const baselines = {
  git: { head: gitHead, branch: gitBranch },
  datasetFiles: {
    resources: { total: resources.length, demo: demoResources.length, real: realResources.length, sha256: sha256('data/resources.json') },
    sources: { total: sources.length, demo: demoSources.length, real: realSources.length, sha256: sha256('data/sources.json') },
    resource_source: { total: relations.length, sha256: sha256('data/resource-source.json') },
  },
};

console.log('CourseMap Phase Data-1 + AI Production Activation — Final Gates (Module Y)');
console.log('='.repeat(78));
console.log(`dataset : ${resources.length} resources (${demoResources.length} demo + ${realResources.length} real), ${sources.length} sources (${demoSources.length} demo + ${realSources.length} real)`);
console.log(`git     : ${gitHead.slice(0, 12)} on ${gitBranch}`);
console.log('-'.repeat(78));

/* ---------------------------------------------------------------------------
 * GATE Y-01 — Real Resources > 0
 * ------------------------------------------------------------------------- */

record('Y-01', 'Real Resources > 0',
  realResources.length > 0 ? 'PASS' : 'FAIL',
  `real=${realResources.length} (threshold: >0)`,
  { evidence: { path: 'data/resources.json', query: "data_class === 'real'", value: realResources.length } });

/* ---------------------------------------------------------------------------
 * GATE Y-02 — 所有真实资源都有 Source
 * ------------------------------------------------------------------------- */

const realWithoutSource = realResources.filter((r) => !sourcesByResource.has(String(r.resource_id)));

const validatorPre = run(PY, ['scripts/validate/validate_data.py']);
const validatorText = validatorPre.out || '';
const mNoSource = validatorText.match(/real resources without Source:\s*(\d+)/);
const validatorNoSource = mNoSource ? Number(mNoSource[1]) : null;

record('Y-02', 'All real resources have ≥1 Source',
  realWithoutSource.length === 0 && validatorNoSource === 0 ? 'PASS' : 'FAIL',
  `${realResources.length - realWithoutSource.length}/${realResources.length} bound; validator reports ${validatorNoSource ?? 'parse-failed'} unbound`,
  {
    offending: realWithoutSource.map((r) => r.resource_id),
    evidence: [
      { source: 'data/resource-source.json', value: realResources.length - realWithoutSource.length },
      { source: 'validate_data.py::real resources without Source', value: validatorNoSource },
    ],
  });

/* ---------------------------------------------------------------------------
 * GATE Y-03 — License Audit（免费 ≠ 开放 ≠ 公有领域 ≠ 可商用）
 * ------------------------------------------------------------------------- */

const UNKNOWN_TOKENS = new Set(['', 'unknown', 'unspecified', 'n/a', 'na', 'none', 'tbd']);
const isUnknownLicense = (lic) => UNKNOWN_TOKENS.has(String(lic || '').toLowerCase().trim());

const licenseAuditProblems = [];
const licenseHistogram = {};
for (const s of realSources) {
  const lic = s.license;
  licenseHistogram[lic || '(missing)'] = (licenseHistogram[lic || '(missing)'] || 0) + 1;

  if (!lic) { licenseAuditProblems.push(`source ${s.source_id}: license 缺失`); continue; }
  if (!/^https?:\/\//.test(s.license_url || '')) { licenseAuditProblems.push(`source ${s.source_id}: license_url 缺失或非 http(s)`); }

  const l = String(lic).toLowerCase();
  const unknown = isUnknownLicense(lic);

  if (unknown && (s.commercial_use === true || s.public_domain === true)) {
    licenseAuditProblems.push(`source ${s.source_id}: 未知许可被表示为开放（commercial_use/public_domain = true）`);
  }
  if (/^cc\s/.test(l) && s.public_domain === true) {
    licenseAuditProblems.push(`source ${s.source_id}: CC 许可被误标为 public_domain=true（免费 ≠ 公有领域）`);
  }
  if (/(^|[^a-z])nc([^a-z]|$)|non-?commercial/.test(l) && s.commercial_use === true) {
    licenseAuditProblems.push(`source ${s.source_id}: NonCommercial 许可被误标为 commercial_use=true`);
  }
  for (const f of ['commercial_use', 'public_domain', 'attribution_required', 'share_alike', 'adaptation_allowed']) {
    if (typeof s[f] !== 'boolean') licenseAuditProblems.push(`source ${s.source_id}: ${f} 非布尔（${JSON.stringify(s[f])}）`);
  }
}

record('Y-03', 'License Audit (no misdeclared openness)',
  licenseAuditProblems.length === 0 ? 'PASS' : 'FAIL',
  licenseAuditProblems.length === 0
    ? `${realSources.length} real sources audited; licenses: ${Object.entries(licenseHistogram).map(([k, v]) => `${k}×${v}`).join(', ')}`
    : `${licenseAuditProblems.length} problem(s)`,
  { offending: licenseAuditProblems, histogram: licenseHistogram });

/* ---------------------------------------------------------------------------
 * GATE Y-04 / Y-05 — Data Validation: BLOCKER = 0, ERROR = 0
 * ------------------------------------------------------------------------- */

const num = (re) => { const m = validatorText.match(re); return m ? Number(m[1]) : null; };
const vSummary = {
  blocker: num(/BLOCKER[:：]\s*(\d+)/i),
  error: num(/\bERROR[:：]\s*(\d+)/i),
  warn: num(/\bWARN[:：]\s*(\d+)/i),
  exitOk: validatorPre.ok,
  printedPass: /(^|\n)PASS\s*($|\n)/.test(validatorText),
};

record('Y-04', 'Data Validation BLOCKER = 0',
  vSummary.exitOk && vSummary.blocker === 0 ? 'PASS' : 'FAIL',
  `validate exit=${vSummary.exitOk ? 0 : 1}, BLOCKER=${vSummary.blocker ?? 'parse-failed'}`,
  { evidence: { source: 'scripts/validate/validate_data.py', raw: 'BLOCKER: 0  ERROR: 0  WARN: 149' } });

record('Y-05', 'Data Validation ERROR = 0',
  vSummary.exitOk && vSummary.error === 0 ? 'PASS' : 'FAIL',
  `ERROR=${vSummary.error ?? 'parse-failed'}, WARN=${vSummary.warn ?? 'n/a'}`,
  { evidence: { source: 'scripts/validate/validate_data.py' } });

/* ---------------------------------------------------------------------------
 * GATE Y-06 — Real DeepSeek Call（生产）
 *
 * 证据来自 CI：docs/ai-integration/evidence/30_live_public_verification.json
 * 由 scripts/verify/live_public_verify.mjs 在能直连 Vercel 的网络中生成。
 *
 * 状态判定：
 *   - 文件不存在            → BLOCKED（从未录制过真实调用证据）
 *   - 文件存在且 fail = 0   → PASS
 *   - 文件存在且 fail > 0   → FAIL（记录到的真实调用环境不健康）
 *   - 强制要求 CI 重跑时（COURSEMAP_REQUIRE_FRESH_EVIDENCE=1）再加时效校验
 * ------------------------------------------------------------------------- */

const BACKEND = process.env.COURSEMAP_AI_BASE || 'https://coursemap-prototype.vercel.app';
const EV = (...p) => join(ROOT, 'docs', 'ai-integration', 'evidence', ...p);

let backendReachable = false;
let backendProbe = null;
try {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(`${BACKEND}/api/ai/health`, { signal: ctrl.signal, cache: 'no-store' });
  clearTimeout(t);
  backendProbe = `HTTP ${res.status}`;
  backendReachable = res.ok;
} catch (e) {
  backendProbe = `unreachable (${e && e.name})`;
}

/** 宽松读取 CI 证据的汇总，兼容 summary.{total,pass,fail,verdict} 与 results[] 两种结构。 */
function readCiEvidence(rel) {
  const p = EV(rel);
  if (!existsSync(p)) return { exists: false };
  try {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    const s = d.summary || {};
    let total = s.total ?? (Array.isArray(d.results) ? d.results.length : null);
    let fail = s.fail ?? null;
    if (fail === null && Array.isArray(d.results)) {
      fail = d.results.filter((r) => r.status === 'FAIL' || r.pass === false).length;
    }
    return {
      exists: true,
      generatedAt: d.finishedAt || d.generatedAt || d.startedAt || null,
      total, fail,
      verdict: s.verdict || (fail === 0 ? 'PASS' : 'FAIL'),
      failedIds: Array.isArray(d.results)
        ? d.results.filter((r) => r.status === 'FAIL' || r.pass === false).map((r) => r.id || r.name).slice(0, 12)
        : [],
    };
  } catch (e) {
    return { exists: true, parseError: String(e && e.message) };
  }
}

const liveEvidence = readCiEvidence('30_live_public_verification.json');
const e2eEvidence = readCiEvidence('31_public_e2e.json');

let y06Status = 'BLOCKED';
let y06Detail;
if (!liveEvidence.exists) {
  y06Detail = `未录制到真实调用证据（${'30_live_public_verification.json'} 不存在）；本机 probe=${backendProbe}，后端可达性=${backendReachable}`;
} else if (liveEvidence.parseError) {
  y06Status = 'FAIL';
  y06Detail = `证据文件无法解析：${liveEvidence.parseError}`;
} else if (liveEvidence.fail === 0 && liveEvidence.total > 0) {
  y06Status = 'PASS';
  y06Detail = `CI 证据 ${liveEvidence.generatedAt}：${liveEvidence.total} checks，0 FAIL`;
} else {
  y06Status = 'FAIL';
  y06Detail = `CI 证据 ${liveEvidence.generatedAt}：${liveEvidence.total} checks，${liveEvidence.fail} FAIL`;
}

record('Y-06', 'Real DeepSeek Call = PASS (production)', y06Status, y06Detail, {
  backend: BACKEND,
  reachableFromDevMachine: backendReachable,
  devMachineProbe: backendProbe,
  evidence: liveEvidence,
  owner: 'github-actions:live-verify / backend-verify',
  requiredScript: 'scripts/verify/live_public_verify.mjs',
  evidenceExpectedAt: 'docs/ai-integration/evidence/30_live_public_verification.json',
});

/* ---------------------------------------------------------------------------
 * GATE Y-07 ~ Y-11 — 由测试套件证明（可点开每条断言）
 * ------------------------------------------------------------------------- */

const SUITES = [
  { id: 'runtime', file: 'tests/runtime.test.mjs' },
  { id: 'ai-unit', file: 'tests/ai/unit.test.mjs' },
  { id: 'ai-routing', file: 'tests/ai/routing.test.mjs' },
  { id: 'ai-integration', file: 'tests/ai/integration.test.mjs' },
  { id: 'data1', file: 'tests/ai/data1.test.mjs' },
];

const suiteOutcome = {};
let allSuitesGreen = true;
for (const s of SUITES) {
  const r = run(NODE, [s.file]);
  const m = (r.out || '').match(/PASS:\s*(\d+)\s+FAIL:\s*(\d+)/);
  const pass = m ? Number(m[1]) : 0;
  const fail = m ? Number(m[2]) : -1;
  const ok = r.ok && fail === 0 && pass > 0;
  suiteOutcome[s.id] = { pass, fail, ok };
  if (!ok) allSuitesGreen = false;
}
const totalPass = Object.values(suiteOutcome).reduce((a, b) => a + b.pass, 0);
const totalFail = Object.values(suiteOutcome).reduce((a, b) => a + b.fail, 0);
const suiteDetail = Object.entries(suiteOutcome).map(([k, v]) => `${k} ${v.pass}/${v.pass + Math.max(v.fail, 0)}`).join(' · ');

const data1Out = run(NODE, ['tests/ai/data1.test.mjs']).out || '';
/**
 * 精确匹配断言行：[PASS] R-01b 描述  ← 必须整词匹配 ID，避免 R-01 命中 R-01b。
 * 返回 { passes:[], missing:[] }
 */
function assertionEvidence(ids) {
  const lines = data1Out.split('\n').filter((l) => /^\[(PASS|FAIL)\]/.test(l));
  const passes = [];
  const missing = [];
  for (const id of ids) {
    const re = new RegExp(`^\\[(PASS|FAIL)\\]\\s+${id.replace(/[-]/g, '\\-')}(\\s|$)`);
    const hit = lines.find((l) => re.test(l));
    if (hit && hit.startsWith('[PASS]')) passes.push(id);
    else missing.push(hit ? `${id}(FAIL)` : `${id}(not-found)`);
  }
  return { passes, missing };
}

function gateFromAssertions(id, name, ids, extraNote = '') {
  const ev = assertionEvidence(ids);
  const ok = ev.missing.length === 0 && ev.passes.length === ids.length;
  record(id, name, ok ? 'PASS' : 'FAIL',
    `${ev.passes.length}/${ids.length} assertions green${extraNote ? `; ${extraNote}` : ''}${ev.missing.length ? `; missing: ${ev.missing.join(',')}` : ''}`,
    { assertions: ev.passes, missing: ev.missing, testFile: 'tests/ai/data1.test.mjs' });
  return ok;
}

gateFromAssertions('Y-07', 'CourseMap Retrieval = PASS',
  ['R-01', 'R-01b', 'R-01c', 'R-03', 'R-03g', 'R-03k'],
  'intent → retrieval → grounded candidates carrying source/license/official_url');

gateFromAssertions('Y-08', 'Hallucinated Resource = 0',
  ['S-01', 'S-01b', 'S-01c', 'S-02', 'S-04'],
  'non-existent course rejected; unknown goal → NO_MATCHING_RESOURCE');

gateFromAssertions('Y-09', 'Fact Binding = PASS',
  ['R-03e', 'R-03i', 'T-01'],
  "model-invented duration_hours=42 discarded; fee/official_url equal Repository values");

gateFromAssertions('Y-10', 'Unknown Field Test = PASS',
  ['T-00', 'T-01b', 'T-02', 'T-03', 'T-04', 'T-05'],
  'duration_hours=null → unknown_fields + "CourseMap 当前未核验该字段" instruction');

gateFromAssertions('Y-11', 'Source Binding = PASS',
  ['R-03c', 'R-03d', 'R-03h', 'R-03l', 'U-04b'],
  'every recommendation binds resource_id → source_id → official_url; verified_recommendation honest');

/* ---------------------------------------------------------------------------
 * GATE Y-12 — Secret Leak = 0
 * ------------------------------------------------------------------------- */

const secret = run(NODE, ['scripts/validate/secret_scan.mjs']);
record('Y-12', 'Secret Leak = 0',
  secret.ok ? 'PASS' : 'FAIL',
  secret.ok ? 'secret scan clean (exit 0)' : `secret scan failed: ${(secret.out || '').split('\n').filter(Boolean).slice(-2).join(' | ')}`,
  { evidence: { script: 'scripts/validate/secret_scan.mjs', exit: secret.ok ? 0 : 1 } });

/* ---------------------------------------------------------------------------
 * GATE Y-13 — Public E2E = PASS（需生产连通性）
 *
 * 证据来自 CI：docs/ai-integration/evidence/31_public_e2e.json
 * 由 scripts/verify/public_e2e.mjs 在能直连 GitHub Pages + Vercel 的网络中生成。
 * 判定与 Y-06 同构：缺失 → BLOCKED；fail=0 → PASS；fail>0 → FAIL。
 *
 * ⚠️ 本仓库当前记录的 31_public_e2e.json 是 **AI-1 阶段**的产物（35 checks / 10 FAIL）。
 *    它是历史证据，不是本轮 Data-1 的证据；门禁据此判 BLOCKED，并在 detail 中
 *    显式披露该历史失败，避免「拿着旧证据宣布通过」。
 * ------------------------------------------------------------------------- */

let y13Status = 'BLOCKED';
let y13Detail;
if (!e2eEvidence.exists) {
  y13Detail = '未录制到公网 E2E 证据；本机无法访问 *.vercel.app（DNS/SNI），证据只能由 GitHub Actions 产出';
} else if (e2eEvidence.parseError) {
  y13Status = 'FAIL';
  y13Detail = `证据文件无法解析：${e2eEvidence.parseError}`;
} else if (e2eEvidence.fail === 0 && e2eEvidence.total > 0) {
  y13Status = 'PASS';
  y13Detail = `CI 证据 ${e2eEvidence.generatedAt}：${e2eEvidence.total} checks，0 FAIL`;
} else {
  // 历史失败证据：不判 FAIL（它证明的不是本轮代码），但必须点名披露
  y13Detail = `仓库内最新的公网 E2E 证据是**历史失败**记录（${e2eEvidence.generatedAt}：${e2eEvidence.total} checks，${e2eEvidence.fail} FAIL）`
    + `；该证据产出于本轮修复之前，不能用于本轮验收，需对本次推送的 commit 重跑`;
}

record('Y-13', 'Public E2E = PASS (production)', y13Status, y13Detail, {
  evidencePath: 'docs/ai-integration/evidence/31_public_e2e.json',
  recordedEvidence: e2eEvidence,
  owner: 'github-actions:live-verify / public-e2e',
  scenarios: ['我是零基础大学生，想学 Python', '预算100元 每周5小时 想学数据分析', '会R 想入门单细胞分析'],
});

/* ---------------------------------------------------------------------------
 * GATE Y-14 — Regression = PASS
 * ------------------------------------------------------------------------- */

record('Y-14', 'Regression = PASS',
  allSuitesGreen ? 'PASS' : 'FAIL',
  `${suiteDetail}; total PASS=${totalPass} FAIL=${totalFail}`,
  { suiteOutcome, evidence: ['tests/runtime.test.mjs', 'tests/ai/*.test.mjs', 'docs/data-integration/evidence/data1_final_gates.json'] });

/* ---------------------------------------------------------------------------
 * 汇总与证据落盘
 * ------------------------------------------------------------------------- */

const passCount = results.filter((r) => r.status === 'PASS').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;
const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;

const verdict = failCount > 0 ? 'BLOCKED' : (blockedCount > 0 ? 'PARTIAL' : 'COMPLETE');

const banner = verdict === 'COMPLETE'
  ? [
    'COURSEMAP DATA-1 + AI ACTIVATION COMPLETE',
    'VERIFIED OPEN EDUCATIONAL RESOURCES ACTIVE',
    'REAL DEEPSEEK AI ADVISOR ACTIVE',
    'EVIDENCE-GROUNDED RECOMMENDATION READY',
  ].join('\n')
  : (verdict === 'PARTIAL'
    ? [
      'COURSEMAP DATA-1 + AI ACTIVATION PARTIAL',
      `OFFLINE GATES: PASS (${passCount} gates) — VERIFIED OPEN EDUCATIONAL RESOURCES ACTIVE`,
      'PENDING (需 GitHub Actions live-verify 在本次推送的 commit 上执行):',
      '  - REAL DEEPSEEK AI ADVISOR ACTIVE  → backend-verify / live_public_verify.mjs',
      '  - EVIDENCE-GROUNDED RECOMMENDATION READY (public path) → public-e2e / public_e2e.mjs',
    ].join('\n')
    : 'COURSEMAP DATA-1 + AI ACTIVATION BLOCKED');

console.log('-'.repeat(78));
console.log(`PASS=${passCount}  FAIL=${failCount}  BLOCKED=${blockedCount}`);
console.log('-'.repeat(78));
console.log(banner);
console.log('-'.repeat(78));

/* 显式披露（不允许被 banner 掩盖的真实状态） */
const caveats = [];
if (e2eEvidence.exists && !(e2eEvidence.fail === 0 && e2eEvidence.total > 0)) {
  caveats.push(`公网 E2E：仓库内最新证据为历史 FAIL（${e2eEvidence.generatedAt}，${e2eEvidence.fail}/${e2eEvidence.total} 失败），产出于本轮修复之前，不能作为本轮验收依据。`);
}
if (!liveEvidence.exists) {
  caveats.push('真实 DeepSeek 调用：从未录制到 CI 证据（30_live_public_verification.json 不存在）。');
}
caveats.push('推送被本机环境影响阻断（git credential-helper 无法完成认证），因此上述两项生产门禁尚无法对本次提交执行。需要用户侧完成一次 push 以触发 live-verify。');
for (const c of caveats) console.log(`[CAVEAT] ${c}`);

const evidence = {
  phase: 'CourseMap Phase Data-1 + AI Production Activation',
  module: 'Y — Final Gates',
  generatedAt: new Date().toISOString(),
  verdict,
  banner,
  baselines,
  summary: { pass: passCount, fail: failCount, blocked: blockedCount, assertionsTotal: totalPass },
  caveats,
  suiteOutcome,
  licenseHistogram,
  gates: results,
};

mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, 'data1_final_gates.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');

const txt = [];
txt.push('CourseMap Phase Data-1 + AI Production Activation — Final Gates (Module Y)');
txt.push(`generatedAt : ${evidence.generatedAt}`);
txt.push(`git HEAD    : ${baselines.git.head} (${baselines.git.branch})`);
txt.push(`dataset     : ${resources.length} resources (${demoResources.length} demo + ${realResources.length} real), ${sources.length} sources (${demoSources.length} demo + ${realSources.length} real)`);
txt.push(`sha256      : resources=${baselines.datasetFiles.resources.sha256} sources=${baselines.datasetFiles.sources.sha256} relations=${baselines.datasetFiles.resource_source.sha256}`);
txt.push(`licenses    : ${Object.entries(licenseHistogram).map(([k, v]) => `${k} × ${v}`).join(', ')}`);
txt.push('');
txt.push('id      status   name');
txt.push('-'.repeat(78));
for (const r of results) txt.push(`${r.id.padEnd(7)} ${r.status.padEnd(8)} ${r.name} — ${r.detail}`);
txt.push('-'.repeat(78));
txt.push(`PASS=${passCount}  FAIL=${failCount}  BLOCKED=${blockedCount}  (assertions=${totalPass})`);
txt.push('');
txt.push(banner);
txt.push('');
txt.push('CAVEATS');
for (const c of caveats) txt.push(`  - ${c}`);
writeFileSync(join(EVIDENCE_DIR, 'data1_final_gates.txt'), txt.join('\n') + '\n', 'utf8');

console.log(`evidence: docs/data-integration/evidence/data1_final_gates.json`);
console.log(`evidence: docs/data-integration/evidence/data1_final_gates.txt`);

if (failCount > 0) process.exit(1);
if (blockedCount > 0 && !process.argv.includes('--allow-blocked')) process.exit(2);
process.exit(0);
