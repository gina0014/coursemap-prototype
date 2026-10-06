/* ============================================================================
   CourseMap — scripts/regression/cdp-client.mjs
   ----------------------------------------------------------------------------
   共享的 Chrome DevTools Protocol 客户端（无 puppeteer / Playwright 依赖）。

   原实现内嵌在 scripts/regression/browser_smoke.mjs 中；为让
   scripts/verify/public_e2e.mjs 复用同一套（已通过 16/16 验证的）连接与
   诊断逻辑，抽出为独立模块，避免两份 CDP 实现漂移。

   约束：
     - 仅用 Node 内置 fetch / WebSocket（Node >= 22）。
     - 不做任何全局清理（临时 Profile 留在系统 TEMP，见各调用方说明）。
   ========================================================================== */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DEFAULT_CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TEMP_BASE = join(tmpdir(), `coursemap-cdp-${process.pid}`);

export async function waitForHttp(url, timeoutMs = 15000) {
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

export class Cdp {
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
      }, 60000);
    });
  }

  /** 求值并返回 JS 值（异常安全）。 */
  async evalJson(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text || 'eval error' };
    return r.result ? r.result.value : undefined;
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/**
 * 启动一个 headless Chrome 并把页面附加到 CDP。
 * @returns {{cdp: Cdp, chrome: import('node:child_process').ChildProcess}}
 */
export async function launchChromePage({
  port, profileName = 'default', chromePath = DEFAULT_CHROME, viewport = { width: 1440, height: 1100 },
  extraArgs = [], navigateTo = null,
} = {}) {
  if (!port) throw new Error('launchChromePage 需要 port');
  const profile = join(TEMP_BASE, `profile-${profileName}`);
  mkdirSync(profile, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--mute-audio',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${viewport.width},${viewport.height}`,
    ...extraArgs,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  const list = await waitForHttp(`http://127.0.0.1:${port}/json/list`);
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    || list.find((t) => t.webSocketDebuggerUrl);
  if (!page) throw new Error('找不到可附加的 page target');

  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
  });

  if (navigateTo) await cdp.send('Page.navigate', { url: navigateTo });
  return { cdp, chrome };
}

/**
 * 把控制台 / 异常 / 失败请求收集到 bucket。
 * @param {Cdp} cdp
 * @param {{consoleErrors:string[],warnings:string[],exceptions:string[],failedRequests:string[]}} bucket
 */
export function attachDiagnostics(cdp, bucket) {
  cdp.onEvent = (msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const { type, args } = msg.params;
      const text = (args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      if (type === 'error') bucket.consoleErrors.push(text);
      else if (type === 'warning' || type === 'warn') bucket.warnings.push(text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      bucket.exceptions.push(d.exception?.description || d.text || 'unknown exception');
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry || {};
      if (e.level === 'error') bucket.consoleErrors.push(`[${e.source}] ${e.text}`);
      else if (e.level === 'warning') bucket.warnings.push(`[${e.source}] ${e.text}`);
    } else if (msg.method === 'Network.responseReceived') {
      const { status, url: u } = msg.params.response || {};
      if (status >= 400) bucket.failedRequests.push(`${status} ${u}`);
    } else if (msg.method === 'Network.loadingFailed') {
      bucket.failedRequests.push(`LOAD_FAILED ${msg.params.errorText} ${msg.params.type}`);
    }
  };
  return cdp;
}

export function newBucket() {
  return { consoleErrors: [], warnings: [], exceptions: [], failedRequests: [] };
}
