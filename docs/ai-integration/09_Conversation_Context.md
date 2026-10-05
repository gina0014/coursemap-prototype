# 09 Conversation Context（有限多轮）

## Objective（规格 §25-26）
「我想学 Python 数据分析」→「预算改成100」应保留 Goal、更新 Budget；
但不无限发送历史，不建立长期用户画像。

## 策略（ADR-007）
- **保存结构化约束，不保存 raw chat**：ConversationStore 只存 LearningDecisionRequest
  的约束键（goal/level/skills/budget/hours/weeks/language/certificate/type）。
- **session 级**：内存 + TTL（默认 30 分钟）+ conversation_id（sessionStorage 生成）；
  会话不跨 IP 复用（基础会话劫持防御）。
- **轮次上限**：默认 20 轮，超限 `RATE_LIMITED`，引导开新会话。
- **连续性规则**：本轮模型抽取未覆盖的键从会话延续（applyContinuity）；
  用户显式 context 优先于延续值。

## Privacy
- 不收集姓名/学校/学号/精确地址等敏感信息；请求体字段白名单，多余字段丢弃。
- 不做长期画像、不假装跨设备记忆；「清空会话」按钮清除本地会话标识。
- 多实例部署需将 store 换 Redis/KV（接口已收敛，属部署层工作）。

## Tests
A-15 / A-15b / A-15c；I-11（白名单清洗在 A-11c 覆盖）。

## Result
PASS。
