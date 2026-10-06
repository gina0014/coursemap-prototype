/* ============================================================================
   CourseMap AI Backend — config.mjs
   ----------------------------------------------------------------------------
   唯一的环境变量读取点。业务代码不得直接读 process.env。

   安全硬约束：
     - DEEPSEEK_API_KEY 只存在于服务端环境变量 / 平台 Secret。
     - 永远不出现在前端 bundle、Git 历史、日志、错误消息中。
     - .env.example 只包含空值键名。
   ========================================================================== */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SERVER_ROOT, '..');

function envStr(name, fallback = '') {
  const v = process.env[name];
  return (v === undefined || v === '') ? fallback : String(v).trim();
}

function envInt(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

export const CONFIG = {
  projectRoot: PROJECT_ROOT,

  // ---- DeepSeek（server-side only）----
  // 模型名来源：DeepSeek 官方 API Docs · Models（2026-10-06 核验，
  //   https://api-docs.deepseek.com/zh-cn → base_url 与 model 表）。
  // 官方当前模型表：`deepseek-v4-flash`（DeepSeek-V4-Flash-0731）、
  //   `deepseek-v4-pro`（DeepSeek-V4-Pro-0813）、`deepseek-v4-flash-vision-exp`（实验）。
  // ⚠️ 旧名 `deepseek-chat` / `deepseek-reasoner` 已于 **2026-07-24 15:59 UTC 永久停用**，
  //    调用返回 HTTP 错误（无宽限期、无软重定向）。它们曾分别指向
  //    deepseek-v4-flash 的非思考模式与思考模式。
  //    「思考 / 非思考」在 V4 上是**请求级参数**，不是两个模型 —— 因此正确迁移目标是
  //    `deepseek-v4-flash`，而不是 `deepseek-v4-pro`（后者单价约为 Flash 的 3.1 倍）。
  //    把退役名写成代码默认值会导致「配置看起来正常、实际打到已下线模型」。
  // 详见 docs/data-integration/13_DeepSeek_Model_Audit.md。
  deepseek: {
    apiKey: envStr('DEEPSEEK_API_KEY'),
    baseUrl: envStr('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    model: envStr('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
    timeoutMs: envInt('DEEPSEEK_TIMEOUT_MS', 45000),
    maxOutputTokens: envInt('DEEPSEEK_MAX_OUTPUT_TOKENS', 2400),
    /* 思考模式（官方 V4 默认 **开启**，effort 支持 high/max）。CourseMap 的两段式管线是
       「结构化抽取 + 工具调用」，需要低延迟与可复现；且官方规定思考模式下
       temperature 被忽略、并强制回传 reasoning_content（否则 400）。
       故默认显式**关闭**，并在请求体里写明，而不是依赖服务端默认值。 */
    thinking: envStr('DEEPSEEK_THINKING', 'disabled') === 'enabled',
    reasoningEffort: envStr('DEEPSEEK_REASONING_EFFORT', 'low'),
  },

  // ---- CORS / Origin ----
  // 生产环境只允许 CourseMap 公网 origin 与本地开发 origin。
  // 禁止在无充分理由时使用 *。
  allowedOrigins: envStr(
    'ALLOWED_ORIGIN',
    'https://gina0014.github.io,http://127.0.0.1:8799,http://localhost:8799,http://127.0.0.1:8788,http://localhost:8788',
  ).split(',').map((s) => s.trim()).filter(Boolean),

  // ---- Rate Limit（server-side，in-memory）----
  rateLimit: {
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
    maxRequests: envInt('RATE_LIMIT_MAX_REQUESTS', 10),
    // 单个会话（conversation_id）允许的最多消息数（防止上下文成本失控）
    maxConversationTurns: envInt('MAX_CONVERSATION_TURNS', 20),
  },

  // ---- Request limits ----
  limits: {
    maxMessageChars: envInt('MAX_MESSAGE_CHARS', 600),
    maxToolRounds: envInt('MAX_TOOL_ROUNDS', 4),
    maxRetrievalResults: envInt('MAX_RETRIEVAL_RESULTS', 12),
    maxCandidatesInPrompt: 12,
    orchestratorTimeoutMs: envInt('ORCHESTRATOR_TIMEOUT_MS', 60_000),
  },

  // ---- Conversation context ----
  context: {
    // 会话上下文 TTL（毫秒）。session-level，不做长期用户画像。
    sessionTtlMs: envInt('SESSION_TTL_MS', 30 * 60_000),
    maxHistoryTurns: envInt('CONTEXT_MAX_HISTORY_TURNS', 6),
  },
};

export function hasDeepSeekKey() {
  return CONFIG.deepseek.apiKey.length > 0;
}

/** 解析 Origin 是否在 allowlist。返回允许的 origin 或 null。 */
export function resolveAllowedOrigin(origin) {
  if (!origin) return null;
  if (CONFIG.allowedOrigins.includes(origin)) return origin;
  return null;
}
