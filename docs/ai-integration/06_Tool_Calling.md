# 06 Tool Calling

## Objective
让模型按需检索细节，而不是把整个数据库塞进 prompt；同时把工具面收敛为 allowlist。

## Tools（6 个，JSON Schema 声明，TOOL_NAMES 白名单）
| 工具 | 输入 | 说明 |
| --- | --- | --- |
| search_learning_resources | goal, level?, budget?, hours_per_week?, language?, certificate?, resource_type? | 只返回 CourseMap 存在的资源；预算越界拒绝 |
| get_resource_detail | resource_id | 详情 + 聚合评分 + provider |
| compare_learning_resources | resource_ids (2–6) | 派生统计（最低/最高费用、费用差、最短/最长时长、最高评分）由 **CourseMap 代码计算**，不让 LLM 算事实 |
| get_learning_path | path_id? / goal? | 路径步骤 + 每步核心资源 |
| get_prerequisites | goal | 前置目标 + 前置技能 |
| get_source_evidence | resource_id | 来源/字段范围/核验/观测日期 |

## 安全（ADR-005）
- 模型生成的参数一律 **untrusted**：JSON Schema 之外再做服务端二次校验
  （类型/枚举/范围/数量上限/字符串截断）。
- 不 eval、不拼 SQL、不执行 shell/文件系统/任意 URL——工具是代码里的 switch，无动态执行面。
- 未知工具名直接拒绝；参数非对象拒绝；ID 接受 string/number（数据集整型 ID）。
- 工具结果截断（单条 ≤6000 字符）后回填到对话。

## 循环
`maxRounds`（默认 4）内：assistant(tool_calls) → tool(results) → …；
轮次用尽抛 `INVALID_MODEL_OUTPUT`，避免无限成本。

## Tests
A-06 系列（未知工具/参数数量/字符串参数/不存在 ID/预算越界/allowlist=6）、A-07（compare 统计）。

## Result
PASS。
