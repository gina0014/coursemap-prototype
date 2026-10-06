# 13 — DeepSeek Model Audit（模块 I）

## Objective

在把真实流量打到 DeepSeek 之前，先确认「我们调用的模型名是否存在于官方当前模型表」。
一个写错的模型名不会在本机报错（Mock 测试全绿），只会在生产环境返回 HTTP 错误 ——
这正是本轮实际发现的缺陷类型。

## Audit Method

核验对象（2026-10-06）：

| 项 | 核验方式 |
| --- | --- |
| base URL | 官方文档「首次调用 API」页 |
| 受支持模型 ID | 官方文档 `.env`/param 表 + 官方发布公告 |
| 已停用模型 | 官方发布公告的停用时间点 |
| 结构化输出 | 官方 JSON Output 机制 |
| 工具调用 | 官方 Tool Calling 协议 |
| 思考模式 | 官方 Thinking Mode 文档（开关语义与参数） |

## Findings

| 项 | 官方结论（2026-10-06） |
| --- | --- |
| base URL（OpenAI 兼容） | `https://api.deepseek.com` |
| base URL（Anthropic 兼容） | `https://api.deepseek.com/anthropic` |
| 对话端点 | `POST {base}/chat/completions` |
| **当前模型 ID** | **`deepseek-v4-flash`**（DeepSeek-V4-Flash-0731）、**`deepseek-v4-pro`**（DeepSeek-V4-Pro-0813）、`deepseek-v4-flash-vision-exp`（实验，支持图片输入） |
| **已停用模型** | `deepseek-chat`、`deepseek-reasoner` —— **2026-07-24 15:59 UTC 起永久停用**，调用返回 HTTP 错误，无宽限期、无软重定向 |
| 停用名的历史语义 | `deepseek-chat` = V4-Flash **非思考模式**；`deepseek-reasoner` = V4-Flash **思考模式** |
| 正确迁移目标 | `deepseek-v4-flash`（思考/非思考是**请求级参数**，不是两个模型） |
| 迁移陷阱 | 把 `deepseek-reasoner` 的"后继"理解为 `deepseek-v4-pro` → 单价约为 Flash 的 **3.1 倍**（输入 cache-miss $0.435 vs $0.14 / 输出 $0.87 vs $0.28 每百万 token） |
| 上下文长度 | 1M（官方所有服务标配） |
| 思考模式 | V4 默认**开启**；`reasoning_effort` 支持 `high` / `max`；关闭方式 `{ "thinking": { "type": "disabled" } }` |
| 思考模式下 `temperature` | 被忽略 |
| 结构化输出 | `response_format: { type: 'json_object' }`（JSON Output） |
| 工具调用 | OpenAI 兼容 `tools` / `tool_calls` |
| 峰时附加费 | **已宣布但未生效**（截至 2026-10-06 无费率、无起始日期；官方费率表仍为单一平价档） |

## Defects Found & Fixed

本审计发现 **1 个真实缺陷**（不是风格问题，是会在生产环境失败的问题）：

### DEFECT-1（严重）：默认模型名缺少 `v4-` 前缀

| 项 | 内容 |
| --- | --- |
| 位置 | `server/config.mjs` → `deepseek.model` |
| 缺陷值 | `deepseek-flash` |
| 官方实际名称 | `deepseek-v4-flash` |
| 影响 | `deepseek-flash` **不在官方模型表中**。生产真实调用会返回模型不存在类错误；而本机 Mock 测试全部通过（Mock 不校验模型名），因此缺陷不会被 CI 发现 |
| 根因 | 凭记忆推断模型命名规则（假设是 `deepseek-<tier>`），未以官方文档的 param 表为准 |
| 修复 | 默认值改为 `deepseek-v4-flash`；注释改为引用官方文档链接与停用时间点 |
| 回归防线 | `tests/ai/data1.test.mjs` 的 `I-01` / `I-01b` / `I-06`；`public_e2e.mjs` 的 `E-04c` / `E-04c2` |

### DEFECT-2（严重，已在前序提交修复，本审计确认）：默认值指向已停用模型

| 项 | 内容 |
| --- | --- |
| 位置 | `server/config.mjs` → `deepseek.model` |
| 缺陷值 | `deepseek-chat` |
| 影响 | 该别名自 2026-07-24 15:59 UTC 起调用返回 HTTP 错误 |
| 修复 | 本轮一并替换；并新增 `I-06` 断言「代码默认值中无已停用/错误模型名字面量」 |

## Implementation

### `server/config.mjs`

```js
// 模型名来源：DeepSeek 官方 API Docs · Models（2026-10-06 核验）
// 官方当前模型表：deepseek-v4-flash（V4-Flash-0731）、deepseek-v4-pro（V4-Pro-0813）、
//   deepseek-v4-flash-vision-exp（实验）
// ⚠️ 旧名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 15:59 UTC 永久停用
deepseek: {
  apiKey: envStr('DEEPSEEK_API_KEY'),
  baseUrl: envStr('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
  model: envStr('DEEPSEEK_MODEL', 'deepseek-v4-flash'),
  timeoutMs: envInt('DEEPSEEK_TIMEOUT_MS', 45000),
  maxOutputTokens: envInt('DEEPSEEK_MAX_OUTPUT_TOKENS', 2400),
  thinking: envStr('DEEPSEEK_THINKING', 'disabled') === 'enabled',
  reasoningEffort: envStr('DEEPSEEK_REASONING_EFFORT', 'low'),
}
```

**设计原则：默认值跟随官方当前模型，且允许环境变量覆盖。**
因此「官方切换模型」时只需改 `.env`，不需要改代码；而「忘记改默认值」也不会导致打到停用模型 ——
因为默认值本身已是最新模型。

### 思考模式处理

V4 官方默认**开启**思考模式。CourseMap 显式**关闭**，理由与实现见 [09_Cost_Control.md](09_Cost_Control.md)。
适配器同时实现了「思考模式开启时把 `reasoning_content` 回传」的逻辑，避免官方规定的 400。

### 模型版本可归因

`DeepSeekAdapter` 暴露 getter：

```js
get configuredModel() { return CONFIG.deepseek.model; }   // 配置的模型名
get model()           { return this.servedModel || CONFIG.deepseek.model; }  // 实际服务的模型
```

`usageLog.record()` 写的是 `this.adapter.model`（实际服务模型），使日志能反映上游真实情况。

## Files

| 文件 | 变化 |
| --- | --- |
| `server/config.mjs` | 模型名 `deepseek-flash` → `deepseek-v4-flash`；注释重写为带官方引用的形式 |
| `.env.example` | `DEEPSEEK_MODEL=deepseek-v4-flash`；停用说明更正为带时间点的事实 |
| `api/ai/health.js` / `api/ai/advisor.js` | 注释中的默认模型名同步 |
| `scripts/verify/deepseek_shadow.mjs` | Mock 上游响应中的默认模型名同步 |
| `docs/ai-integration/03_DeepSeek_Adapter.md` / `15_Deployment.md` | 文档中的旧模型名更正 |
| `tests/ai/data1.test.mjs` | 新增 `I-01` ~ `I-06` 模型审计断言 |
| `scripts/verify/public_e2e.mjs` | `E-04c` / `E-04c2` 生产模型名校验 |

## Tests

| 断言 | 内容 |
| --- | --- |
| `I-01` | `CONFIG.deepseek.model` 匹配 `^deepseek-v4-(flash\|pro\|flash-vision-exp)$` |
| `I-01b` | 不是 `deepseek-chat` / `deepseek-reasoner` / `deepseek-flash` |
| `I-02` | base URL 为 `https://api.deepseek.com` |
| `I-03` | 思考模式默认关闭 |
| `I-04` / `I-05` | 输出 token 上限与超时已设置 |
| `I-06` | 代码默认值中无停用/错误模型名字面量（扫描 `config.mjs`、`.env.example`、`DeepSeekAdapter.mjs`、`api/ai/*.js` 的非注释行） |
| `E-04c` | 生产后端上报的模型名匹配官方当前模型表 |
| `E-04c2` | 生产后端未上报停用或拼写错误的模型名 |

**`I-06` 的实现细节**（避免误报注释里的迁移说明）：

```js
const lines = text.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l));
return lines.some((l) => /['"]deepseek-(chat|reasoner|flash)['"]/.test(l));
```

即：**允许在注释/文档中提到旧名（作为迁移说明），禁止在赋值或字符串默认值中出现。**

## Result

- 官方模型表核验完成，结论写入代码注释并附官方链接。
- DEFECT-1（`deepseek-flash` 缺 `v4-`）已修复；DEFECT-2（`deepseek-chat` 已停用）已修复。
- 7 条模型审计断言全部通过（`I-01` ~ `I-06`）。
- 代码库中不再有停用/错误模型名的字面量默认值。
- 「思考模式默认关闭」有测试锁定，防止被静默改回（该改动会显著提高成本）。

## Known Limitations

- **模型表会变**：本次核验的时点是 2026-10-06。官方可能再次新增/停用模型。
  当前防线（`I-01` 的正则）只覆盖已知的三类名称，**不能自动发现**新的停用；
  真正的持续保障依赖人工复检官方文档，以及生产 `E-04c` 断言在 CI 中的持续执行。
- `E-04c` 依赖 `health.data.model` 上报配置的模型名，而非上游实际服务的模型版本。
  「配置正确」不等于「上游服务的是同一版本」；后者需要从响应体中读取实际模型字段（适配器已记录 `servedModel`，但未在 health 中暴露）。
- 本机无法访问 `*.vercel.app`（DNS/SNI 原因），因此**真实 DeepSeek 调用未在本机验证**。
  生产激活的最终证据必须来自 GitHub Actions（见 [11_Public_E2E.md](11_Public_E2E.md)）。
- 官方宣布的**峰时附加费**未生效，未做归因字段；若生效需基于已有 ISO 时间戳回溯。
