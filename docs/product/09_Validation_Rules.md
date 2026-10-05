# 09 · 校验规则（Validation Rules）

权威定义：`data/schema/validation-rules-v0.1.json`。
实现：`scripts/validate/validate_data.py`（退出码 0 = BLOCKER=0 且 ERROR=0）。

## BLOCKER（阻断发布）

| ID | 规则 |
| --- | --- |
| VR-C01 | 实体缺少 ID 或 ID 重复 |
| VR-C02 | Resource 引用不存在的 provider_id / subject_id |
| VR-C03 | Resource.learning_goal_ids 引用不存在的 goal_id |
| VR-C04 | published 资源缺少 title |
| VR-C05 | published 真实数据没有关联任何 Source |
| VR-C06 | Skill / Goal 前置关系成环 |
| VR-C07 | Path Step 引用不存在的 path_id / skill_id / goal_id / resource_id |
| VR-C08 | Review 引用不存在的 resource_id |
| VR-C09 | Fee_History 引用不存在的 resource_id / source_id |
| VR-C10 | demo 记录的 url 指向真实第三方页面 |

## ERROR（数据错误，必须为 0）

| ID | 规则 |
| --- | --- |
| VR-E01 | fee < 0 |
| VR-E02 | duration_hours / weekly_workload_hours ≤ 0 |
| VR-E03 | 评分字段不在 [1,5] |
| VR-E04 | difficulty / resource_type / learning_mode / language 不在受控枚举 |
| VR-E05 | 同一 path 内 step_order 重复 |
| VR-E06 | resource.rating 与已发布评价聚合偏差 > 0.01 |
| VR-E07 | resource.rating_count 与已发布评价条数不一致 |
| VR-E08 | fee=null 但 currency 非空 |
| VR-E09 | published 资源 learning_goal_ids 为空 |

## WARN（提示，允许存在）

| ID | 规则 |
| --- | --- |
| VR-W01 | 费用观测超过 fee_recheck_days（180 天）→ 触发复检提示 |
| VR-W02 | 评价样本 < rating_min_sample（3）→ 前端显示 Limited data |
| VR-W03 | published 资源缺少可选前置 |
| VR-W04 | 缺少 duration_hours / weekly_workload_hours |
| VR-W05 | certificate_available = null |

## 当前状态

`python scripts/validate/validate_data.py` →
**BLOCKER: 0  ERROR: 0  WARN: 25（PASS）**。
WARN 均为低样本评价与缺失可选字段提示，用于验证 Limited data / — 展示链路。
