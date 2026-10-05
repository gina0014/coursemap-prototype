# 01 · 产品定义（Product Definition）

- 产品名：**CourseMap**（中文产品名：**学途**）
- 版本：CourseMap-v0.1-Prototype
- 副标题：学习目标驱动的课程与学习资源智能决策平台
- 核心价值主张：**按学习目标找资源，而不是先找平台再翻课程。**
  英文：Find learning resources by goal, not by platform.

## 1. 一句话定义

CourseMap 帮助学习者从「我想学什么」出发，跨平台比较具体的学习资源，
并给出可解释的学习路径建议——它是一个 **学习决策基础设施（Learning Decision
Infrastructure）** 的原型。

## 2. 产品是什么 / 不是什么

**是：**

- Learning Resource Discovery（学习资源发现）
- Cross-platform Comparison（跨平台比较）
- Learning Path（学习路径）
- Decision Support（决策支持）
- Future AI Learning Advisor（未来的 AI 学习顾问，本轮为规则原型）

**不是：**

- 课程内容生产网站
- 普通课程目录
- 简单 MOOC 导航站
- 课程广告集合
- 单纯 AI Chatbot

## 3. 核心链路

```
User Goal
  ↓
Learning Goal（学习目标，一级实体）
  ↓
Learning Resource Discovery（资源级搜索）
  ↓
Filter（12 维筛选，URL 可分享）
  ↓
Cross-resource Comparison（同目标跨资源对比）
  ↓
Resource Detail（15 个决策问题的回答）
  ↓
Learning Path（先修 → 资源 → 下一步）
  ↓
Decision（学习者的决策）
```

## 4. 与旧领域（DishMap）的关系

CourseMap 由 DishMap（菜品级美食决策地图）经过 **领域重塑（domain remodeling）**
而来，不是机械换名。旧链路 `Dish → Restaurant → Price → Rating → Value → Distance`
被整体替换为 `Learning Goal → Learning Resource → Provider → Cost → Difficulty →
Duration → Quality → Learning Path → Evidence`。逐模块的 REUSE / REFACTOR /
REWRITE / DELETE 决策见 `docs/migration/DishMap_to_CourseMap_Migration.md`。

## 5. 第一阶段范围

- 用户：18–30 岁大学生及青年学习者。
- 领域：大学生数字技能与科研技能。
- 首批 Subject：编程 / 数据分析 / 人工智能 / 科研方法 / 学术英语。
- 明确不进入：K12 全学科、儿童教育、老年教育、全职业资格、全球教育领域。

## 6. 长期定位

Learning Decision Infrastructure：结构化学习数据 + 学习目标模型 + 学习图谱 +
跨资源比较 + 来源溯源 +（未来）学习者成果数据。AI / LLM 是交互与推理层，
**不是事实来源（Source of Truth）**。
