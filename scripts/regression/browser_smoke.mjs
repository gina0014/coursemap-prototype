/* ============================================================================
   CourseMap — scripts/regression/browser_smoke.mjs
   ----------------------------------------------------------------------------
   浏览器层冒烟 + 控制台取证 + 截图证据（Chrome DevTools Protocol，无需 puppeteer）。
   结构继承自 DishMap 同名探针（REUSED，见 docs/migration 迁移文档），
   目标与断言全部为教育领域重写。

   运行：
     python -m http.server 8765            # 另开一个终端（项目根目录）
     node scripts/regression/browser_smoke.mjs

   环境变量：COURSEMAP_BASE（默认 http://127.0.0.1:8765）、CHROME_PATH。
   退出码：0 = 全部通过；1 = 存在 FAIL；2 = 探针自身错误。
   ========================================================================== */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const SHOT_DIR = join(PROJECT_ROOT, 'docs', 'evidence', 'screenshots');

const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.COURSEMAP_BASE || 'http://127.0.0.1:8765';
/* 临时 Profile 放系统 TEMP，且**不做删除清理**（部分环境对批量删除有安全守卫）。
   每个目标使用独立目录，避免相互污染。 */
const TEMP_BASE = mkdtempSync(join(tmpdir(), 'coursemap-smoke-'));
const VIEWPORT = { width: 1440, height: 1100 };

/* ---------------------------------------------------------------------------
   目标清单：MoT 取证 + 12 页面证据截图
   --------------------------------------------------------------------------- */

const TARGETS = [
  {
    id: '01_Home_Goal_First', page: 'P-01', url: 'index.html',
    mustContain: ['今天想学什么', '按学习目标找资源', '找学习资源', 'DEMO'], shot: true,
  },
  {
    id: '02_Search_Keyword', page: 'P-02', url: 'pages/search.html?q=Python',
    mustContain: ['DEMO'], requireCards: true, shot: true,
  },
  {
    id: '03_Search_Goal_Filter', page: 'P-02', url: 'pages/search.html?goal=1',
    mustContain: ['DEMO'], requireCards: true, shot: true,
  },
  {
    id: '04_Compare_Same_Goal', page: 'P-03', url: 'pages/compare.html?goal=1',
    mustContain: ['最低费用', '最高费用', '费用差', '资源数'], shot: true,
    assert: [
      { name: 'count>=1', expr: `(() => { const n = Number(document.querySelector('[data-compare-count]')?.textContent); return Number.isFinite(n) && n >= 1 ? 'ok' : 'bad:' + n; })()`, eq: 'ok' },
      { name: 'min<=max', expr: `(() => { const t = (s) => document.querySelector(s)?.textContent?.trim() ?? ''; const min = t('[data-compare-min]'); const max = t('[data-compare-max]'); return min === '—' || max === '—' ? 'ok' : (Number(min.replace(/[^0-9.]/g, '')) <= Number(max.replace(/[^0-9.]/g, '')) ? 'ok' : 'bad'); })()`, eq: 'ok' },
    ],
  },
  {
    id: '05_Resource_Detail', page: 'P-04', url: 'pages/resource.html?id=1',
    mustContain: ['DEMO', '学习者如何评价', '下一步可以学什么', '是否核验', '先修'], shot: true,
  },
  {
    id: '06_Resource_NotFound', page: 'P-04', url: 'pages/resource.html?id=99999',
    mustContain: ['没有找到这个学习资源'], shot: true,
  },
  {
    id: '07_Provider_Detail', page: 'P-05', url: 'pages/provider.html?id=1',
    mustContain: ['级信息', '资源'], shot: true,
  },
  {
    id: '08_Paths_Overview', page: 'P-06', url: 'pages/paths.html',
    mustContain: ['学习路径'], requireCards: true, shot: true,
  },
  {
    id: '09_Path_Detail', page: 'P-07', url: 'pages/path.html?id=1',
    mustContain: ['学习路径'], shot: true,
  },
  {
    id: '10_Review_Local_Prototype', page: 'P-08', url: 'pages/review.html?resource_id=1',
    mustContain: ['本地原型', 'localStorage'], shot: true,
  },
  {
    id: '11_Favorites_Local', page: 'P-09', url: 'pages/favorites.html',
    mustContain: ['Local Prototype', '本地收藏'], shot: true,
  },
  {
    id: '12_Advisor_Prototype', page: 'P-10', url: 'pages/advisor.html',
    mustContain: ['Not LLM-powered'], shot: true,
  },
  {
    id: '13_Data_Methodology', page: 'P-11', url: 'pages/data-methodology.html',
    mustContain: ['数据'], shot: true,
  },
  { id: '14_About', page: 'P-12', url: 'pages/about.html', mustContain: ['CourseMap'], shot: true },
  { id: '15_404', page: 'P-13', url: '404.html', mustContain: ['404'], shot: true },
  {
    id: '16_Search_Empty_State', page: 'P-02', url: 'pages/search.html?q=zzznotexist',
    mustContain: ['没有符合条件的学习资源'], shot: true,
  },
];

/* ---------------------------------------------------------------------------
   小工具
   --------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error(`等待 ${url} 超时`);
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('WebSocket 连接失败'));
    });
    const cdp = new Cdp(ws);
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
      cdp.onEvent?.(msg);
    };
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error(`${method} 超时`));
        }
      }, 30000);
    });
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/* ---------------------------------------------------------------------------
   单个目标的执行
   --------------------------------------------------------------------------- */

async function runTarget(target, index) {
  const port = 9380 + (index % 40);
  const url = `${BASE}/${target.url}`;
  const result = {
    id: target.id,
    page: target.page,
    url,
    consoleErrors: [],
    warnings: [],
    exceptions: [],
    failedRequests: [],
    pageState: null,
    contentChars: 0,
    resourceCards: 0,
    assertions: [],
    missingText: [],
    resolved: false,
    navLinks: 0,
    brokenLinks: [],
  };

  const profile = join(TEMP_BASE, `profile-${index}`);
  mkdirSync(profile, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--mute-audio',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  try {
    const version = await waitForHttp(`http://127.0.0.1:${port}/json/version`);
    const list = await waitForHttp(`http://127.0.0.1:${port}/json/list`);
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      || list.find((t) => t.webSocketDebuggerUrl);
    if (!page) throw new Error('找不到可附加的 page target');

    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    cdp.onEvent = (msg) => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const { type, args } = msg.params;
        const text = (args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
        if (type === 'error') result.consoleErrors.push(text);
        else if (type === 'warning' || type === 'warn') result.warnings.push(text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        result.exceptions.push(d.exception?.description || d.text || 'unknown exception');
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry || {};
        if (e.level === 'error') result.consoleErrors.push(`[${e.source}] ${e.text}`);
        else if (e.level === 'warning') result.warnings.push(`[${e.source}] ${e.text}`);
      } else if (msg.method === 'Network.responseReceived') {
        const { status, url: u } = msg.params.response || {};
        if (status >= 400) result.failedRequests.push(`${status} ${u}`);
      } else if (msg.method === 'Network.loadingFailed') {
        result.failedRequests.push(`LOAD_FAILED ${msg.params.errorText} ${msg.params.type}`);
      }
    };

    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false,
    });

    /* 先 about:blank 启动、附加完成后再导航——保证模块加载错误也能被完整捕获 */
    await cdp.send('Page.navigate', { url });
    await sleep(150);

    /* 等待渲染完成：readyState complete 且骨架消失（或超时） */
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const p = document.querySelector('[data-page]') || document.body;
          const b = document.querySelector('[data-chrome="banner"]');
          return JSON.stringify({
            ready: document.readyState === 'complete',
            skeleton: !!document.querySelector('[data-coursemap-state="loading"]'),
            chars: p ? p.innerHTML.length : 0,
            bodyChars: (document.body.innerText || '').length,
            bannerReady: !b || b.innerHTML.trim().length > 0,
          });
        })()`,
        returnByValue: true,
      });
      const state = JSON.parse(probe.result.value);
      result.contentChars = state.chars;
      /* 首页正文是静态 HTML，[data-page] 会被清空——以 body 文本量兜底 */
      if (state.ready && !state.skeleton && state.bannerReady
          && (state.chars > 200 || state.bodyChars > 200)) {
        ready = true;
        break;
      }
      await sleep(300);
    }
    result.resolved = ready;

    /* DOM 断言 */
    const probeExpr = `(() => {
      const p = document.querySelector('[data-page]') || document.body;
      const text = document.body.innerText || '';
      const stateNode = document.querySelector('[data-coursemap-state]');
      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => a.getAttribute('href') && !a.getAttribute('href').startsWith('#'));
      return JSON.stringify({
        state: stateNode ? stateNode.getAttribute('data-coursemap-state') : null,
        text,
        chars: p.innerHTML.length,
        cards: document.querySelectorAll('.resource-card, [data-coursemap-card], [data-coursemap-path-card]').length,
        navLinks: document.querySelectorAll('[data-coursemap-nav] a, nav a').length,
        links: links.map((a) => a.getAttribute('href')),
      });
    })()`;
    const dom = JSON.parse((await cdp.send('Runtime.evaluate', {
      expression: probeExpr, returnByValue: true,
    })).result.value);

    result.pageState = dom.state;
    result.contentChars = Math.max(result.contentChars, dom.chars || 0);
    result.resourceCards = dom.cards;
    result.navLinks = dom.navLinks;
    result.bodyText = dom.text.slice(0, 400);

    for (const needle of target.mustContain || []) {
      if (!dom.text.includes(needle)) result.missingText.push(needle);
    }
    if (target.requireCards && dom.cards === 0) {
      result.missingText.push('(要求页面出现资源/路径卡片，实际 0 张)');
    }
    for (const a of target.assert || []) {
      const got = (await cdp.send('Runtime.evaluate', {
        expression: a.expr, returnByValue: true,
      })).result.value;
      result.assertions.push({ name: a.name, expect: a.eq, got, ok: got === a.eq });
    }

    /* 相对导航链接可达性（只查同源相对路径，不联网外部） */
    const hrefs = [...new Set(dom.links)].filter((h) => /^[./]/.test(h) || /^[\w-]+\.html/.test(h));
    for (const href of hrefs.slice(0, 12)) {
      const absolute = new URL(href, url).href;
      try {
        const res = await fetch(absolute);
        if (!res.ok) result.brokenLinks.push(`${res.status} ${href}`);
      } catch (err) {
        result.brokenLinks.push(`${String(err)} ${href}`);
      }
    }

    /* 截图证据 */
    if (target.shot) {
      const attempts = [
        { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height * 2, scale: 1 } },
        { format: 'png', captureBeyondViewport: true },
        { format: 'png' },
      ];
      let shot = null;
      let lastError = null;
      for (const params of attempts) {
        try {
          const res = await cdp.send('Page.captureScreenshot', params);
          if (res?.data) { shot = res; break; }
        } catch (err) { lastError = err; }
      }
      if (!shot) throw new Error(`截图失败：${lastError}`);
      writeFileSync(join(SHOT_DIR, `${target.id}.png`), Buffer.from(shot.data, 'base64'));
      result.shot = `docs/evidence/screenshots/${target.id}.png`;
    }

    cdp.close();
  } finally {
    chrome.kill('SIGKILL');
    await sleep(200);
  }

  return result;
}

/* ---------------------------------------------------------------------------
   主流程
   --------------------------------------------------------------------------- */

function verdict(row) {
  if (!row.resolved) return 'FAIL(未解析完成/停在骨架)';
  if (row.pageState === 'error') return 'FAIL(渲染错误态)';
  if (row.consoleErrors.length || row.exceptions.length) return 'FAIL(Console)';
  if (row.failedRequests.length) return 'FAIL(资源)';
  if (row.missingText.length) return 'FAIL(缺内容)';
  if (row.brokenLinks.length) return 'FAIL(坏链)';
  if (row.assertions.some((a) => !a.ok)) return 'FAIL(断言)';
  return 'PASS';
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const rows = [];
  for (let i = 0; i < TARGETS.length; i += 1) {
    const target = TARGETS[i];
    process.stdout.write(`[${i + 1}/${TARGETS.length}] ${target.id} ... `);
    try {
      const row = await runTarget(target, i);
      row.verdict = verdict(row);
      rows.push(row);
      console.log(row.verdict);
    } catch (err) {
      rows.push({ id: target.id, page: target.page, url: `${BASE}/${target.url}`,
        verdict: 'FAIL(探针错误)', consoleErrors: [String(err)], exceptions: [],
        failedRequests: [], warnings: [], assertions: [], missingText: [] });
      console.log(`FAIL(探针错误) ${err}`);
    }
  }

  const pageVerdicts = new Map();
  for (const row of rows) {
    const prev = pageVerdicts.get(row.page);
    if (prev !== 'FAIL') pageVerdicts.set(row.page, row.verdict.startsWith('PASS') ? 'PASS' : 'FAIL');
    else pageVerdicts.set(row.page, 'FAIL');
  }

  const consoleErrors = rows.flatMap((r) => (r.consoleErrors || []).map((e) => `${r.id}: ${e}`));
  const exceptions = rows.flatMap((r) => (r.exceptions || []).map((e) => `${r.id}: ${e}`));
  const failed = rows.flatMap((r) => (r.failedRequests || []).map((e) => `${r.id}: ${e}`));
  const warnings = rows.flatMap((r) => (r.warnings || []).map((e) => `${r.id}: ${e}`));

  console.log('\n' + '='.repeat(72));
  console.log('CourseMap Browser Smoke — console / runtime / evidence');
  console.log('='.repeat(72));
  for (const row of rows) {
    console.log(`[${row.verdict}] ${row.id} (${row.page}) state=${row.pageState} `
      + `chars=${row.contentChars} cards=${row.resourceCards}`);
    if (row.missingText?.length) console.log(`   缺内容: ${row.missingText.join(' | ')}`);
    for (const a of row.assertions || []) {
      console.log(`   ${a.ok ? 'OK  ' : 'BAD '} ${a.name}: expect=${a.expect} got=${a.got}`);
    }
    for (const e of (row.consoleErrors || [])) console.log(`   CONSOLE ERROR: ${e}`);
    for (const e of (row.exceptions || [])) console.log(`   EXCEPTION: ${e}`);
    for (const e of (row.failedRequests || [])) console.log(`   REQUEST: ${e}`);
    for (const e of (row.brokenLinks || [])) console.log(`   BROKEN LINK: ${e}`);
  }

  console.log('\n---- 页面 smoke ----');
  const PAGES = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13'];
  for (const p of PAGES) console.log(`${p}: ${pageVerdicts.get(p) || 'NOT_RUN'}`);

  console.log('\n---- 汇总 ----');
  console.log(`Console Errors     : ${consoleErrors.length}`);
  console.log(`Unhandled Rejections / Exceptions : ${exceptions.length}`);
  console.log(`Failed Requests    : ${failed.length}`);
  console.log(`Warnings           : ${warnings.length}`);
  warnings.slice(0, 10).forEach((w) => console.log(`   WARN: ${w}`));

  const bad = rows.filter((r) => !r.verdict.startsWith('PASS'));
  console.log(`\nResult : ${bad.length ? 'FAIL' : 'PASS'} (${rows.length - bad.length}/${rows.length})`);
  console.log('='.repeat(72));

  writeFileSync(join(PROJECT_ROOT, 'docs', 'evidence', 'browser-smoke.json'),
    JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), rows }, null, 2));

  process.exit(bad.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`[PROBE ERROR] ${err?.stack || err}`);
  process.exit(2);
});
