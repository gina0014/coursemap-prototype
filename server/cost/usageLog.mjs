/* ============================================================================
   CourseMap AI Backend — cost/usageLog.mjs
   ----------------------------------------------------------------------------
   成本可观测（规格 §34-35）：结构化内存日志 + 汇总报告。
   记录：request_id / adapter / model / latency / tokens / tool calls / status。
   不记录：API key、用户消息原文（最小化原则）。
   ========================================================================== */

const MAX_ENTRIES = 1000;

export class UsageLogger {
  constructor() { this._entries = []; }

  record(entry) {
    this._entries.push({ ...entry, at: new Date().toISOString() });
    if (this._entries.length > MAX_ENTRIES) this._entries.shift();
  }

  report() {
    const n = this._entries.length;
    if (n === 0) return { calls: 0, avg_tokens: 0, fail_rate: 0, avg_latency_ms: 0 };
    const ok = this._entries.filter((e) => e.status === 'ok');
    const totalTokens = ok.reduce((s, e) => s + (e.usage?.total_tokens || 0), 0);
    const latency = ok.reduce((s, e) => s + (e.latency_ms || 0), 0);
    return {
      calls: n,
      ok_calls: ok.length,
      avg_tokens: ok.length ? Math.round(totalTokens / ok.length) : 0,
      total_tokens: totalTokens,
      fail_rate: Math.round(((n - ok.length) / n) * 100) / 100,
      avg_latency_ms: ok.length ? Math.round(latency / ok.length) : 0,
    };
  }
}

export const usageLogger = new UsageLogger();
