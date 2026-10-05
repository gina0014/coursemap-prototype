/* ============================================================================
   CourseMap — ai-client.js
   ----------------------------------------------------------------------------
   AI 后端客户端（前端唯一出口）。架构硬约束：
     - 浏览器只与 CourseMap AI Backend 通信，绝不直连 DeepSeek。
     - 任何 secret 都不会经过本模块（前端没有也不应有 key）。
     - 失败必须可降级：返回结构化错误，由 advisor 页面呈现优雅降级。
   ========================================================================== */

import { AI } from './config.js';

const CONVERSATION_KEY = 'coursemap.aiConversation.v1';

function conversationId() {
  // session-level 会话标识：不做长期画像，不假装跨设备记忆
  try {
    let id = sessionStorage.getItem(CONVERSATION_KEY);
    if (!id) {
      id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(CONVERSATION_KEY, id);
    }
    return id;
  } catch {
    return `c_${Date.now().toString(36)}`;
  }
}

export function clearConversation() {
  try { sessionStorage.removeItem(CONVERSATION_KEY); } catch { /* ignore */ }
}

/**
 * 探测 AI 后端可用性。
 * 未配置 aiBackendBase 时不发起请求（避免对静态托管产生 404 噪音），
 * 直接返回未配置状态 —— 前端进入降级模式。
 * @returns {Promise<{available: boolean, adapter: string|null, llmConfigured: boolean, configured: boolean}>}
 */
export async function probeBackend() {
  const base = AI.aiBackendBase || '';
  if (!base) {
    return { available: false, adapter: null, llmConfigured: false, configured: false };
  }
  try {
    const res = await fetch(`${base}${AI.healthEndpoint}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { available: false, adapter: null, llmConfigured: false, configured: true };
    const body = await res.json();
    return {
      available: body.success === true && body.data && body.data.status === 'ok',
      adapter: body.data ? body.data.adapter : null,
      llmConfigured: !!(body.data && body.data.llm_configured),
      configured: true,
    };
  } catch {
    return { available: false, adapter: null, llmConfigured: false, configured: true };
  }
}

/**
 * 调用 AI 学习顾问。
 * @param {string} message 用户自然语言
 * @returns {Promise<{ok:true, data, meta} | {ok:false, code, message}>}
 */
export async function askAdvisor(message) {
  const base = AI.aiBackendBase || '';
  try {
    const res = await fetch(`${base}${AI.advisorEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ message, conversation_id: conversationId(), context: {} }),
      signal: AbortSignal.timeout(AI.requestTimeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (!body) {
      return { ok: false, code: 'BAD_RESPONSE', message: 'AI 服务返回异常，请稍后重试。' };
    }
    if (body.success === true) {
      return { ok: true, data: body.data, meta: body.meta || {} };
    }
    const err = body.error || {};
    const friendly = {
      RATE_LIMITED: '请求过于频繁，请稍后再试。',
      NOT_CONFIGURED: 'AI 服务尚未配置（缺少服务端模型密钥），AI 学习顾问暂不可用。你仍可使用课程搜索、对比与学习路径功能。',
      AI_UNAVAILABLE: 'AI 学习顾问暂时不可用，你仍可使用课程搜索和比较功能。',
      AI_TIMEOUT: 'AI 响应超时，请稍后重试。',
      AI_UPSTREAM_ERROR: 'AI 服务异常，请稍后重试。',
      INVALID_MODEL_OUTPUT: 'AI 返回未通过数据校验，请重试一次。',
      NO_MATCHING_RESOURCE: null, // 使用服务端消息（已面向用户）
      MESSAGE_TOO_LONG: null,
      BAD_REQUEST: null,
    };
    return {
      ok: false,
      code: err.code || 'INTERNAL',
      message: friendly[err.code] !== undefined && friendly[err.code] !== null
        ? friendly[err.code] : (err.message || 'AI 服务出错，请稍后重试。'),
    };
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      return { ok: false, code: 'AI_TIMEOUT', message: 'AI 响应超时，请稍后重试。' };
    }
    return { ok: false, code: 'NETWORK', message: '无法连接 AI 服务，你仍可使用课程搜索和比较功能。' };
  }
}
