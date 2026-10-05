/* ============================================================================
   CourseMap — utils.js
   通用工具：DOM、转义、数字/日期格式化、URL 查询参数、文本规范化。
   不做任何业务计算（业务计算只在 derive.js）。
   ========================================================================== */

/* ---------------- DOM ---------------- */

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, html) {
  if (!node) return;
  node.innerHTML = html;
}

/* ---------------- 转义 ---------------- */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * HTML 转义。所有进入模板字符串的数据字段都必须经过它。
 * null / undefined 返回空串（调用方负责决定显示 Unknown 还是 —）。
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/* ---------------- 数字 / 金额 ---------------- */

/** 金额：整数不带小数，非整数保留 1 位 */
export function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 评分：保留 1 位小数 */
export function rating1(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(1);
}

export function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

export function intFmt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US');
}

/* ---------------- 统一安全格式化（缺失值 ≠ 0） ----------------
   原则：真实 0 ≠ unknown。
   undefined / null / NaN 一律走 fallback（—  / 暂无数据 / Limited data 等），
   **禁止**用 `value || 0` 之类把 unknown 伪装成 0。
   所有页面必须复用这三个函数，禁止各自写 .toFixed()。
   ------------------------------------------------------------------ */

/** 未知值占位符（页面需要其它措辞时显式传 fallback） */
export const UNKNOWN_DISPLAY = '—';

/** 通用数字。digits=0 → 整数。非有限数 → fallback。 */
export function formatNumber(value, { digits = 1, fallback = UNKNOWN_DISPLAY } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (digits <= 0) return String(Math.round(value));
  return value.toFixed(digits);
}

/** 金额。复用 money()（整数不带小数，非整数保留 1 位）。 */
export function formatPrice(value, { currency = '¥', fallback = UNKNOWN_DISPLAY } = {}) {
  const amount = money(value);
  return amount === null ? fallback : `${currency}${amount}`;
}

/** 评分。复用 rating1()（保留 1 位小数）。 */
export function formatRating(value, { fallback = UNKNOWN_DISPLAY } = {}) {
  const text = rating1(value);
  return text === null ? fallback : text;
}

/* ---------------- 日期 ---------------- */

/** 'YYYY-MM-DD' → '2026-09-12'（不做本地化，避免时区歧义） */
export function dateOnly(value) {
  if (!value || typeof value !== 'string') return null;
  return value.slice(0, 10);
}

/**
 * 相对今天的自然日差。以「今天」的本地日期为基准，只比较日期部分。
 * 用于「观测于 N 天前」这类**事实性**展示，不用于推断价格有效性。
 */
export function daysSince(dateStr, today = new Date()) {
  const d = dateOnly(dateStr);
  if (!d) return null;
  const target = new Date(`${d}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((base - target) / 86400000);
}

/** 'YYYY-MM-DDTHH:MM:SS' → 'YYYY-MM-DD' */
export function dateTimeToDate(value) {
  return dateOnly(value);
}

/* ---------------- 文本规范化（检索用） ---------------- */

/** 全角 → 半角 */
function toHalfWidth(str) {
  return str.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  ).replace(/\u3000/g, ' ');
}

/** 去首尾空、折叠空白、大小写折叠、全角转半角 */
export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return toHalfWidth(String(value)).trim().replace(/\s+/g, ' ').toLowerCase();
}

/* ---------------- URL 查询参数 ---------------- */

export function parseQuery(search = (typeof location !== 'undefined' ? location.search : '')) {
  const out = {};
  const params = new URLSearchParams(search);
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

export function buildQuery(base, params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === 'all') continue;
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `${base}?${q}` : base;
}

/** 只更新 URL 中的部分参数，不产生历史记录（避免拖地图刷爆历史） */
export function updateQuery(params, { replace = true } = {}) {
  if (typeof history === 'undefined') return;
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === 'all') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

/* ---------------- 其它 ---------------- */

export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function intOrNull(value) {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

export function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function throttleRaf(fn) {
  let scheduled = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

/** 稳定排序：主比较 + resource_id 升序 tiebreak（docs/09 §9.7 要求可复现） */
export function stableSort(rows, compare, tiebreak = (row) => row.resource_id) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compare(a.row, b.row);
      if (primary !== 0) return primary;
      const ta = tiebreak(a.row);
      const tb = tiebreak(b.row);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** 缺失值排最后：把 null 映射为 +Infinity 后再比较 */
export function nullsLast(value) {
  return value === null || value === undefined ? Number.POSITIVE_INFINITY : value;
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function unique(values) {
  return Array.from(new Set(values));
}

/** file:// 协议检测（ES Module 与 fetch 在 file:// 下不可用） */
export function isFileProtocol() {
  return typeof location !== 'undefined' && location.protocol === 'file:';
}
