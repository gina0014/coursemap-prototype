/* ============================================================================
   CourseMap AI Backend — httpHandler.mjs
   ----------------------------------------------------------------------------
   平台无关的 HTTP handler（Vercel serverless 与本地 dev-server 共用）。

   路由：
     POST /api/ai/advisor   AI 学习顾问（主入口）
     GET  /api/ai/health    健康检查（不暴露内部信息）

   统一 envelope：
     成功 { success:true, data, meta }
     失败 { success:false, error:{ code, message } }

   安全：
     - CORS origin allowlist（禁止 *）
     - rate limit（server-side per-IP）
     - 错误对外只给 code + 友好消息，绝无 stack/secret/internal prompt
   ========================================================================== */

import { CONFIG, resolveAllowedOrigin, hasDeepSeekKey } from './config.mjs';
import { ApiError, toSafeError, ERROR_CODES } from './errors.mjs';
import { validateAdvisorInput, RateLimiter } from './security/security.mjs';
import { ConversationStore } from './context/ConversationStore.mjs';
import { usageLogger } from './cost/usageLog.mjs';
import { AIOrchestrator } from './orchestrator/AIOrchestrator.mjs';
import { StructuredRetriever } from './retriever/StructuredRetriever.mjs';
import { getRepository } from './repo/CourseMapRepository.mjs';
import { DeepSeekAdapter } from './llm/DeepSeekAdapter.mjs';
import { MockLLMAdapter } from './llm/MockLLMAdapter.mjs';

const rateLimiter = new RateLimiter();
const conversationStore = new ConversationStore();
const repository = getRepository();
const retriever = new StructuredRetriever(repository);

let orchestrator = null;
function getOrchestrator() {
  if (!orchestrator) {
    const adapter = hasDeepSeekKey() ? new DeepSeekAdapter() : new MockLLMAdapter();
    orchestrator = new AIOrchestrator({
      adapter, repository, retriever, conversationStore, usageLogger,
    });
  }
  return orchestrator;
}

/** 部署指纹（非敏感）：用于让生产验证确认「验的是本次提交的部署」。
 *  Vercel Git 部署注入 VERCEL_GIT_COMMIT_SHA；CLI 部署注入 VERCEL_DEPLOYMENT_ID；
 *  本地开发则为 'local'。绝不包含任何密钥。 */
function buildFingerprint() {
  const raw = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.GITHUB_SHA || '';
  return raw ? String(raw).slice(0, 12) : 'local';
}

function clientIpOf(req) {
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function corsHeaders(origin) {
  const allowed = resolveAllowedOrigin(origin);
  const headers = {
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function send(res, status, payload, headers) {
  const body = JSON.stringify(payload);
  res.writeHead(status, headers);
  res.end(body);
}

let requestSeq = 0;

/**
 * 平台无关入口。
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
export async function handleAIRequest(req, res) {
  const origin = req.headers && req.headers.origin;
  const headers = corsHeaders(origin);

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://internal');
    const route = `${url.pathname}`.replace(/\/+$/, '');

    if (route === '/api/ai/health' && req.method === 'GET') {
      // 健康检查：不暴露内部细节；llm_configured 只反映服务端是否有 key
      const repoOk = repository.isAvailable;
      send(res, 200, {
        success: true,
        data: { status: repoOk ? 'ok' : 'degraded', llm_configured: hasDeepSeekKey(), adapter: hasDeepSeekKey() ? 'deepseek' : 'mock' },
        // build：部署指纹（非敏感）。生产验证必须先确认「验证的是本次提交的部署」，
        // 否则可能在 Vercel 尚未完成 redeploy 时误验旧代码（会把修复误判为失败）。
        // Vercel 会为每次部署注入 VERCEL_GIT_COMMIT_SHA（Git 部署）或
        // VERCEL_DEPLOYMENT_ID（CLI 部署），本地开发则为 'local'。
        meta: { service: 'coursemap-ai', version: 'v0.2-AI-Beta', build: buildFingerprint() },
      }, headers);
      return;
    }

    if (route === '/api/ai/advisor' && req.method === 'POST') {
      if (!resolveAllowedOrigin(origin) && origin) {
        throw new ApiError(ERROR_CODES.ORIGIN_NOT_ALLOWED, 'Origin 不被允许。', 403);
      }
      rateLimiter.check(clientIpOf(req));

      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
          data += c;
          if (data.length > 32_768) reject(new ApiError(ERROR_CODES.BAD_REQUEST, '请求体过大。', 413));
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      let parsed;
      try { parsed = JSON.parse(body || '{}'); } catch {
        throw new ApiError(ERROR_CODES.BAD_REQUEST, '请求体不是合法 JSON。', 400);
      }
      const input = validateAdvisorInput(parsed);

      if (!repository.isAvailable) {
        throw new ApiError(ERROR_CODES.INTERNAL, '数据服务暂不可用。', 503);
      }
      if (!hasDeepSeekKey()) {
        // Key 未配置：明确 NOT_CONFIGURED，绝不伪造「已接入 LLM」
        throw new ApiError(ERROR_CODES.NOT_CONFIGURED,
          'AI 服务尚未配置模型密钥，AI 学习顾问暂不可用。你仍可使用课程搜索、对比与学习路径功能。', 503);
      }

      const requestId = `req_${Date.now()}_${(requestSeq += 1)}`;
      const clientIp = clientIpOf(req);
      const data = await getOrchestrator().advise(input, { requestId, clientIp });
      if (input.conversation_id) {
        conversationStore.save(input.conversation_id, data.constraints, clientIp);
      }

      send(res, 200, {
        success: true,
        data,
        meta: {
          request_id: requestId,
          adapter: getOrchestrator().adapter.name,
          model: getOrchestrator().adapter.model || null,
          grounding: 'coursemap-data',
          disclaimer: 'AI 学习顾问可能产生错误；具体课程价格、时长、证书等信息以 CourseMap 已核验数据及原始来源为准。AI 推荐不构成学习成果保证。',
        },
      }, headers);
      return;
    }

    throw new ApiError(ERROR_CODES.METHOD_NOT_ALLOWED, '不支持的请求方法或路径。', 404);
  } catch (err) {
    const safe = toSafeError(err);
    if (safe.detail) {
      // 内部细节仅进服务端日志
      console.error('[coursemap-ai]', safe.code, JSON.stringify(safe.detail).slice(0, 500));
    }
    usageLogger.record({ request_id: `err_${Date.now()}`, adapter: 'n/a', status: safe.code, latency_ms: 0, usage: null });
    send(res, safe.status, { success: false, error: { code: safe.code, message: safe.message } }, headers);
  }
}
