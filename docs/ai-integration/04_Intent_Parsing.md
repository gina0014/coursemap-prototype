# 04 Intent Parsing（Stage A）

## Objective
自然语言 → `LearningDecisionRequest`（结构化约束），未知=null，禁止猜测。

## Data Flow
```
user message
→ [DeepSeek, response_format=json_object] intentExtractionUserPrompt
→ raw JSON
→ sanitizeIntent()：逐字段清洗（str/num/enum/bool + 范围）
→ intent + warnings
```

## Schema（规格 §13 全字段）
goal / current_level / known_skills / budget / available_hours_per_week /
target_duration_weeks / language / preferred_learning_style /
certificate_requirement / resource_type / career_goal。

清洗规则（intentSchema.mjs）：
- 字符串 trim + 截断；数值范围（budget 0–100000、hours 0.5–100、weeks 0.5–520）；
- 枚举白名单（level/language/style/resource_type）；非法 → null；
- 越界 / 类型错误 → null + warning（返回给用户「已忽略」说明）；
- 输入不是对象 → 全 null 安全对象，绝不抛错。

优先级：**前端 context 显式约束 > 会话延续 > 模型本轮抽取**（用户 > 模型）。

## Tests
A-04 系列（清洗/枚举/越界/known_skills）；L-01b（Live：预算 200 / 每周 5 小时提取）。

## Result
PASS。
