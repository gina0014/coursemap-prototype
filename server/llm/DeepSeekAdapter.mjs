/* ============================================================================
   CourseMap AI Backend — llm/DeepSeekAdapter.mjs
   ----------------------------------------------------------------------------
   DeepSeek 生产适配器（按 DeepSeek 官方 OpenAI 兼容 API 实现，2026-10-06 核验）：
     POST {baseUrl}/chat/completions
     Authorization: Bearer $DEEPSEEK_API_KEY   （SERVER SIDE ONLY）
     response_format: { type: 'json_object' }  （JSON 输出模式）
     thinking: { type: 'disabled' }            （显式关闭思考模式，见下）

   思考模式（官方默认开启，effort=high）在本适配器中的处理：
     - CourseMap 的 Stage A/B 是「结构化抽取 + 工具调用」，需要低延迟与可复现，
       且官方规定思考模式下 temperature 被静默忽略、并**强制**把 reasoning_content
       回传（否则 400）。因此默认显式关闭。
     - 若通过 DEEPSEEK_THINKING=enabled 打开，则本适配器会把 reasoning_content
       随 assistant 消息一并回传，满足官方要求（否则工具调用会 400）。

   可靠性：
     - timeout（AbortController）
     - 429 → RATE_LIMITED；401/403 → AI_UNAVAILABLE（绝不透出 key）
     - finish_reason=length / empty content → INVALID_MODEL_OUTPUT
       （JSON 输出模式官方提示「偶发返回空内容」，故 chatJSON 做一次重试）
   可观测性：
     - usage（prompt/completion/total tokens）+ 实际 model 名回传，绝不含 key。
   ========================================================================== */

import { LLMAdapter } from './LLMAdapter.mjs';
import { ApiError, ERROR_CODES } from '../errors.mjs';
import { CONFIG, hasDeepSeekKey } from '../config.mjs';

export class DeepSeekAdapter extends LLMAdapter {
  constructor(overrides = {}) {
    super();
    this._apiKey = overrides.apiKey ?? CONFIG.deepseek.apiKey;
    this._baseUrl = (overrides.baseUrl ?? CONFIG.deepseek.baseUrl).replace(/\/+$/, '');
    this._model = overrides.model ?? CONFIG.deepseek.model;
    this._timeoutMs = overrides.timeoutMs ?? CONFIG.deepseek.timeoutMs;
    this._thinking = overrides.thinking ?? CONFIG.deepseek.thinking;
    this._reasoningEffort = overrides.reasoningEffort ?? CONFIG.deepseek.reasoningEffort;
    /** 上游实际服务的模型名（用于观测「配置的模型」与「真实服务的模型」是否一致） */
    this._servedModel = null;
  }

  get name() { return 'deepseek'; }

  get isConfigured() { return this._apiKey.length > 0; }

  get model() { return this._servedModel || this._model; }

  get configuredModel() { return this._model; }

  get thinkingEnabled() { return this._thinking === true; }

  /** 统一的模型侧参数（思考模式开关显式声明，不依赖服务端默认值）。 */
  #modelParams(temperature) {
    if (this._thinking) {
      // 思考模式下 temperature 被忽略；只传 effort，避免"看起来生效其实没生效"。
      return { thinking: { type: 'enabled' }, reasoning_effort: this._reasoningEffort };
    }
    return { temperature, thinking: { type: 'disabled' } };
  }

  async #chat(body) {
    if (!this.isConfigured) {
      throw new ApiError(ERROR_CODES.NOT_CONFIGURED,
        'AI 服务未配置（缺少服务端密钥）。', 503);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await fetch(`${this._baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new ApiError(ERROR_CODES.AI_TIMEOUT, 'AI 服务响应超时，请稍后重试。', 504, { timeoutMs: this._timeoutMs });
      }
      throw new ApiError(ERROR_CODES.AI_UNAVAILABLE, 'AI 服务暂不可用，请稍后重试。', 502, { cause: String(err && err.message) });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      throw new ApiError(ERROR_CODES.RATE_LIMITED, 'AI 请求过于频繁，请稍后再试。', 429);
    }
    if (res.status === 401 || res.status === 403) {
      // 绝不透出 key 或上游错误体
      throw new ApiError(ERROR_CODES.AI_UNAVAILABLE, 'AI 服务鉴权失败，请联系维护者。', 502, { upstreamStatus: res.status });
    }
    if (!res.ok) {
      throw new ApiError(ERROR_CODES.AI_UPSTREAM_ERROR, 'AI 服务异常，请稍后重试。', 502, { upstreamStatus: res.status });
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      throw new ApiError(ERROR_CODES.AI_UPSTREAM_ERROR, 'AI 服务返回异常。', 502);
    }
    if (payload && typeof payload.model === 'string' && payload.model) {
      this._servedModel = payload.model;
    }
    const choice = payload && payload.choices && payload.choices[0];
    const finishReason = choice ? choice.finish_reason : null;
    const message = choice ? choice.message : null;
    const usage = payload.usage ? {
      prompt_tokens: payload.usage.prompt_tokens,
      completion_tokens: payload.usage.completion_tokens,
      total_tokens: payload.usage.total_tokens,
    } : null;
    return { message, finishReason, usage };
  }

  /** JSON 输出模式：返回解析后的对象（schema 校验由调用方做）。 */
  async chatJSON({ messages, temperature = 0.2, maxTokens = CONFIG.deepseek.maxOutputTokens }) {
    // 官方 JSON 输出说明：偶发返回空内容，允许重试；因此这里做「最多 2 次」。
    let lastDetail = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { message, finishReason, usage } = await this.#chat({
        model: this._model,
        messages,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        ...this.#modelParams(temperature),
      });

      const text = message && typeof message.content === 'string' ? message.content.trim() : '';
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      if (cleaned && finishReason !== 'length') {
        try {
          return { content: JSON.parse(cleaned), usage };
        } catch {
          lastDetail = { parseFailed: true, attempt };
          continue;
        }
      }
      lastDetail = { finishReason, empty: !cleaned, attempt };
    }
    throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT,
      'AI 返回格式异常，请重试。', 502, lastDetail || {});
  }

  /** Tool-calling 循环：模型 → 工具 → 模型 …（轮数有上限）。 */
  async chatWithTools({ messages, tools, handleToolCall, maxRounds = CONFIG.limits.maxToolRounds, temperature = 0.3, maxTokens = CONFIG.deepseek.maxOutputTokens }) {
    const convo = messages.slice();
    let toolCallCount = 0;
    let usage = null;

    for (let round = 0; round <= maxRounds; round += 1) {
      const body = {
        model: this._model,
        messages: convo,
        max_tokens: maxTokens,
        ...this.#modelParams(temperature),
      };
      if (round < maxRounds) body.tools = tools; // 最后一轮强制收口为纯文本/JSON
      // eslint-disable-next-line no-await-in-loop
      const r = await this.#chat(body);
      if (r.usage) usage = r.usage;
      const msg = r.message;
      if (!msg) {
        throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回异常，请重试。', 502);
      }

      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (toolCalls.length > 0 && round < maxRounds) {
        // 思考模式 + tools：官方要求把 reasoning_content 一并回传，否则 400。
        const assistantMsg = { role: 'assistant', content: msg.content || null, tool_calls: toolCalls };
        if (this._thinking && typeof msg.reasoning_content === 'string') {
          assistantMsg.reasoning_content = msg.reasoning_content;
        }
        convo.push(assistantMsg);
        for (const call of toolCalls) {
          toolCallCount += 1;
          const name = call && call.function ? String(call.function.name || '') : '';
          const args = call && call.function ? call.function.arguments : '{}';
          // 参数永远视为 untrusted：交给 executor 校验
          // eslint-disable-next-line no-await-in-loop
          const result = await handleToolCall(name, args);
          convo.push({
            role: 'tool',
            tool_call_id: (call && call.id) || `call_${round}_${toolCallCount}`,
            content: JSON.stringify(result).slice(0, 6000),
          });
        }
        continue;
      }

      // 终局轮：模型应输出最终 JSON 文本
      const text = typeof msg.content === 'string' ? msg.content.trim() : '';
      if (!text) {
        throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回为空，请重试。', 502, { finishReason: r.finishReason });
      }
      return { content: text, usage, toolCallCount };
    }
    throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 工具调用轮次超限，请重试。', 502);
  }
}
