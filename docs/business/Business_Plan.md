# CourseMap · 学途 — Business Plan

> 状态：**规划文档**。v0.1 无支付、无账号、无任何已上线收费功能。
> 本计划用于明确长期方向与商业化红线，不构成任何已验证的商业结论。

## 1. Executive Summary

CourseMap（学途）要做「学习决策基础设施」：学习者从学习目标出发，
在一个地方完成资源发现、跨平台比较、路径规划与最终决策。
当前 v0.1 是教育领域原型，验证核心链路与数据治理框架。

## 2. Problem

资源不稀缺，**决策**稀缺：学什么、选哪个、适合自己基础吗、要多少时间多少钱、
先学什么后学什么、信息是否仍然有效、为什么推荐这个。
现有平台各自为政，信息口径不一且不可比。

## 3. Target User

第一阶段：18–30 岁大学生及青年学习者；数字技能与科研技能
（编程 / 数据分析 / 人工智能 / 科研方法 / 学术英语）。

## 4. Value Proposition

按学习目标找资源，而不是先找平台再翻课程。
可比、可解释、可核验（来源 / 观测日期 / 核验状态 / 样本量）。

## 5. Market Opportunity

在线学习供给持续增长且高度碎片化；「跨平台课程比较」与
「学习路径规划」长期缺乏独立、非广告驱动的玩家。
（v0.1 不做市场规模虚构，数字留待真实调研。）

## 6. Product

见 `docs/product/01_Product_Definition.md` 与 `04_Information_Architecture.md`。

## 7. Differentiation

1. Learning Goal 一级实体（而不是平台目录树）
2. 跨资源比较引擎（动态统计，缺失值诚实呈现）
3. Learning Path + Skill Graph
4. Source Provenance 作为一等公民
5. AI-ready：可解释的决策助手架构，AI 只是交互/推理层

## 8. Business Model（模块）

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| A. Consumer Free | Implemented（原型内） | 搜索 / 对比 / 路径 / 基础收藏永久免费 |
| B. CourseMap Pro | Planned | AI 顾问完整版 / 个性化路径 / 进度跟踪 / 技能差距 / 长期档案 |
| C. Provider Pro | Planned | Provider Claim / 更新直达 / Analytics / 需求趋势 / 对比洞察 |
| D. B2B Education Intelligence | Hypothesis | 高校 / 企业培训 / 教育机构聚合洞察 |
| E. Affiliate / Transaction | Hypothesis | 合法课程 Referral Commission（须披露） |
| F. Sponsored Resource | Planned | 必须显著标注 Sponsored；**Payment != Organic Ranking** |
| G. Data Intelligence | Hypothesis | 匿名聚合的学习需求趋势报告 |

## 9. Revenue Model

长期以 B（订阅）+ C（SaaS）为主干，E/F 为补充；
D/G 为数据资产变现的高阶形态。所有收入线都晚于「数据可信」这一前提成立。

## 10. Data Asset

结构化课程事实（费用观测历史 / 时长 / 难度 / 证书）+ 学习目标图谱 +
（未来）学习者成果数据。这是竞争对手最难复制的部分。

## 11. AI Strategy

AI = Interaction + Reasoning Layer；CourseMap Data = Evidence Layer。
结构化检索先行，LLM 解释层后置；所有推荐可溯源、可解释、带不确定性。

## 12. Competitive Moat

结构化学习数据 + 目标模型 + 学习图谱 + 比较引擎 + 溯源治理 +
未来学习者成果闭环——不是「用了 AI」。

## 13. Go-to-Market

校园社群 + 学习类内容渠道的自然流量；以「按目标找资源」的决策工具切入，
而非内容营销站。

## 14. Risk

见 `docs/product/13_Risk_Register.md`（数据时效 / 低样本误读 / AI 信任 /
商业化污染排序 / 合规采集）。

## 15. Roadmap

见 `docs/product/14_Roadmap.md`（v0.2 人工验证 → v0.3 真实数据试点 →
v0.4 后端 → v1.0 基础设施）。

## 16. Commercial Validation Plan

1. v0.2 人工可用性测试验证 MoT 与留存意愿（不伪造结果）。
2. v0.3 真实数据试点验证「可核验数据」的运营成本。
3. Provider 访谈（3–5 家）验证 C 模块付费意愿。
4. Pro 功能 waitlist 验证 B 模块需求。
