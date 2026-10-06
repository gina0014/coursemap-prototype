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

/* ---------------------------------------------------------------------------
   已退役模型名 → 当前受支持模型的映射（Deprecation Map）

   为什么代码里必须「写死」这些退役名：不是为了用它们，而是为了**识别**它们。
   生产缺陷记录（2026-10-06）：代码默认值已修正为 deepseek-v4-flash，但 Vercel
   平台上仍留着 AI-1 阶段设置的 DEEPSEEK_MODEL=deepseek-chat。环境变量优先级
   高于默认值 → 生产 health 对外公布 model=deepseek-chat（已退役名），
   而「靠上游静默别名兜底」是不可依赖的隐式行为。

   处理策略（显式、可观测、不静默）：
     · 命中退役名 → 用映射后的当前模型发起调用（避免打到已下线模型）；
     · 同时把「配置值 ≠ 生效值」暴露到 /api/health，让运维能看见并修正平台变量；
     · 绝不静默改写成看似正常的配置 —— 那样只会把问题藏起来。

   ⚠️ 这张表只做「识别 + 迁移映射」，任何代码路径都不得把退役名当默认值使用。
   ------------------------------------------------------------------------- */
export const RETIRED_DEEPSEEK_MODELS = Object.freeze({
  // 2026-07-24 15:59 UTC 永久停用。原语义 = V4 的非思考模式。
  'deepseek-chat': 'deepseek-v4-flash',
  // 2026-07-24 15:59 UTC 永久停用。原语义 = V4 的思考模式。
  // V4 里「思考 / 非思考」是**请求级参数**（thinking.type），不是两个模型，
  // 因此统一迁移到 flash；是否开启思考由 DEEPSEEK_THINKING 决定。
  'deepseek-reasoner': 'deepseek-v4-flash',
});

/** 默认（当前受支持）模型。官方模型表核验于 2026-10-06。 */
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

/**
 * 解析 DEEPSEEK_MODEL：区分「平台配置了什么」与「实际会调什么」。
 * @returns {{configured:string, effective:string, deprecated:boolean, retiredName:string|null}}
 */
function resolveDeepseekModel() {
  const configured = envStr('DEEPSEEK_MODEL', DEFAULT_DEEPSEEK_MODEL);
  const mapped = RETIRED_DEEPSEEK_MODELS[String(configured).toLowerCase()];
  if (mapped) {
    return { configured, effective: mapped, deprecated: true, retiredName: configured };
  }
  return { configured, effective: configured, deprecated: false, retiredName: null };
}

const DEEPSEEK_MODEL_RESOLUTION = resolveDeepseekModel();

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
    // effective：实际发往上游的模型名（已退役名会被映射到当前模型）
    model: DEEPSEEK_MODEL_RESOLUTION.effective,
    // configured：平台/环境变量里**写的是什么**（可能已退役，用于对外披露与告警）
    configuredModel: DEEPSEEK_MODEL_RESOLUTION.configured,
    modelDeprecated: DEEPSEEK_MODEL_RESOLUTION.deprecated,
    retiredModelName: DEEPSEEK_MODEL_RESOLUTION.retiredName,
    timeoutMs: envInt('DEEPSEEK_TIMEOUT_MS', 45000),
    maxOutputTokens: envInt('DEEPSEEK_MAX_OUTPUT_TOKENS', 2400),
    /* 第二次尝试（JSON 修复轮）使用的 token 预算。
       生产缺陷：Stage B 的最终 JSON（多条推荐 + 建议 + 不确定项）在候选集较大时
       会被 2400 截断 → finish_reason=length → 误报「格式异常」。 */
    maxOutputTokensRetry: envInt('DEEPSEEK_MAX_OUTPUT_TOKENS_RETRY', 4000),
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
