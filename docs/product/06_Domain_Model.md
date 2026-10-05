# 06 · 领域模型（Domain Model）

Schema 权威定义：`data/schema/entities-v0.1.json`。

## 实体清单（11 个核心实体）

| 实体 | 主键 | 说明 |
| --- | --- | --- |
| Subject | `subject_id` | 学科（编程 / 数据分析 / 人工智能 / 科研方法 / 学术英语） |
| Learning_Goal | `goal_id` | 学习目标，**一级实体**。含 recommended_level、related_skills、prerequisite_goals、next_goals、aliases |
| Skill | `skill_id` | 技能节点，含 `prerequisites`（构成 Skill Graph） |
| Provider | `provider_id` | 学习资源提供方（虚构 DEMO 机构），provider_type 受控 |
| Learning_Resource | `resource_id` | 学习资源（course / tutorial / book / open_course / learning_module） |
| Learning_Path | `path_id` | 学习路径（goal_ids + 有序步骤） |
| Learning_Path_Step | `step_id` | 路径步骤：path_id + step_order + skill_id/goal_id + resource_id |
| Review | `review_id` | 结构化学习评价，评价对象是 **Resource** 而非 Provider |
| Source | `source_id` | 数据来源（official_provider / university_site / open_education / editor_demo） |
| Resource_Source | 关系表 | resource_id ↔ source_id，带 field_scope / observed_at |
| Fee_History | `fee_id` | 费用观测（append-only）：resource_id + fee + currency + observed_at + source_id |

## 关键关系

```
Subject 1 ── n Learning_Goal
Learning_Goal n ── n Skill            (related_skill_ids)
Learning_Goal n ── n Learning_Goal    (prerequisite_goal_ids / next_goal_ids)
Skill n ── n Skill                    (prerequisites → Skill Graph)
Provider 1 ── n Learning_Resource
Learning_Goal n ── n Learning_Resource (learning_goal_ids)
Learning_Resource 1 ── n Review
Learning_Resource 1 ── n Fee_History（append-only 观测）
Learning_Resource n ── n Source       (经 Resource_Source)
Learning_Path 1 ── n Learning_Path_Step
```

## 治理字段（所有实体）

- `status`: draft / pending / **published**（前端只可见 published，级联生效）
- `data_class`: demo / real（demo 记录必须渲染不可隐藏的 DEMO 徽标）
- `verification_status`: unverified / editorial_verified / provider_confirmed
- `observed_at` / `updated_at`: 观测与更新时间（不使用「有效期」概念）

## 领域设计决定

1. **Learning Goal 是一级实体**：搜索、对比、路径都以 Goal 为主轴组织。
2. **Provider ≠ 质量**：Provider 页不合成任何评分，明确展示
   「Provider 级信息 ≠ Resource 级质量」。
3. **评分只属于 Resource**：聚合自该资源自身的 published 评价，显示样本量。
4. **费用是观测不是承诺**：Fee_History append-only，UI 显示观测日期与复检提示。
5. **Skill Graph 轻量实现**：JSON adjacency（prerequisites 数组），
   接口与关系表对齐，未来可平移到 Graph DB / 关系后端。
6. **v0.1 不合成总分**：Learning Fit Score 仅保留实验性接口位
   （`config.FIT_SCORE`，frozen=false / enabled=false）。
