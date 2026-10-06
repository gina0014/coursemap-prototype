/* ============================================================================
   CourseMap — scripts/verify/public_e2e.mjs
   ----------------------------------------------------------------------------
   Production Activation 公网前端 E2E：用真实 Chrome 访问 GitHub Pages 上的
   CourseMap，执行用户场景，并断言「前端确实切到了真实 DeepSeek 模式」，
   而不是只看页面能不能打开。

   为什么必须做：
     规则降级回答与 DeepSeek 回答在视觉上很像；只有断言
       (a) 徽标/披露文案 = Real LLM
       (b) 结果卡 engine: deepseek-beta
       (c) 渲染事实 == CourseMap 数据（Fact Hydration 落到 DOM）
     才能证明请求真的经过了 Frontend → Vercel Backend → DeepSeek。

   覆盖：
     E-*  前端部署生效（config 已指向生产后端）
     M-*  模式判定（REAL LLM vs 降级）与 REAL LLM + DEMO DATA 双重表达
     S-*  三个用户场景：真实回答 + 接地 + 事实绑定（DOM 层）
     F-*  优雅降级保留（阻断后端后仍可用规则引擎，且不报错）

   用法：
     node scripts/verify/public_e2e.mjs
   环境变量：
     COURSEMAP_FRONTEND_BASE  默认 https://gina0014.github.io/coursemap-prototype
     COURSEMAP_EXPECT_BACKEND 默认 https://coursemap-prototype.vercel.app
     CHROME_PATH              可选
     VERIFY_WAIT_MS           等待前端部署就绪的最长时间（默认 300000）
     VERIFY_EVIDENCE_DIR      证据目录
   ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromePage, attachDiagnostics, newBucket, sleep } from '../regression/cdp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const FRONTEND = (process.env.COURSEMAP_FRONTEND_BASE || 'https://gina0014.github.io/coursemap-prototype').replace(/\/+$/, '');
const EXPECT_BACKEND = (process.env.COURSEMAP_EXPECT_BACKEND || 'https://coursemap-prototype.vercel.app').replace(/\/+$/, '');
const WAIT_MS = Number.parseInt(process.env.VERIFY_WAIT_MS || '300000', 10);
const EVIDENCE_DIR = resolve(ROOT, process.env.VERIFY_EVIDENCE_DIR || 'docs/ai-integration/evidence');
const VIEWPORT = { width: 1440, height: 1100 };

const startedAt = new Date().toISOString();
const results = [];
function check(id, description, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ id, description, status, detail });
  console.log(`[${status}] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
}
const warn = (id, description, detail = '') => {
  results.push({ id, description, status: 'WARN', detail });
  console.log(`[WARN] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
};

const SCENARIOS = [
  { id: 'S1', label: '零基础大学生想学 Python', message: '我是零基础大学生，想学 Python。' },
  { id: 'S2', label: '预算100元 每周5小时 想学数据分析', message: '预算100元，每周5小时，想学数据分析。' },
  { id: 'S3', label: '会R 想入门单细胞分析', message: '我会R，想入门单细胞分析。' },
  /* Module R 的验收场景：免费 + 零基础 → 应命中已核验的开放教育资源 */
  { id: 'S4', label: '零基础大学生想免费学 Python（Module R）', message: '我是零基础大学生，想免费学 Python。' },
];

/* Module O：CourseMap 未核验字段的统一文案（必须与前端一致） */
const UNVERIFIED_TEXT = 'CourseMap 当前未核验该字段';

/* ---------------------------------------------------------------------------
   E-01 前端部署就绪：config.js 必须已指向生产后端
   --------------------------------------------------------------------------- */
console.log('================================================');
console.log('CourseMap Data-1 — Public Frontend E2E (real browser)');
console.log('================================================');
console.log(`Frontend : ${FRONTEND}`);
console.log(`Expected backend in config: ${EXPECT_BACKEND}`);
console.log('------------------------------------------------');

let configText = '';
{
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const res = await fetch(`${FRONTEND}/js/config.js?cb=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        configText = await res.text();
        if (configText.includes(EXPECT_BACKEND)) break;
      }
    } catch { /* 还没部署 */ }
    const left = deadline - Date.now();
    if (left <= 0) break;
    console.log(`    · 等待前端部署（config.js 尚未包含生产后端地址），${Math.ceil(left / 1000)}s 后重试`);
    await sleep(Math.min(15_000, Math.max(3_000, left)));
  }
}
check('E-00', '公网前端 js/config.js 可达', configText.length > 0, `bytes=${configText.length}`);
check('E-01', 'js/config.js 已指向生产后端（前端切换已部署）', configText.includes(EXPECT_BACKEND),
  configText.includes(EXPECT_BACKEND) ? EXPECT_BACKEND : 'config.js 仍未指向生产后端');
check('E-01b', 'config.js 中不含任何 secret', !/sk-[a-zA-Z0-9]{10,}|api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(configText));

/* E-04 后端部署就绪：必须等到「本次提交对应的 Vercel 部署」生效，
   否则会对着旧构建做断言（线上首次运行就是这样误判的） */
{
  const deadline = Date.now() + WAIT_MS;
  let health = null;
  for (;;) {
    try {
      const res = await fetch(`${EXPECT_BACKEND}/api/ai/health`, { cache: 'no-store' });
      if (res.ok) { health = await res.json(); break; }
    } catch { /* 部署未就绪或网络未通 */ }
    const left = deadline - Date.now();
    if (left <= 0) break;
    console.log(`    · 等待生产后端部署就绪（/api/ai/health 尚不可用），${Math.ceil(left / 1000)}s 后重试`);
    await sleep(Math.min(15_000, Math.max(3_000, left)));
  }
  check('E-04', '生产后端 /api/ai/health 已就绪（部署已生效）',
    !!(health && health.success === true), JSON.stringify(health && health.data));
  check('E-04b', '生产后端已读取到模型密钥（llm_configured=true）',
    !!(health && health.data && health.data.llm_configured === true),
    `llm_configured=${health && health.data && health.data.llm_configured}, adapter=${health && health.data && health.data.adapter}`);
  /* Module I：模型名必须落在官方当前模型表内。
     官方当前表（2026-10-06 核验）：deepseek-v4-flash / deepseek-v4-pro。
     已停用（2026-07-24 15:59 UTC 起返回 HTTP 错误）：deepseek-chat / deepseek-reasoner。 */
  const servedModel = (health && health.data && health.data.model) || '';
  check('E-04c', '生产后端模型为官方当前模型（deepseek-v4-flash / deepseek-v4-pro）',
    /^deepseek-v4-(flash|pro)$/.test(servedModel), `model=${servedModel}`);
  check('E-04c2', '生产后端未使用已停用模型名（deepseek-chat / deepseek-reasoner / 拼写错误的 deepseek-flash）',
    !/^deepseek-(chat|reasoner|flash)$/i.test(servedModel), `model=${servedModel}`);
  /* Module P/Y：真实资源必须真的随部署上线（不是只在本地数据文件里） */
  const counts = (health && health.data && health.data.data_class_counts) || null;
  check('E-04d', '生产后端已加载真实 OER 资源（data_class_counts.real > 0）',
    !!(counts && counts.real > 0), JSON.stringify(counts));
  check('E-04e', '生产后端版本标记为 v0.3-Data1（本轮部署已生效）',
    !!health && health.meta && health.meta.version === 'v0.3-Data1',
    `version=${health && health.meta && health.meta.version}`);
}

/* 取一份 CourseMap 事实用于 DOM 层比对 */
let resources = [];
{
  const res = await fetch(`${FRONTEND}/data/resources.json?cb=${Date.now()}`, { cache: 'no-store' });
  const j = await res.json();
  resources = Array.isArray(j) ? j : (j.rows || []);
}
const byId = new Map(resources.map((r) => [String(r.resource_id), r]));
check('E-02', '可从公网取到 CourseMap 资源事实（用于 DOM 比对）', resources.length > 0, `resources=${resources.length}`);

/* 取一份来源事实（Module U：许可语义比对） */
let sources = [];
{
  const res = await fetch(`${FRONTEND}/data/sources.json?cb=${Date.now()}`, { cache: 'no-store' });
  const j = await res.json();
  sources = Array.isArray(j) ? j : (j.rows || []);
}
const sourceById = new Map(sources.map((s) => [String(s.source_id), s]));
const realResourceIds = new Set(resources.filter((r) => r.data_class === 'real').map((r) => String(r.resource_id)));
check('E-02b', '公网数据集含真实资源（data_class=real）', realResourceIds.size > 0, `real=${realResourceIds.size}`);
check('E-02c', '公网数据集含真实来源与许可', sources.some((s) => s.data_class === 'real' && s.license),
  `real sources with license=${sources.filter((s) => s.data_class === 'real' && s.license).length}`);

/** 取某资源的许可摘要（来自 Source，非模型） */
function licenseOf(resourceRow) {
  if (!resourceRow) return null;
  const ids = resourceRow.source_ids || [];
  for (const sid of ids) {
    const s = sourceById.get(String(sid));
    if (s && s.license) return s;
  }
  return null;
}

/* ---------------------------------------------------------------------------
   启动浏览器
   --------------------------------------------------------------------------- */
const bucket = newBucket();
const { cdp, chrome } = await launchChromePage({
  port: 9399, profileName: 'e2e', viewport: VIEWPORT, navigateTo: `${FRONTEND}/pages/advisor.html`,
});
attachDiagnostics(cdp, bucket);

/* 等待页面渲染完成 */
let readyState = null;
{
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const v = await cdp.evalJson(`(() => JSON.stringify({
      ready: document.readyState === 'complete',
      badge: (document.querySelector('.detail-head__title .badge') || {}).textContent || '',
      hasForm: !!document.querySelector('[data-advisor-form]'),
    }))()`);
    if (v && !v.__error) {
      const s = JSON.parse(v);
      readyState = s;
      if (s.ready && s.hasForm) break;
    }
    await sleep(400);
  }
}
check('E-03', 'P-10 AI 学习顾问页在公网正常渲染', !!(readyState && readyState.hasForm),
  JSON.stringify(readyState));

/* ---------------------------------------------------------------------------
   M — 模式判定：必须是 REAL LLM，而不是规则降级
   --------------------------------------------------------------------------- */
const modeBadge = readyState ? String(readyState.badge) : '';
check('M-00', '页面徽标显示 Real LLM（已被识别为真实模型模式）', /Real LLM/i.test(modeBadge),
  `badge="${modeBadge}"`);

const disclosure = await cdp.evalJson(`(() => {
  const n = document.querySelector('[data-coursemap-ai-disclosure]');
  return n ? n.innerText : '';
})()`);
check('M-01', '披露文案说明由 DeepSeek 服务端代理驱动', /DeepSeek/i.test(String(disclosure)),
  String(disclosure).slice(0, 140).replace(/\n/g, ' '));
/* Module P：REAL AI ≠ ALL DATA REAL —— 页面必须同时说清「AI 是真的」与「数据里有真实也有演示」 */
const bodyText = await cdp.evalJson('(() => document.body.innerText)()');
check('M-02', '页面声明「AI 是真实的 ≠ 全部数据都是真实的」',
  /不等于|≠/.test(String(bodyText)) && /DEMO|演示/.test(String(bodyText)),
  'body states REAL LLM ≠ ALL DATA REAL');
check('M-03', '页面披露数据集真实/演示构成（运行时计算的条数）',
  /真实/.test(String(disclosure)) && /演示|DEMO/.test(String(disclosure)),
  String(disclosure).replace(/\n/g, ' ').slice(0, 200));

/* ---------------------------------------------------------------------------
   S — 三个场景
   --------------------------------------------------------------------------- */
async function submitScenario(message) {
  await cdp.evalJson(`(() => {
    const ta = document.querySelector('[data-advisor-input]');
    ta.value = ${JSON.stringify(message)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-advisor-form]').requestSubmit();
    return true;
  })()`);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const v = await cdp.evalJson(`(() => {
      const r = document.querySelector('[data-advisor-result]');
      const s = document.querySelector('[data-advisor-status]');
      return JSON.stringify({
        hasCard: !!document.querySelector('[data-coursemap-ai-response]'),
        statusText: s ? s.innerText.slice(0, 200) : '',
        html: r ? r.innerHTML.length : 0,
      });
    })()`);
    if (v && !v.__error) {
      const s = JSON.parse(v);
      if (s.hasCard) return s;
    }
    await sleep(700);
  }
  return { hasCard: false, statusText: 'TIMEOUT', html: 0 };
}

async function readResult() {
  const v = await cdp.evalJson(`(() => {
    const card = document.querySelector('[data-coursemap-ai-response]');
    if (!card) return JSON.stringify(null);
    const title = (card.querySelector('.card__title') || {}).textContent || '';
    const recs = Array.from(card.querySelectorAll('[data-coursemap-ai-rec]')).map((n) => {
      const rows = {};
      n.querySelectorAll('.cmp-card__row').forEach((row) => {
        const label = (row.querySelector('.cmp-card__label') || {}).textContent || '';
        const span = row.querySelectorAll('span');
        rows[label] = span.length ? span[span.length - 1].textContent.trim() : '';
      });
      const official = n.querySelector('[data-coursemap-official-link]');
      return {
        id: n.getAttribute('data-coursemap-ai-rec'),
        rows,
        hasDemoBadge: !!n.querySelector('.badge'),
        dataClass: n.getAttribute('data-coursemap-data-class') || '',
        verified: n.getAttribute('data-coursemap-verified') === 'true',
        officialHref: official ? official.getAttribute('href') : null,
        officialText: official ? official.textContent.trim() : '',
      };
    });
    return JSON.stringify({
      title, recs,
      hasAiErrorNotice: !!document.querySelector('[data-coursemap-ai-error]'),
      text: card.innerText.slice(0, 2000),
      realRecs: card.getAttribute('data-coursemap-real-recs'),
      demoRecs: card.getAttribute('data-coursemap-demo-recs'),
      grounding: (document.querySelector('[data-coursemap-grounding]') || {}).textContent || '',
    });
  })()`);
  return v && !v.__error ? JSON.parse(v) : null;
}

const allRecommendations = [];
let groundingSeen = false;
let realRecsAttrSeen = false;

for (const sc of SCENARIOS) {
  const submitState = await submitScenario(sc.message);
  check(`${sc.id}-00`, `[${sc.label}] 提交后返回结果卡`, submitState.hasCard,
    `status="${String(submitState.statusText).slice(0, 120)}"`);

  const out = await readResult();
  if (!out) { check(`${sc.id}-01`, `[${sc.label}] 可读取结果卡`, false, 'no card'); continue; }
  allRecommendations.push(...out.recs.map((r) => ({ ...r, scenario: sc.id })));
  if (out.grounding && out.grounding.trim()) groundingSeen = true;
  if (out.realRecs !== null && out.realRecs !== undefined && out.realRecs !== '') realRecsAttrSeen = true;

  check(`${sc.id}-01`, `[${sc.label}] 结果卡引擎为 deepseek-beta（真实模型）`,
    /deepseek-beta/i.test(out.title), `title="${out.title}"`);
  check(`${sc.id}-04`, `[${sc.label}] 未出现降级错误提示`, !out.hasAiErrorNotice && !/暂时不可用/.test(out.text),
    out.hasAiErrorNotice ? 'AI error notice present' : 'no fallback notice');
  check(`${sc.id}-02`, `[${sc.label}] 渲染出推荐卡片`, out.recs.length > 0, `n=${out.recs.length}`);

  /* 幻觉防线（DOM 层）：每条渲染出来的推荐都必须是 CourseMap 中真实存在的资源 */
  const unknown = out.recs.filter((r) => !byId.has(String(r.id))).map((r) => r.id);
  check(`${sc.id}-03`, `[${sc.label}] 无幻觉资源卡（ID 均存在于 CourseMap）`, unknown.length === 0,
    unknown.length ? `unknown=${unknown.join(',')}` : `checked=${out.recs.length}`);

  /* Module M/O：Fact Hydration 落到 DOM。
     费用/时长必须等于 CourseMap 事实；未核验字段必须显示「CourseMap 当前未核验该字段」，
     绝不允许出现模型编造的数值。 */
  const mismatches = [];
  for (const rec of out.recs) {
    const row = byId.get(String(rec.id));
    if (!row) continue;

    const feeText = rec.rows['费用'] || '';
    const expectFee = row.fee === null || row.fee === undefined
      ? UNVERIFIED_TEXT
      : (row.fee === 0 ? '免费' : `¥${row.fee}`);
    if (feeText.replace(/,/g, '') !== expectFee.replace(/,/g, '')) {
      mismatches.push(`${rec.id}.费用 dom="${feeText}" repo="${expectFee}"`);
    }

    const durText = rec.rows['总时长'] || '';
    const expectDur = row.duration_hours === null || row.duration_hours === undefined
      ? UNVERIFIED_TEXT
      : `${row.duration_hours} 小时`;
    if (durText !== expectDur) mismatches.push(`${rec.id}.总时长 dom="${durText}" repo="${expectDur}"`);

    /* Module O：未核验字段不得被编造成数值 */
    if (row.duration_hours === null && /\d/.test(durText) && durText !== UNVERIFIED_TEXT) {
      mismatches.push(`${rec.id}.总时长 疑似编造数值 "${durText}"`);
    }
  }
  check(`${sc.id}-05`, `[${sc.label}] DOM 层事实绑定：费用/时长等于 CourseMap 数据（未核验字段如实标注）`,
    mismatches.length === 0, mismatches.slice(0, 3).join(' | ') || `checked=${out.recs.length}`);

  /* Module E/P：数据类别必须如实标注（真实资源 REAL / 演示资源 DEMO） */
  const classMismatch = out.recs.filter((r) => {
    const row = byId.get(String(r.id));
    return row && (row.data_class || '') !== (r.dataClass || '');
  }).map((r) => r.id);
  check(`${sc.id}-07`, `[${sc.label}] 数据类别标注与数据集一致（REAL/DEMO）`, classMismatch.length === 0,
    classMismatch.length ? `mismatch=${classMismatch.join(',')}` : `checked=${out.recs.length}`);

  /* Module F/N：每条真实资源推荐必须能点回官方页面，且链接等于 Repository 的 url */
  const linkProblems = [];
  for (const rec of out.recs) {
    const row = byId.get(String(rec.id));
    if (!row) continue;
    if (row.data_class !== 'real') continue;
    if (!rec.officialHref) { linkProblems.push(`${rec.id}.缺少官方链接`); continue; }
    if (rec.officialHref !== row.url) linkProblems.push(`${rec.id}.官方链接 dom=${rec.officialHref} repo=${row.url}`);
    if (!/^https?:\/\//.test(rec.officialHref)) linkProblems.push(`${rec.id}.官方链接非 http(s)`);
  }
  check(`${sc.id}-08`, `[${sc.label}] 真实资源带「查看官方资源」且链接指向官方页面`,
    linkProblems.length === 0, linkProblems.slice(0, 3).join(' | ')
      || `realRecs=${out.recs.filter((r) => byId.get(String(r.id))?.data_class === 'real').length}`);

  /* Module G/U：许可必须显示，且等于 Source 的许可（免费 ≠ 公有领域 ≠ 允许商用） */
  const licenseProblems = [];
  for (const rec of out.recs) {
    const row = byId.get(String(rec.id));
    if (!row || row.data_class !== 'real') continue;
    const src = licenseOf(row);
    const licText = rec.rows['许可'] || '';
    if (!src) { licenseProblems.push(`${rec.id}.数据层缺许可`); continue; }
    if (!licText.includes(src.license)) {
      licenseProblems.push(`${rec.id}.许可 dom="${licText}" repo="${src.license}"`);
    }
    if (/public domain|公有领域/i.test(licText) && src.public_domain !== true) {
      licenseProblems.push(`${rec.id}.把非公有领域误显示为公有领域`);
    }
    if (/允许商用|commercial/i.test(licText) && src.commercial_use !== true) {
      licenseProblems.push(`${rec.id}.把禁止商用误显示为允许商用`);
    }
  }
  check(`${sc.id}-09`, `[${sc.label}] 许可显示等于来源事实（免费≠公有领域≠允许商用）`,
    licenseProblems.length === 0, licenseProblems.slice(0, 3).join(' | ')
      || `realRecs=${out.recs.filter((r) => byId.get(String(r.id))?.data_class === 'real').length}`);

  /* Module N：来源必须绑定（来源行非空） */
  const missingSource = out.recs.filter((r) => !(r.rows['来源'] || '').trim()).map((r) => r.id);
  check(`${sc.id}-10`, `[${sc.label}] 每条推荐都显示来源（Source binding）`,
    missingSource.length === 0, missingSource.length ? `missing=${missingSource.join(',')}` : `checked=${out.recs.length}`);

  check(`${sc.id}-06`, `[${sc.label}] 推荐卡数据类别徽标存在（REAL 或 DEMO 明确标注）`,
    out.recs.every((r) => r.hasDemoBadge) || /DEMO|REAL/.test(out.text), 'data-class badge declared');
}

/* ---------------------------------------------------------------------------
   V — Data-1 专项聚合断言（跨场景）
   --------------------------------------------------------------------------- */
{
  const realRecs = allRecommendations.filter((r) => r.dataClass === 'real' && r.officialHref);
  const demoRecs = allRecommendations.filter((r) => r.dataClass === 'demo');
  check('V-01', '真实 OER 资源确实出现在 AI 推荐中（Verified Real 推荐 > 0）',
    realRecs.length > 0,
    `real=${realRecs.length} demo=${demoRecs.length} total=${allRecommendations.length}`);
  check('V-01b', 'AI 推荐未出现无法溯源的记录（每条都有 resource_id 且存在于 CourseMap）',
    allRecommendations.every((r) => byId.has(String(r.id))));
  check('V-02', 'AI 请求确实经过了 CourseMap Retrieval（grounding 证据约束块已渲染）',
    groundingSeen || realRecsAttrSeen,
    `groundingSeen=${groundingSeen} realRecsAttrSeen=${realRecsAttrSeen}`);
  /* 许可语义的端到端断言：真实来源的许可必须全部是非商业/非公有领域 */
  const badLicenses = sources
    .filter((s) => s.data_class === 'real')
    .filter((s) => s.public_domain === true || s.commercial_use === true);
  check('V-03', '公网数据集中真实来源的许可语义正确（无免费=公有领域/可商用的误标）',
    badLicenses.length === 0, badLicenses.map((s) => s.source_id).join(',') || 'ok');
}

/* ---------------------------------------------------------------------------
   F — 优雅降级保留（阻断后端 → 必须仍可用规则引擎且不报错）
   --------------------------------------------------------------------------- */
/* 卫生快照：必须在主动阻断后端之前取。
   阻断请求本身会被浏览器记成网络错误/控制台错误，那属于测试注入，
   不应污染「正常运行期控制台错误 = 0」的结论。 */
const hygiene = {
  consoleErrors: [...bucket.consoleErrors],
  exceptions: [...bucket.exceptions],
  failedRequests: bucket.failedRequests.filter((f) => !/api\/ai\//.test(f)),
};

{
  await cdp.send('Network.setBlockedURLs', { urls: ['*/api/ai/*'] });
  const submitState = await submitScenario('我是零基础大学生，想学 Python。');
  const out = await readResult();

  check('F-00', '后端不可用时页面仍产出建议（不出现空白/崩溃）', submitState.hasCard || !!out, JSON.stringify(submitState).slice(0, 160));
  if (out) {
    check('F-01', '切换为规则引擎（engine: rule_based_prototype）或给出明确降级提示',
      /rule_based_prototype/i.test(out.title) || /rule_based_prototype/i.test(out.text) || /暂时不可用/.test(out.text),
      `title="${out.title}"`);
    const unknown = out.recs.filter((r) => !byId.has(String(r.id))).map((r) => r.id);
    check('F-02', '降级结果同样接地（无幻觉资源）', unknown.length === 0, `n=${out.recs.length}`);
  } else {
    check('F-01', '切换为规则引擎或给出明确降级提示', false, 'no result card');
  }
  await cdp.send('Network.setBlockedURLs', { urls: [] });
}

/* ---------------------------------------------------------------------------
   运行时卫生（使用阻断前的快照）
   --------------------------------------------------------------------------- */
check('E-90', '正常运行期浏览器控制台错误 = 0', hygiene.consoleErrors.length === 0,
  hygiene.consoleErrors.slice(0, 4).join(' | '));
check('E-91', '未捕获异常 = 0', hygiene.exceptions.length === 0, hygiene.exceptions.slice(0, 3).join(' | '));
check('E-92', '关键资源加载失败 = 0', hygiene.failedRequests.length === 0,
  hygiene.failedRequests.slice(0, 4).join(' | '));

/* ---------------------------------------------------------------------------
   截图与证据
   --------------------------------------------------------------------------- */
mkdirSync(EVIDENCE_DIR, { recursive: true });
let shotPath = null;
try {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  shotPath = join(EVIDENCE_DIR, '31_public_e2e_advisor.png');
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
} catch { warn('E-93', '截图失败（不影响断言结论）'); }

chrome.kill();
cdp.close();

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const warned = results.filter((r) => r.status === 'WARN').length;
const verdict = failed === 0 ? 'PASS' : 'FAIL';

const evidence = {
  kind: 'coursemap-data1-public-frontend-e2e',
  startedAt, finishedAt: new Date().toISOString(),
  frontendBase: FRONTEND, expectedBackendInConfig: EXPECT_BACKEND,
  hygieneBeforeBlock: hygiene, runtimeFull: bucket, screenshot: shotPath,
  summary: { total: results.length, pass: passed, fail: failed, warn: warned, verdict },
  results,
};
writeFileSync(join(EVIDENCE_DIR, '31_public_e2e.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

const lines = [
  '='.repeat(80),
  'CourseMap Data-1 — Public Frontend E2E (real browser, real network)',
  '='.repeat(80),
  `Frontend        : ${FRONTEND}`,
  `Config backend  : ${EXPECT_BACKEND}`,
  `Started/Finish  : ${startedAt} → ${evidence.finishedAt}`,
  `Console errors  : ${bucket.consoleErrors.length}`,
  `Exceptions      : ${bucket.exceptions.length}`,
  `Failed requests : ${bucket.failedRequests.length}`,
  '-'.repeat(80),
  ...results.map((r) => `[${r.status}] ${r.id.padEnd(6)} ${r.description}${r.detail ? `\n           ↳ ${r.detail}` : ''}`),
  '-'.repeat(80),
  `Total ${results.length}  PASS ${passed}  FAIL ${failed}  WARN ${warned}`,
  `VERDICT: ${verdict}`,
  '='.repeat(80),
];
writeFileSync(join(EVIDENCE_DIR, '31_public_e2e.txt'), `${lines.join('\n')}\n`, 'utf8');

console.log('------------------------------------------------');
console.log(`Total ${results.length}  PASS ${passed}  FAIL ${failed}  WARN ${warned}`);
console.log(`VERDICT: ${verdict}`);
console.log('================================================');
process.exit(failed === 0 ? 0 : 1);
