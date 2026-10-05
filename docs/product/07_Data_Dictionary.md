# 07 · 数据字典（Data Dictionary）

权威 Schema：`data/schema/entities-v0.1.json`；数据文件：`data/*.json`（11 张表）。

## Learning_Resource（核心实体）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| resource_id | int | 主键 |
| title | string | 资源标题（published 必填） |
| provider_id | int | → Provider |
| subject_id | int | → Subject |
| learning_goal_ids | int[] | → Learning_Goal（published 资源不得为空） |
| skill_ids | int[] | → Skill（学到的技能） |
| prerequisite_skill_ids | int[] | → Skill（先修，可空） |
| resource_type | enum | course / tutorial / book / open_course / learning_module |
| difficulty | enum | beginner / intermediate / advanced |
| language | enum | zh / en / bilingual |
| fee | number\|null | 当前已知费用（null = 未知，UI 显示 —） |
| currency | string\|null | fee 为 null 时必须为 null（VR-E08） |
| duration_hours | number\|null | 总时长估算 |
| weekly_workload_hours | number\|null | 每周投入估算 |
| learning_mode | enum | self_paced / instructor_led / hybrid |
| certificate_available | bool\|null | null = 未知 |
| rating | number\|null | 聚合自资源自身 published 评价（VR-E06 校验一致性） |
| rating_count | int | 同上（VR-E07） |
| learning_outcomes | string[] | 能学到什么 |
| description | string | 资源描述 |
| url | string\|null | demo 记录不得指向真实第三方页面（VR-C10） |
| updated_at / observed_at | date | 更新 / 观测时间 |
| verification_status | enum | unverified / editorial_verified / provider_confirmed |
| data_class | enum | demo / real |
| status | enum | draft / pending / published |

## Learning_Goal

`goal_id`、`name`、`subject_id`、`description`、`recommended_level`、
`related_skill_ids`、`prerequisite_goal_ids`、`next_goal_ids`、`aliases`、
`status`、`data_class`。

## Skill

`skill_id`、`name`、`subject_id`、`prerequisites`（skill_id 数组，无环）、
`status`、`data_class`。

## Review

`review_id`、`resource_id`、`overall_rating` / `content_quality` /
`difficulty_match` / `practical_value` / `workload_accuracy`（1–5）、
`would_recommend`（bool）、`completion_status`（completed / in_progress /
dropped）、`learning_tags`（受控标签）、`comment`（可选）、`status`。

## Fee_History（append-only）

`fee_id`、`resource_id`、`fee`（number\|null，null 表示该次观测确认免费不可用）、
`currency`、`observed_at`、`source_id`、`verification_status`。
**不删除、不修改历史观测**；「当前费用」= 最新观测。

## Source / Resource_Source

Source：`source_id`、`name`、`source_type`（official_provider /
university_site / open_education / authorized_api / editor_demo）、
`usage_permission`、`url`、`notes`。
Resource_Source：`resource_id`、`source_id`、`field_scope`（该来源覆盖的字段）、
`observed_at`。

## 未知值约定

- 一律 `null`，UI 渲染为 `—`。
- 禁止用 0 冒充未知（费用 0 有明确语义 = 免费）。
- 禁止为字段完整而编造事实。
