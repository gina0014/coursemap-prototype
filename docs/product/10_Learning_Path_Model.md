# 10 · 学习路径模型（Learning Path Model）

## 概念

旧 DishMap 的核心概念是「地理地图」（商圈 → 餐厅 → 菜品）。教育领域重塑后，
空间维度的对应物不是「课程地图」，而是**学习路径（Learning Path）**：
把「先学什么、后学什么」显式化。

## 结构

```
Learning Path（如：Python 数据分析入门路径）
 ├── goal_ids: 覆盖的学习目标
 └── steps: Learning_Path_Step（step_order 严格递增）
       ├── skill_id   本步要掌握的技能
       ├── goal_id    本步关联的目标（可选）
       └── resource_id 本步推荐的具体学习资源（带费用/时长/难度）
```

## 页面呈现

- **总览页（paths.html）**：全部路径卡片（名称 / 描述 / 目标标签 / 步数 / 总资源数）。
- **详情页（path.html?id=）**：
  - SVG 总览：步骤节点连线（轻量、无第三方库、可降级为顺序列表）。
  - 分步明细：每步 = 技能名 + 推荐资源卡（费用 / 时长 / 难度 / 证书 / DEMO 标注）
    + 资源详情与收藏入口。

## 与 Skill Graph 的关系

Skill Graph（`skills.json` 的 prerequisites adjacency）是路径的**知识层依据**：
路径步骤的先后顺序必须与技能前置关系一致（校验器对成环做 BLOCKER 检查 VR-C06；
运行时 `skillPrerequisiteChain` 会展开前置链展示「为什么先学这个」）。

## 设计约束

1. 步骤引用的实体必须存在（VR-C07）。
2. 同一路径内 step_order 不重复（VR-E05）。
3. 每步资源与全站一样受 DEMO 披露 / 费用观测 / 评分样本规则约束。
4. 路径是**编辑策展**的产物，不假装是个性化算法输出（AI 个别化路径属于
   CourseMap Pro 的未来能力，见 Business Plan）。

## 当前数据

7 条 Demo 路径、25 个步骤，覆盖 Python / 数据分析 / 人工智能 / 科研统计 /
学术英语等目标链。全部 `data_class=demo`。
