/* ============================================================================
   CourseMap AI Backend — llm/LLMAdapter.mjs
   ----------------------------------------------------------------------------
   LLM Adapter 接口（ADR-002）：
     AIOrchestrator 只依赖本接口，不感知具体厂商 SDK / HTTP 细节。
     实现：DeepSeekAdapter（生产） / MockLLMAdapter（测试）/ 未来 OpenAIAdapter 等。

   接口约定（异步）：
     - chatJSON({ messages, temperature, maxTokens })  → { content: object, usage }
       必须返回已解析的 JSON 对象；解析失败抛 ApiError(INVALID_MODEL_OUTPUT)。
     - chatWithTools({ messages, tools, handleToolCall, maxRounds })
         → { content: string|null, usage, toolCallCount }
       handleToolCall(name, args) 为同步/异步回调，由 orchestrator 注入。
   ========================================================================== */

export class LLMAdapter {
  /** @returns {string} adapter 名称，用于日志与 meta（不含敏感信息） */
  get name() { return 'base'; }

  get isConfigured() { return true; }

  /* eslint-disable-next-line no-unused-vars */
  async chatJSON(/* { messages, temperature, maxTokens } */) {
    throw new Error('LLMAdapter.chatJSON not implemented');
  }

  /* eslint-disable-next-line no-unused-vars */
  async chatWithTools(/* { messages, tools, handleToolCall, maxRounds } */) {
    throw new Error('LLMAdapter.chatWithTools not implemented');
  }
}
