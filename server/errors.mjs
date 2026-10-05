/* ============================================================================
   CourseMap AI Backend — errors.mjs
   ----------------------------------------------------------------------------
   统一错误模型。对外 envelope：
     { success: false, error: { code, message } }
   硬约束：
     - 绝不向用户返回 stack trace、API key、internal prompt、内部环境信息。
     - 内部 detail 仅写入服务端日志。
   ========================================================================== */

export class ApiError extends Error {
  /**
   * @param {string} code    机器可读错误码（对外可见）
   * @param {string} message 用户可读消息（对外可见，不得含敏感信息）
   * @param {number} status  HTTP status
   * @param {*}      detail  内部细节（仅日志，不对外）
   */
  constructor(code, message, status = 500, detail = undefined) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_UPSTREAM_ERROR: 'AI_UPSTREAM_ERROR',
  INVALID_MODEL_OUTPUT: 'INVALID_MODEL_OUTPUT',
  NO_MATCHING_RESOURCE: 'NO_MATCHING_RESOURCE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  INTERNAL: 'INTERNAL',
};

/** 把任意抛出映射为安全对外错误。 */
export function toSafeError(err) {
  if (err instanceof ApiError) return err;
  // 未知错误：对外只说 INTERNAL，绝不透出 err.message（可能含内部信息）
  return new ApiError(ERROR_CODES.INTERNAL,
    '服务内部错误，请稍后重试。', 500, { raw: String(err && err.message || err) });
}
