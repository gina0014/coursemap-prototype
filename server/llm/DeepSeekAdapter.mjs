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
import { extractJsonObject, withJsonRepairHint, JSON_REPAIR_HINT } from './jsonUtil.mjs';

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

  /**
   * JSON 输出模式：返回解析后的对象（schema 校验由调用方做）。
   *
   * 生产缺陷修复（2026-10-06，见 docs/data-integration/17_Production_Defect_Remediation.md）：
   *   旧实现 = 去围栏 + JSON.parse + 「finishReason==='length' 直接判失败」。
   *   真实模型会加解释性前缀、给未闭合围栏、留尾逗号、被 max_tokens 截断，
   *   于是「模型答对了但平台报 502」。现在：
   *     ① 用 extractJsonObject 稳健提取（含尾逗号修复与截断兜底）；
   *     ② 第 2 次尝试**改变请求**（追加 JSON 修复指令 + 提高 token 预算），
   *        而不是原样重发（原样重发对确定性错误无效，只是白花一次钱）。
   */
  async chatJSON({ messages, temperature = 0.2, maxTokens = CONFIG.deepseek.maxOutputTokens }) {
    let lastDetail = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const budget = attempt === 1
        ? maxTokens
        : Math.max(maxTokens, CONFIG.deepseek.maxOutputTokensRetry);
      const convo = attempt === 1 ? messages : withJsonRepairHint(messages);

      // eslint-disable-next-line no-await-in-loop
      const { message, finishReason, usage } = await this.#chat({
        model: this._model,
        messages: convo,
        max_tokens: budget,
        response_format: { type: 'json_object' },
        ...this.#modelParams(temperature),
      });

      const text = message && typeof message.content === 'string' ? message.content : '';
      const parsed = extractJsonObject(text);
      if (parsed) return { content: parsed, usage };

      lastDetail = {
        finishReason,
        empty: !text.trim(),
        truncated: finishReason === 'length',
        chars: text.length,
        attempt,
      };
    }
    throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT,
      'AI 返回格式异常，请重试。', 502, lastDetail || {});
  }

  /**
   * Tool-calling 循环：模型 → 工具 → 模型 …（轮数有上限）。
   *
   * @param {boolean} [opts.expectJson] 终局轮必须产出可解析的 JSON 对象。
   *   开启后：解析失败会用「JSON 修复指令」追加一次终局请求（只多一轮），
   *   仍失败才抛 INVALID_MODEL_OUTPUT。返回体额外带 `json`（已解析对象）。
   *   这样「模型答对了但格式带毛边」不再被误判为平台故障。
   */
  async chatWithTools({
    messages, tools, handleToolCall,
    maxRounds = CONFIG.limits.maxToolRounds,
    temperature = 0.3,
    maxTokens = CONFIG.deepseek.maxOutputTokens,
    expectJson = false,
  }) {
    const convo = messages.slice();
    let toolCallCount = 0;
    let usage = null;
    // expectJson 时允许**额外一轮**收口重问（不占用工具轮次预算）
    const hardLimit = maxRounds + (expectJson ? 1 : 0);
    let jsonRepairLeft = expectJson ? 1 : 0;
    // 一旦决定「收口重问」，后续轮次不再提供 tools —— 强制模型输出文本 JSON，
    // 而不是又发起一次工具调用把重试机会浪费掉。
    let forceClose = false;

    for (let round = 0; round <= hardLimit; round += 1) {
      const allowTools = round < maxRounds && !forceClose;
      const body = {
        model: this._model,
        messages: convo,
        max_tokens: maxTokens,
        ...this.#modelParams(temperature),
      };
      if (allowTools) body.tools = tools; // 最后一轮强制收口为纯文本/JSON
      // eslint-disable-next-line no-await-in-loop
      const r = await this.#chat(body);
      if (r.usage) usage = r.usage;
      const msg = r.message;
      if (!msg) {
        throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回异常，请重试。', 502);
      }

      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (toolCalls.length > 0 && allowTools) {
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
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text) {
        if (!expectJson) return { content: text, usage, toolCallCount };
        const parsed = extractJsonObject(text);
        if (parsed) return { content: text, json: parsed, usage, toolCallCount };
        if (jsonRepairLeft > 0) { jsonRepairLeft -= 1; forceClose = true; this.#pushRepairTurn(convo, msg, text); continue; }
        throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回格式异常，请重试。', 502,
          { stage: 'B', parseFailed: true, chars: text.length });
      }

      // 内容为空：也可能只是这一轮空转，给一次收口重问的机会
      if (jsonRepairLeft > 0) { jsonRepairLeft -= 1; forceClose = true; this.#pushRepairTurn(convo, msg, ''); continue; }
      throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 返回为空，请重试。', 502, { finishReason: r.finishReason });
    }
    throw new ApiError(ERROR_CODES.INVALID_MODEL_OUTPUT, 'AI 工具调用轮次超限，请重试。', 502);
  }

  /**
   * 追加「收口重问」的一轮：先回填 assistant 消息（维持角色交替，
   * 避免出现两条连续 user 消息被上游拒绝），再附上 JSON 修复指令。
   * 思考模式下按官方要求带上 reasoning_content。
   */
  #pushRepairTurn(convo, msg, assistantText) {
    const assistant = { role: 'assistant', content: assistantText || '' };
    if (this._thinking && msg && typeof msg.reasoning_content === 'string') {
      assistant.reasoning_content = msg.reasoning_content;
    }
    convo.push(assistant);
    convo.push({ role: 'user', content: JSON_REPAIR_HINT });
  }
}
