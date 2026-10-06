/* ============================================================================
   CourseMap AI Backend — llm/MockLLMAdapter.mjs
   ----------------------------------------------------------------------------
   测试专用 Mock 适配器（ADR：CI/regression 默认 Mock，不调真实 API）：
     - 确定性、零成本、无网络。
     - 可脚本化：故意返回幻觉 resource_id / 错误 fee / prompt injection，
       用于验证 orchestrator 的 CODE-ENFORCED 防线（不是靠 prompt 求饶）。
   ========================================================================== */

import { LLMAdapter } from './LLMAdapter.mjs';

export class MockLLMAdapter extends LLMAdapter {
  /**
   * @param {object} opts
   * @param {object} opts.intent            Stage A 返回的意图 JSON
   * @param {Array}  [opts.toolCalls]       Stage B 先发起的工具调用 [{name, args}]
   * @param {object} [opts.final]          Stage B 最终 JSON（recommendations 等）
   * @param {Error}  [opts.throwOnChat]    模拟上游故障
   */
  constructor(opts = {}) {
    super();
    this._intent = opts.intent ?? {
      goal: 'Python 数据分析', current_level: 'beginner', known_skills: [],
      budget: null, available_hours_per_week: null, target_duration_weeks: null,
      language: null, preferred_learning_style: null, certificate_requirement: null,
      resource_type: null, career_goal: null,
    };
    this._toolCalls = opts.toolCalls ?? [];
    this._final = opts.final ?? {
      recommendations: [], general_advice: [], uncertainties: [], summary: '', path_ref: null, ai_schedule: null,
    };
    this._throwOnChat = opts.throwOnChat || null;
    this.calls = 0;
  }

  get name() { return 'mock'; }

  #assertOk() {
    this.calls += 1;
    if (this._throwOnChat) throw this._throwOnChat;
  }

  async chatJSON({ messages }) {
    this.#assertOk();
    const last = messages[messages.length - 1];
    const text = typeof (last && last.content) === 'string' ? last.content : '';
    // Stage A（意图解析）以 "Extract a structured LearningDecisionRequest" 识别
    if (text.includes('Extract a structured LearningDecisionRequest')) {
      return { content: this._intent, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } };
    }
    // 最终 JSON 校验阶段也走 chatJSON（orchestrator 收口）
    return { content: this._final, usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 } };
  }

  async chatWithTools({ messages, handleToolCall, expectJson = false }) {
    this.#assertOk();
    // 依次发出脚本化工具调用
    for (const { name, args } of this._toolCalls) {
      // eslint-disable-next-line no-await-in-loop
      await handleToolCall(name, args);
    }
    const out = {
      content: JSON.stringify(this._final),
      usage: { prompt_tokens: 300, completion_tokens: 120, total_tokens: 420 },
      toolCallCount: this._toolCalls.length,
    };
    // 与 DeepSeekAdapter 接口保持一致：expectJson 时同时给出已解析对象
    if (expectJson) out.json = this._final;
    // 可脚本化的「原始文本」：用于测试终局轮返回非 JSON 文本的场景
    if (typeof this._rawFinalText === 'string') out.content = this._rawFinalText;
    return out;
  }
}
