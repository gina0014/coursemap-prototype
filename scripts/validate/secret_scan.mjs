/* ============================================================================
   CourseMap — scripts/validate/secret_scan.mjs
   ----------------------------------------------------------------------------
   Secret 泄露扫描（规格 §9/§61）。范围：工作区文件（逐行）+ git 历史（added 行）。
   退出码 1 = 发现疑似泄露（部署必须 STOP）。
   预期命中（非泄露）：.env.example 的空键名 / 文档中的占位符
   （如 DEEPSEEK_API_KEY=<你的 Key>）/ 本脚本自身的模式定义。
   ========================================================================== */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PATTERNS = [
  { name: 'DEEPSEEK_API_KEY with value', re: /^DEEPSEEK_API_KEY=(?!\s*$).+/ },
  { name: 'sk- style key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'GitHub token', re: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'Bearer token literal', re: /Bearer\s+[A-Za-z0-9\-_.]{25,}/ },
  { name: 'private key block', re: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
  { name: 'password assignment', re: /\b(?:password|passwd|secret)\s*[:=]\s*['"][^'"]{6,}['"]/i },
];

const ALLOW_LINE = [
  /^DEEPSEEK_API_KEY=\s*$/,
  /^#/,                       // 注释
  /secret_scan\.mjs$/,        // 扫描器自身
  /<你的 Key>/,               // 部署文档占位符
  /evidence[\\/]10_secret_scan\.txt$/,
];

function allowed(line, file) {
  return ALLOW_LINE.some((a) => a.test(line.trim()) || a.test(file));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.cdp-profile', '.tmp-chrome-profile', '_site', 'dist', '.cache'].includes(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let findings = 0;
let filesChecked = 0;

for (const file of walk(ROOT)) {
  const base = file.split(/[\\/]/).pop();
  if (!/\.(js|mjs|cjs|json|html|css|md|txt|py|example|yml|yaml)$|^[^.]*$/.test(base)) continue;
  if (base === '.env') continue; // 本地 .env 不入库、不打印
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  filesChecked += 1;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    for (const { name, re } of PATTERNS) {
      if (!re.test(line)) continue;
      if (allowed(line, file)) continue;
      console.log(`[LEAK?] ${name} → ${file.slice(ROOT.length + 1)}:${i + 1} :: ${line.trim().slice(0, 50)}`);
      findings += 1;
    }
  }
}

// git 历史：只检查 added 行（+开头），不打印匹配内容
let histFindings = 0;
try {
  const hist = execSync('git log -p --all --unified=0', { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  for (const line of hist.split(/\r?\n/)) {
    if (!line.startsWith('+')) continue;
    for (const { name, re } of PATTERNS) {
      const body = line.slice(1);
      if (!re.test(body)) continue;
      if (allowed(body, '')) continue;
      histFindings += 1;
      findings += 1;
      console.log(`[LEAK?] git-history ${name}（1 行，内容不打印）`);
    }
  }
} catch (e) {
  console.log('[warn] git history scan skipped:', e.message.slice(0, 80));
}

console.log('----------------------------------------');
console.log(`files scanned: ${filesChecked}`);
console.log(`git-history added-line findings: ${histFindings}`);
console.log(`SECRET LEAK = ${findings}`);
process.exit(findings === 0 ? 0 : 1);
