# 02 · 用户问题（User Problems）

## 核心问题

网络上并不缺学习资源，真正困难的是学习者不知道：

1. **应该学什么？** —— 目标本身不清晰（「想搞数据分析」从哪开始？）
2. **应该选什么课程？** —— 同一目标下有大量资源，选择成本高
3. **哪个资源更适合我的基础？** —— 零基础和有经验的人适合的资源不同
4. **需要多少时间？** —— 总时长与每周投入决定可行性
5. **需要多少钱？** —— 免费与付费差异巨大
6. **先学什么、后学什么？** —— 前置关系不透明
7. **不同平台的资源如何比较？** —— 信息分散在各平台，口径不一
8. **信息是否仍然有效？** —— 价格、内容会过期，观测时间常常不可见
9. **为什么系统推荐这个资源？** —— 推荐缺乏解释与证据

## 问题 → 产品能力的映射

| 用户问题 | CourseMap 能力 |
| --- | --- |
| 应该学什么 | Learning Goal 一级实体 + Quick Goals + Skill Graph |
| 选什么课程 | 资源级搜索 + 12 维筛选 |
| 适合我的基础 | difficulty + prerequisites + recommended_level |
| 多少时间 | duration_hours + weekly_workload_hours |
| 多少钱 | fee + fee_history（观测日期可见） |
| 先后顺序 | Learning Path + prerequisite 图 |
| 跨平台比较 | 同目标对比引擎（费用/时长/难度/评分） |
| 信息有效性 | observed_at / updated_at / verification_status / 复检提示 |
| 为什么推荐 | 可解释推荐 + source_refs + uncertainty（AI Preview） |

## 新的「关键时刻」（Moments of Truth）

- MoT #1：进入首页立即理解「按学习目标找资源」。
- MoT #2：搜索「Python 入门」返回**学习资源**而不是平台列表。
- MoT #3：可比较同一目标下多个资源的费用/时长/难度/评分/证书。
- MoT #4：资源详情能回答核心学习决策问题。
- MoT #5：能从目标进入学习路径。
- MoT #6：AI 学习顾问 Preview 能接受自然语言、解析约束、调用结构化数据、
  返回可解释的原型推荐（且明确标注非 LLM）。

上述 MoT 在 `tests/runtime.test.mjs` 与 `scripts/regression/browser_smoke.mjs`
中自动验证。
