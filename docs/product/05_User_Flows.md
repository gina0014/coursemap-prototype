# 05 · 用户流程（User Flows）

## Flow A：目标驱动发现（主流程）

```
首页 Quick Goals「Python 入门」
  → 找课程页（goal=1，URL 可分享）
  → 结果卡片：标题 / 提供方 / 难度 / 费用 / 时长 / 语言 / 评分+样本 / 证书 / DEMO 标注
  → 继续筛选（预算 / 难度 / 每周时间 / 语言 / 证书…）
  → 资源详情（15 个决策问题）
  → 「和同类比一比」→ 同目标对比（动态统计）
  → 收藏（Local Prototype）
  → 决策
```

## Flow B：关键词搜索

```
首页搜索框输入「python 数据分析」
  → 找课程页 q=…（归一化匹配标题 / 描述 / 别名 / 技能）
  → 结果为空 → 放松建议（budget / freeOnly / goal / subject / difficulty / durationMax）
  → 命中 → 同 Flow A
```

## Flow C：学习路径

```
学习路径总览（7 条 Demo 路径，覆盖目标标签）
  → 路径详情：SVG 总览 + 分步（每步：技能 → 推荐资源 + 费用/时长/难度）
  → 资源详情 → 收藏
```

## Flow D：同目标比较

```
搜索结果 / 资源详情 → 「和同类比一比」
  → compare.html?goal=N
  → 统计条（资源数 / 最低费用 / 最高费用 / 费用差 / 最短时长 / 最长时长 / 最高评分）
  → 表格视图 / 卡片视图（view=table|cards，偏好本地记忆）
  → 缺失值显示 —（不是 0）；费用未知资源不参与 min/max
```

## Flow E：AI 学习顾问（Prototype）

```
advisor.html：自然语言输入
  「我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。」
  → 规则解析器抽取：goal / current_level / budget / available_hours_per_week
  → 调用 CourseMap 结构化数据检索与排序（难度匹配 → 预算 → 负荷 → 评分）
  → LearningDecisionResponse：推荐资源 + 推理摘要 + 证据 + 不确定性 + 备选
  → 全程展示解析笔记与 Prototype / Not LLM-powered 标注
```

## Flow F：本地评价与收藏

```
资源详情 → 写一条本地学习评价（Local Prototype）
  → 结构化维度：overall / content_quality / difficulty_match /
     practical_value / workload_accuracy / would_recommend /
     completion_status / learning_tags / 可选评论
  → 仅保存在浏览器 localStorage，与全局评分严格分离，不伪装云端提交
```

## 错误流

- 资源 / 路径 / 提供方不存在 → 明确的 notfound 态（非白屏）。
- 数据加载失败 → error 态 + 指引（需本地 HTTP 服务器）。
- localStorage 不可用 → 明确提示，不静默失败。
