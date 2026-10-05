# 14 Test Strategy

## 分层（规格 §42-47）
| 层 | 文件 | 依赖真实 API？ | 状态 |
| --- | --- | --- | --- |
| 核心回归（不变） | tests/runtime.test.mjs | 否 | 75 PASS / 0 FAIL |
| AI 单元 | tests/ai/unit.test.mjs | 否（Mock + 真实数据） | 58 PASS / 0 FAIL |
| AI HTTP 集成 | tests/ai/integration.test.mjs | 否（本地起生产 handler） | 10 PASS / 0 FAIL |
| AI Live | tests/ai/live.deepseek.test.mjs | **是（仅有 DEEPSEEK_API_KEY 时）** | SKIP（无 Key） |
| 浏览器冒烟 | scripts/regression/browser_smoke.mjs | 否 | 16/16 PASS |

CI / regression 默认 Mock（ADR：避免成本、不确定性与 API outage 影响测试）；
Live 测试绝不在公开日志打印 Key（只打印 usage 统计）。

## 专项防线测试（全部由 Mock 触发、代码验证）
- **幻觉资源**（A-18）：模型返回不存在的 `XYZ-神课` → INVALID_MODEL_OUTPUT，不显示。
- **事实冲突**（A-19）：模型回传 fake_fee=9999 → 展示层 fee = Repository 值
  （Repository Facts > LLM Facts）。
- **Prompt 注入**（A-20/A-20b）：demo 资源描述内嵌 "Ignore all previous instructions"
  → 不执行、不改变任何数据（测试后不留污染：探针是 DEMO 数据的固定标注字符串）。
- **限流**（A-10 / I-08）、**错误映射**（A-12）、**输入校验**（A-11）、
  **会话连续性**（A-15b）。

## AI Moments of Truth 对应
AI-MoT #1/#2：L-01（意图提取断言）；#3：A-17/L-01c；#4：L-01d；
#5：A-23-evidence + L-01e；#6：08 文档的 UI 分区 + A-08；#7：A-22/I-10（降级路径）。
Live 公网 E2E（规格 §48 七个 Case）见 `16_Public_E2E.md` —— **待 Key 后执行**。

## Result
核心 FAIL=0；AI 单元/集成 FAIL=0；Live = SKIP（待 Key）。
