# 03 DeepSeek Adapter

## Objective
把 DeepSeek 的 HTTP API 封装为可替换的 `LLMAdapter`，业务层零感知厂商。

## Design Decision
- 使用 DeepSeek 官方 OpenAI 兼容 API：`POST {DEEPSEEK_BASE_URL}/chat/completions`。
  Base URL / Model / 超时全部走环境变量（`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`，
  默认 `https://api.deepseek.com` / `deepseek-v4-flash`），不在业务代码散落 hardcode。
- JSON 输出：`response_format: { type: 'json_object' }`（官方 JSON Output 机制），
  prompt 内同时给出 schema；解析前剥离偶发 markdown fence。
- Tool Calling：官方 `tools` + `tool_calls` 协议，轮数上限内循环，最后一轮强制收口。

## 错误映射（对外永不泄 key / 上游错误体）
| 上游 | 对外 |
| --- | --- |
| 超时（AbortController） | `AI_TIMEOUT` 504 |
| 429 | `RATE_LIMITED` 429 |
| 401/403 | `AI_UNAVAILABLE` 502（detail 仅含 upstreamStatus，进日志） |
| 5xx / 网络错误 | `AI_UPSTREAM_ERROR` / `AI_UNAVAILABLE` |
| empty content / finish_reason=length / JSON 解析失败 | `INVALID_MODEL_OUTPUT` |

## 可观测性
usage（prompt/completion/total tokens）随响应回传 → UsageLogger；
**任何日志路径都不输出 Authorization 头或 key**。

## Tests
- 未配置 key：`isConfigured=false`，调用抛 `NOT_CONFIGURED`（A-14/A-14b）。
- Mock 故障透传（A-13）；真实调用于 `tests/ai/live.deepseek.test.mjs`（有 Key 才跑）。

## Result
PASS（工程层面；Live 调用待 Key）。
