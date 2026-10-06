# 14 Test Strategy

## 分层（规格 §42-48）
| 层 | 文件 | 依赖真实 API？ | 状态 |
| --- | --- | --- | --- |
| 核心回归（不变） | tests/runtime.test.mjs | 否 | 75 PASS / 0 FAIL |
| AI 单元 | tests/ai/unit.test.mjs | 否（Mock + 真实数据） | 78 PASS / 0 FAIL |
| AI 路由一致性 | tests/ai/routing.test.mjs | 否（本地路由 == 生产路由） | 10 PASS / 0 FAIL |
| AI HTTP 集成 | tests/ai/integration.test.mjs | 否（本地起生产 handler） | 10 PASS / 0 FAIL |
| AI Live | tests/ai/live.deepseek.test.mjs | **是（仅有 DEEPSEEK_API_KEY 时）** | 有 Key 才运行 |
| 浏览器冒烟 | scripts/regression/browser_smoke.mjs | 否 | 16/16 PASS |
| **后端生产验证** | scripts/verify/live_public_verify.mjs | **是（生产后端 + 真实 DeepSeek）** | 本地等价 64/64 PASS |
| **浏览器生产 E2E** | scripts/verify/public_e2e.mjs | **是（公网前端 + 生产后端）** | 本地等价 37/37 PASS |

CI / regression 默认 Mock（ADR：避免成本、不确定性与 API outage 影响测试）；
Live 测试绝不在公开日志打印 Key（只打印 usage 统计）。

**路由一致性测试（A 类）为什么必要**：Vercel 是文件系统路由——每个 route 必须有
对应文件。本地 dev-server 用代码路由，会掩盖「生产缺文件 → 404」这类缺陷（真实踩坑）。
`routing.test.mjs` 断言两边路由集合一致，并用**变异测试**验证「删掉 `api/ai/health.js`
时该测试真的会失败」。

**生产验证为什么必须在 CI 跑 + 部署闸门**：开发机无法直连 `*.vercel.app`；
且 push 会并行触发 Vercel redeploy 与验证流水线，必须先用 `meta.build`
（`wait_for_deploy.mjs` + V-04b）确认「验的是本次提交的部署」，否则会误验旧代码。

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
Live 公网 E2E（规格 §48）见 `16_Public_E2E.md` —— 已落地为真实浏览器脚本，
本地等价验证 37/37 PASS；真实生产复测待修复推送后由 CI 产出证据。

## Result
核心 FAIL=0；AI 单元 / 路由 / 集成 FAIL=0；后端生产验证 64/64；浏览器 E2E 37/37；
Secret Leak=0；数据 BLOCKER/ERROR=0。
真实生产复测：**PENDING**（首轮 25/35 FAIL 已定位并修复，待推送后复测）。
