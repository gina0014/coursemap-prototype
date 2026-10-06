# 09 — Cost Control & Observability（模块 Q）

## Objective

让 AI 调用**有上限、可观测、可归因**，并且**永不泄漏密钥**。
上限必须落在服务端（前端可被绕过，服务端不能）。

## Decision

七类限制 + 三类日志，全部为服务端强制：

| 维度 | 机制 | 默认值 | 位置 |
| --- | --- | --- | --- |
| 请求频率 | 服务端滑动窗口限流（按 IP） | `10 req / 60s` | `security/security.mjs` |
| 消息长度 | 输入校验，超长直接 413 | `600` 字符 | `limits.maxMessageChars` |
| 上下文长度 | 会话结构化约束合并（非全量 raw chat）+ 历史上限 | `6` 轮 | `context.maxHistoryTurns` |
| 工具轮数 | Tool-calling 循环上限 | `4` 轮 | `limits.maxToolRounds` |
| 检索条数 | 送入 prompt 的候选上限 | `12` 条 | `limits.maxRetrievalResults` / `maxCandidatesInPrompt` |
| 输出 token | 单次调用输出上限 | `2400` | `deepseek.maxOutputTokens` |
| 超时 | 单次上游请求 / 整条管线 | `45s` / `60s` | `deepseek.timeoutMs` / `limits.orchestratorTimeoutMs` |

**关键设计决策：思考模式（thinking）默认关闭。**
官方 V4 默认**开启**思考模式（`reasoning_effort` 支持 `high`/`max`），但其代价是：
- 输出 token 显著增加（思考 token 计费）；
- 思考模式下 `temperature` 被忽略，抽取任务的可复现性下降；
- 工具调用时若未把 `reasoning_content` 回传，上游返回 400。

CourseMap 的两段式管线是「结构化抽取 + 工具调用排序」，不是复杂推理任务，
因此**显式**在请求体写入 `{ thinking: { type: 'disabled' } }`，而不是依赖服务端默认值。
需要时可经 `DEEPSEEK_THINKING=enabled` + `DEEPSEEK_REASONING_EFFORT=high` 打开。
（`DeepSeekAdapter` 已实现 thinking 开启时回传 `reasoning_content` 的逻辑，避免 400。）

**为什么两段式是必要成本而非浪费**：
Stage A（意图抽取）与 Stage B（证据排序 + 解释）是**不同任务**。
合并成一次调用会迫使模型在同一个 JSON 里既做抽取又做排序，
既降低抽取稳定性，又让"模型是否看了证据"变得无法验证。分开后：
- Stage A 可用低 `temperature`（0.1）保证可复现；
- Stage B 的工具调用轨迹可被断言（`A-17` 系列）。

## Implementation

### 限流

```js
// server/security/security.mjs
class RateLimiter {
  constructor(windowMs = CONFIG.rateLimit.windowMs,       // 60_000
              max      = CONFIG.rateLimit.maxRequests) {  // 10
    ...
  }
  check(key) { /* 超限 → ApiError(RATE_LIMITED) */ }
}
```

集成测试 `I-08` 实际打满 12 次请求并断言最后一次返回 `RATE_LIMITED`。

### 可观测日志

`server/cost/usageLog.mjs` —— 结构化内存日志（`MAX_ENTRIES = 1000`，FIFO）：

```js
record({
  request_id, adapter, model,
  latency_ms,
  usage: { stageA, stageB, total_tokens },
  tool_call_count, retrieval_count, status,
})
```

`report()` 产出：`calls` / `ok_calls` / `avg_tokens` / `total_tokens` / `fail_rate` / `avg_latency_ms`。

**不记录**：API key、用户消息原文。这条在文件头就写明，
并由 `A-16`（报告可回答调用数/token/latency）与 `I-09`/`A-16`（不含敏感关键词）共同锁定。

### 模型名可归因

`DeepSeekAdapter` 记录的是**实际服务的模型**（`servedModel || configuredModel`），
而不是请求里配置的模型名。这样当上游切换实际服务版本时，日志能反映真实情况。
`orchestrator` 把 `this.adapter.model` 写进 `usageLog`，前端在响应头显示同一个值。

### 错误响应不含敏感信息

`server/errors.mjs` 的 `toSafeError()` 统一收口，对外只给 `{ code, message }` 与必要的
非敏感上下文。集成测试 `I-09` 断言错误响应中不出现 `stack` / `sk-...` / `api_key` / `api-key`。

## Files

| 文件 | 变化 |
| --- | --- |
| `server/config.mjs` | `maxOutputTokens` 2000 → 2400；新增 `thinking` / `reasoningEffort` |
| `server/llm/DeepSeekAdapter.mjs` | `#modelParams()`、空内容重试、thinking 回传、`servedModel` 记录 |
| `server/cost/usageLog.mjs` | （已满足需求，未改动） |
| `.env.example` | 新增 `DEEPSEEK_THINKING` / `DEEPSEEK_REASONING_EFFORT` / `DEEPSEEK_MAX_OUTPUT_TOKENS` / `ALLOWED_ORIGIN` |
| `.github/workflows/live-verify.yml` | `offline-gates` 增加 `secret_scan.mjs` |

## Tests

| 断言 | 位置 | 覆盖 |
| --- | --- | --- |
| `I-08` | `integration.test.mjs` | 服务端限流生效 |
| `I-09` | `integration.test.mjs` | 错误响应不含敏感关键词 |
| `A-16` | `unit.test.mjs` | UsageLogger 报告可回答调用数 / token / latency |
| `I-04`、`I-05` | `data1.test.mjs` | 输出 token 上限与超时已设置 |
| `I-03` | `data1.test.mjs` | 思考模式默认关闭 |
| `R-05` | `routing.test.mjs` | `.env.example` 中 `DEEPSEEK_API_KEY` 为空值 |
| `secret_scan.mjs` | CI `offline-gates` | 全仓与 git 历史新增行无密钥 |

**密钥扫描结果**：
```
files scanned: 152
git-history added-line findings: 0
SECRET LEAK = 0
```

## Result

- 七类上限全部服务端强制，且都有对应测试或配置断言。
- 日志覆盖请求数 / 模型 / token / 延迟 / 工具轮数 / 检索条数 / 状态，零密钥、零消息原文。
- 上游模型名可归因（记录实际服务模型）。
- 密钥泄漏 = 0（含 git 历史新增行扫描）。
- 成本约束的**关键开关**（thinking 默认关闭）有测试锁定，防止被静默改回。

## Known Limitations

- **限流是按单实例内存实现的**：Serverless（Vercel）每个 Function 实例有独立内存，
  因此 `10 req/min` 是**每实例**而非全局。冷启动/多实例下实际配额会被放大。
  生产级需要外部存储（Redis / Upstash）做共享窗口 —— 本轮未引入外部依赖，是有意的范围控制。
- `UsageLogger` 同样是内存态，Serverless 下实例销毁即丢失，日志不进持久化后端。
  当前定位是「可观测性接口已就位」，不是「生产级计费系统」。
- 未实现**单用户级别的预算上限**（如"每个 IP 每天最多 N tokens"），只有频率上限。
- 官方已宣布**峰时附加费**（北京时间白天窗口）但截止 2026-10-06 尚未生效，
  且未公布费率与起始日期。因此日志中未记录「峰时/非峰时」归因字段 —— 若该政策生效，
  需要基于已有的 `at` 时间戳做回溯归因（日志已带 ISO 时间戳，可支持）。
