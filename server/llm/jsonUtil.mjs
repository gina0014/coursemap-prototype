/* ============================================================================
   CourseMap AI Backend — llm/jsonUtil.mjs
   ----------------------------------------------------------------------------
   从「模型返回的文本」里稳健地取出 JSON 对象。

   为什么需要它（生产缺陷记录，2026-10-06）：
     生产验证出现 7 条 502 INVALID_MODEL_OUTPUT。原实现只做了两件事：
       「正则去掉 markdown 围栏」→「JSON.parse」。
     这在模型**完全听话**时可行，但真实模型会：
       · 在 JSON 前后加一句解释（"这是推荐结果：{...}"）
       · 输出 markdown 围栏且围栏未闭合（被 max_tokens 截断）
       · 在最后一个元素后留尾逗号
       · 在字符串值里包含右花括号或「逗号+右花括号」（天真的正则/前后缀剥离会切错位置）
     结果是「模型其实答对了，平台却报格式错误」。

   设计约束：
     - 纯函数、零依赖、零网络 → 可在 CI 里被穷举测试（tests/ai/model-output.test.mjs）。
     - **只做提取与最小修复，不做语义猜测**：它不会补字段、不会改数值、
       不会把 null 变 0。缺字段由上层 schema 校验负责拒绝。
     - 修不回来就返回 null。调用方据此重试或报错，
       **绝不**返回一个「看起来像 JSON」的编造对象。
   ========================================================================== */

/** @returns {any|null} 解析成功返回对象/数组，失败返回 null */
function tryParse(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    const v = JSON.parse(text);
    return (v && typeof v === 'object') ? v : null;
  } catch {
    return null;
  }
}

/** 去掉 markdown 代码围栏（包含「未闭合的尾栏」——截断场景很常见）。 */
function stripFences(text) {
  let t = text.trim();
  // 完整围栏（可能有语言标注）
  const full = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = t.match(full);
  if (m) return m[1].trim();
  // 只有开头围栏（被截断）
  t = t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '');
  // 只有结尾围栏
  t = t.replace(/\n?```\s*$/, '');
  return t.trim();
}

/**
 * 删除「对象/数组最后一个元素后的尾逗号」，且**只在字符串之外**生效。
 * 纯正则实现会把 {"a":"x,}"} 里的 ,} 也改掉 —— 那正是我们要避免的切错。
 */
function removeTrailingCommas(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === ',') {
      // 向后看：跳过空白后若是 } 或 ]，说明这是尾逗号 → 丢弃
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 扫描出所有「深度归零」的 {...} 片段（正确处理字符串与转义），按出现顺序返回。
 * 这样即便模型在 JSON 前后写了中文解释，也能定位到真正的对象。
 */
function balancedObjects(text) {
  const found = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          found.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return found;
}

/**
 * 主入口：从模型文本中提取 JSON 对象。
 * 顺序：整体 → 去围栏 → 平衡对象（含尾逗号修复）→ 首尾括号宽切（含修复）。
 * @param {string} raw
 * @returns {object|Array|null}
 */
export function extractJsonObject(raw) {
  if (typeof raw !== 'string') return null;
  const text0 = raw.replace(/^\uFEFF/, '').trim();
  if (!text0) return null;

  const direct = tryParse(text0);
  if (direct) return direct;

  const text = stripFences(text0);
  if (text !== text0) {
    const p = tryParse(text);
    if (p) return p;
  }

  for (const cand of balancedObjects(text)) {
    const p = tryParse(cand) || tryParse(removeTrailingCommas(cand));
    if (p) return p;
  }

  // 最后的兜底：模型被截断时，字符串可能未闭合 → 平衡扫描找不到对象。
  // 退化为「第一个 { 到最后一个 }」再做一次尾逗号修复。
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const wide = text.slice(first, last + 1);
    const p = tryParse(removeTrailingCommas(wide));
    if (p) return p;
  }
  return null;
}

/**
 * JSON 修复指令：当第一次输出无法解析时，作为**追加在最后一条 user 消息之后**
 * 的提示重新请求（避免出现两条连续 user 消息，某些上游会因此报 400）。
 */
export const JSON_REPAIR_HINT = [
  '',
  '[系统校验] 你上一次的输出不是合法 JSON。',
  '请重新输出：只输出一个 JSON 对象本身，不要任何解释性文字，',
  '不要 markdown 代码围栏，不要尾逗号，不要省略字段。',
].join('\n');

/**
 * 把修复指令追加到最后一条 user 消息末尾（不新增消息角色）。
 * @param {Array<{role:string,content:string}>} messages
 */
export function withJsonRepairHint(messages) {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i].role === 'user' && typeof out[i].content === 'string') {
      out[i].content = `${out[i].content}\n${JSON_REPAIR_HINT}`;
      return out;
    }
  }
  out.push({ role: 'user', content: JSON_REPAIR_HINT });
  return out;
}
