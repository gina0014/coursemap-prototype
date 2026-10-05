/* ============================================================================
   CourseMap AI Backend — security/*
   ----------------------------------------------------------------------------
   inputValidation.mjs：请求体校验（message 长度、字段白名单）。
   rateLimit.mjs：server-side per-IP 滑动窗口限流（内存实现）。
   ========================================================================== */

import { ApiError, ERROR_CODES } from '../errors.mjs';
import { CONFIG } from '../config.mjs';

/* ---------------- Input validation ---------------- */

export function validateAdvisorInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(ERROR_CODES.BAD_REQUEST, '请求体必须是 JSON 对象。', 400);
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new ApiError(ERROR_CODES.BAD_REQUEST, 'message 不能为空。', 400);
  }
  if (message.length > CONFIG.limits.maxMessageChars) {
    throw new ApiError(ERROR_CODES.MESSAGE_TOO_LONG,
      `消息过长（最多 ${CONFIG.limits.maxMessageChars} 字），请精简后重试。`, 413);
  }
  // 字段白名单：多余字段直接丢弃，不做深合并
  const conversationId = typeof body.conversation_id === 'string'
    ? body.conversation_id.slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '') : null;
  const context = (body.context && typeof body.context === 'object' && !Array.isArray(body.context))
    ? body.context : null;
  return { message, conversation_id: conversationId, context };
}

/* ---------------- Rate limiting ---------------- */

export class RateLimiter {
  constructor(windowMs = CONFIG.rateLimit.windowMs, max = CONFIG.rateLimit.maxRequests) {
    this._window = windowMs;
    this._max = max;
    this._hits = new Map(); // ip -> [timestamps]
  }

  /** @throws ApiError(RATE_LIMITED) */
  check(clientIp) {
    const now = Date.now();
    let hits = this._hits.get(clientIp);
    if (!hits) { hits = []; this._hits.set(clientIp, hits); }
    while (hits.length && now - hits[0] > this._window) hits.shift();
    if (hits.length >= this._max) {
      throw new ApiError(ERROR_CODES.RATE_LIMITED,
        '请求过于频繁，请一分钟后再试。', 429);
    }
    hits.push(now);
    // 简单清理，防 Map 无限增长
    if (this._hits.size > 5000) {
      for (const [ip, ts] of this._hits) {
        if (ts.length === 0 || now - ts[ts.length - 1] > this._window) this._hits.delete(ip);
      }
    }
  }
}
