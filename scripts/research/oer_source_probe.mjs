#!/usr/bin/env node
/* ============================================================================
   CourseMap — scripts/research/oer_source_probe.mjs
   ----------------------------------------------------------------------------
   OER 官方来源探测器（Real OER Expansion · Module 12 来源治理）

   作用：用真实浏览器（Chrome DevTools Protocol）逐条打开候选官方页面，
         把「页面上到底写了什么」落成机器可读证据，供人工判定
         Candidate → Accepted / Rejected。

   它**不写入任何 CourseMap 数据**。它只回答四个问题：
     1. 这个页面是否可达？（HTTP + 渲染是否完成）
     2. 页面上有没有许可 / 版权声明？原文是什么？指向哪个 CC 版本？
     3. 页面上有没有出现「免费 / free」的表述？
     4. 页面上有没有先修要求（prerequisites）的表述？原文是什么？

   为什么必须用浏览器而不是 curl：
     Google Developers 与 CS50 的页脚/正文含 JS 渲染内容，
     静态 HTML 抓取会漏掉许可声明，导致误判为「无许可」。

   用法：
     node scripts/research/oer_source_probe.mjs                  # 全部候选
     node scripts/research/oer_source_probe.mjs --only=harvard   # 按分组过滤
   产出：
     docs/data-integration/evidence/oer_source_probe.json
   ========================================================================== */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromePage, sleep } from '../regression/cdp-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'data-integration', 'evidence');

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

/* ---------------------------------------------------------------------------
   候选清单（Module 12：Candidate）
   -------------------------------------------------------------------------- */
const CANDIDATES = [
  /* ---------- Harvard CS50 ---------- */
  { group: 'harvard', id: 'cs50x', url: 'https://cs50.harvard.edu/x/' },
  { group: 'harvard', id: 'cs50p', url: 'https://cs50.harvard.edu/python/' },
  { group: 'harvard', id: 'cs50ai', url: 'https://cs50.harvard.edu/ai/' },
  { group: 'harvard', id: 'cs50r', url: 'https://cs50.harvard.edu/r/' },
  { group: 'harvard', id: 'cs50sql', url: 'https://cs50.harvard.edu/sql/' },
  { group: 'harvard', id: 'cs50web', url: 'https://cs50.harvard.edu/web/' },
  { group: 'harvard', id: 'cs50-license', url: 'https://cs50.harvard.edu/x/license/' },

  /* ---------- MIT OpenCourseWare ---------- */
  {
    group: 'mit',
    id: 'ocw-6.100L',
    url: 'https://ocw.mit.edu/courses/6-100l-introduction-to-cs-and-programming-using-python-fall-2022/',
  },
  { group: 'mit', id: 'ocw-6.006', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/' },
  { group: 'mit', id: 'ocw-18.S191', url: 'https://ocw.mit.edu/courses/18-s191-introduction-to-computational-thinking-fall-2020/' },
  { group: 'mit', id: 'ocw-R-GIS', url: 'https://ocw.mit.edu/courses/introduction-to-r-and-gis-fall-2023/' },
  { group: 'mit', id: 'ocw-about', url: 'https://ocw.mit.edu/about/' },
  { group: 'mit', id: 'ocw-terms', url: 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/' },

  /* ---------- Google for Developers ---------- */
  { group: 'google', id: 'mlcc', url: 'https://developers.google.cn/machine-learning/crash-course?hl=en' },
  { group: 'google', id: 'mlcc-prereqs', url: 'https://developers.google.cn/machine-learning/crash-course/prereqs-and-prework?hl=en' },
  { group: 'google', id: 'intro-to-ml', url: 'https://developers.google.cn/machine-learning/intro-to-ml?hl=en' },
  { group: 'google', id: 'problem-framing', url: 'https://developers.google.cn/machine-learning/problem-framing?hl=en' },
  { group: 'google', id: 'managing-ml-projects', url: 'https://developers.google.cn/machine-learning/managing-ml-projects?hl=en' },
  { group: 'google', id: 'rules-of-ml', url: 'https://developers.google.cn/machine-learning/guides/rules-of-ml?hl=en' },
  { group: 'google', id: 'decision-forests', url: 'https://developers.google.cn/machine-learning/decision-forests?hl=en' },
  { group: 'google', id: 'site-policies', url: 'https://developers.google.cn/terms/site-policies?hl=en' },

  /* ---------- Stanford（用于 Rejected 判定的取证） ---------- */
  { group: 'stanford', id: 'cs229', url: 'https://cs229.stanford.edu/' },
  { group: 'stanford', id: 'cs231n', url: 'https://cs231n.stanford.edu/' },
];

/* ---------------------------------------------------------------------------
   页面内取证脚本：全部在浏览器里跑，返回纯数据
   -------------------------------------------------------------------------- */
const EXTRACT = `(() => {
  const bodyText = (document.body && document.body.innerText) || '';
  const html = document.documentElement.outerHTML || '';

  /* 许可 / 版权声明候选段落 */
  const licenseHits = [];
  const re = /(except as otherwise noted|creative commons|all rights reserved|\\u00a9|copyright|terms of use|licensed under)/i;
  bodyText.split(/\\n+/).forEach((line) => {
    const t = line.trim();
    if (t && re.test(t) && t.length < 400) licenseHits.push(t);
  });

  /* CC 版本 */
  const ccUrls = Array.from(new Set(
    (html.match(/creativecommons\\.org\\/licenses\\/[a-z0-9.\\-]+/gi) || [])
      .map((u) => u.toLowerCase())
  ));

  /* 免费表述 */
  const freeHits = [];
  bodyText.split(/\\n+/).forEach((line) => {
    const t = line.trim();
    if (t && /\\b(free of charge|for free|free to|no cost|free via|free and open|always free|\\u514d\\u8d39)\\b/i.test(t) && t.length < 300) {
      freeHits.push(t);
    }
  });

  /* 先修 / 前置要求 */
  const prereqHits = [];
  const pre = /(prerequisite|prior experience|prior knowledge|prereq|no prior)/i;
  bodyText.split(/\\n+/).forEach((line, i, arr) => {
    const t = line.trim();
    if (t && pre.test(t) && t.length < 300) {
      const next = (arr[i + 1] || '').trim();
      prereqHits.push(next && next.length < 300 ? t + ' || ' + next : t);
    }
  });

  /* 证书 / 学分表述 */
  const certHits = [];
  bodyText.split(/\\n+/).forEach((line) => {
    const t = line.trim();
    if (t && /(certificat|credit|degree|accredit)/i.test(t) && t.length < 300) certHits.push(t);
  });

  /* 受限访问信号（Rejected 判定用） */
  const restrictHits = [];
  bodyText.split(/\\n+/).forEach((line) => {
    const t = line.trim();
    if (t && /(only shared with|logged into your|Stanford email|enrolled students|affiliates only|require.*login)/i.test(t) && t.length < 300) {
      restrictHits.push(t);
    }
  });

  return JSON.stringify({
    title: document.title,
    readyState: document.readyState,
    bodyLen: bodyText.length,
    htmlLen: html.length,
    ccUrls,
    licenseHits: licenseHits.slice(0, 12),
    freeHits: freeHits.slice(0, 8),
    prereqHits: prereqHits.slice(0, 8),
    certHits: certHits.slice(0, 10),
    restrictHits: restrictHits.slice(0, 8),
  });
})()`;

/* ---------------------------------------------------------------------------
   探测
   -------------------------------------------------------------------------- */
async function probe(cdp, url) {
  await cdp.send('Page.navigate', { url: decodeURI(url) });
  /* 等待渲染稳定：readyState=complete 且正文出现 */
  const deadline = Date.now() + 18000;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(300);
    let raw;
    try {
      raw = await cdp.evalJson(EXTRACT);
    } catch {
      continue;
    }
    if (raw && !raw.__error) {
      last = JSON.parse(raw);
      if (last.readyState === 'complete' && last.bodyLen > 400) return last;
    }
  }
  return last;
}

/** 单页最多尝试 3 次：首次渲染偶发超时（Google 站点较慢）不算「不可达」。 */
async function probeWithRetry(cdp, url, attempts = 3) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const r = await probe(cdp, url);
      if (r) last = r;
      if (r && r.readyState === 'complete' && r.bodyLen > 400) return { data: r, attempts: i + 1 };
    } catch { /* 重试 */ }
    await sleep(800);
  }
  return { data: last, attempts };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const list = ONLY ? CANDIDATES.filter((c) => c.group === ONLY) : CANDIDATES;
  if (!list.length) throw new Error(`没有匹配的候选分组: ${ONLY}`);

  const port = 9333 + (process.pid % 500);
  const { cdp, chrome } = await launchChromePage({ port, profileName: 'oer-probe' });

  const rows = [];
  try {
    for (const c of list) {
      process.stdout.write(`probe ${c.group}/${c.id} … `);
      const t0 = Date.now();
      let result = { data: null, attempts: 0 };
      let error = null;
      try {
        result = await probeWithRetry(cdp, c.url);
      } catch (e) {
        error = String(e && e.message ? e.message : e);
      }
      const data = result.data;
      const row = {
        group: c.group,
        id: c.id,
        url: c.url,
        elapsedMs: Date.now() - t0,
        attempts: result.attempts,
        reachable: !!data && data.bodyLen > 400,
        error,
        ...(data || {}),
      };
      rows.push(row);
      const lic = data && data.ccUrls && data.ccUrls.length ? data.ccUrls.join(',') : 'none';
      process.stdout.write(`reachable=${row.reachable} cc=${lic}\n`);
    }
  } finally {
    try { chrome.kill(); } catch { /* ignore */ }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    tool: 'scripts/research/oer_source_probe.mjs',
    method: 'real Chrome via CDP (rendered DOM + innerText)',
    candidateCount: rows.length,
    rows,
  };
  writeFileSync(join(OUT_DIR, 'oer_source_probe.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nwrote docs/data-integration/evidence/oer_source_probe.json (${rows.length} rows)\n`);
}

main().catch((e) => {
  process.stderr.write(`probe failed: ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
