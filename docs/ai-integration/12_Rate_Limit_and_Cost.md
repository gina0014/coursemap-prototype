# 12 Rate Limit & Cost Control

## Rate Limit（server-side，规格 §32）
- `RateLimiter`：per-IP 滑动窗口（默认 60s / 10 req，env 可调），内存实现，
  简单自清理防 Map 膨胀；超限 → `RATE_LIMITED` 429。
- 不依赖前端限制（前端限制可绕过）；I-08 HTTP 级验证。
- 会话轮次上限（20/会话）为第二道闸。

## Request Limits（规格 §33）
| 维度 | 默认上限 | env |
| --- | --- | --- |
| message 长度 | 600 字符（超出 413） | MAX_MESSAGE_CHARS |
| 工具调用轮数 | 4 | MAX_TOOL_ROUNDS |
| 检索结果数 / 候选入 prompt | 12 | MAX_RETRIEVAL_RESULTS |
| 输出 tokens | 2000 | DEEPSEEK_MAX_OUTPUT_TOKENS |
| 单请求超时（DeepSeek） | 45s | DEEPSEEK_TIMEOUT_MS |
| 编排超时 | 60s（vercel maxDuration=60） | ORCHESTRATOR_TIMEOUT_MS |
| 请求体 | 32KB | 固定 |
| 工具结果回填 | 单条 ≤6000 字符 | 固定 |

## Cost Observability（规格 §34-35）
- UsageLogger：request_id / adapter / model / latency / prompt+completion+total tokens /
  tool_call_count / retrieval_count / status；**不记录 API key 与用户原文**。
- `usageLogger.report()` 回答：调用数、成功率/失败率、平均 token、平均 latency
  （单实例内存日志，容量 1000 条；多实例需外置日志）。
- Live 测试结束时打印 usage report（tests/ai/live.deepseek.test.mjs）。

## Result
PASS（I-08 限流 / A-16 报告）。
