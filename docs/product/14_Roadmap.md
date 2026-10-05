# 14 · 路线图（Roadmap）

## v0.1 Prototype（当前，已完成）

- 教育领域完整重构（DishMap → CourseMap）
- 目标驱动搜索 + 12 维筛选 + 同目标对比 + 学习路径 + 资源详情
- 结构化本地评价 / 本地收藏（Local Prototype）
- AI 学习顾问 Preview（Rule-based，LLM Adapter 接口位）
- 数据治理（Source / 观测 / 核验 / DEMO 披露）+ 校验器
- 测试体系（75 项 Node 断言 + 16 目标浏览器冒烟）
- 公网部署（GitHub Pages）+ 公网冒烟

## v0.2 — Human Product Validation（下一步）

- 真人可用性测试（目标：18–30 岁学生 5–8 人）
  - MoT #1–#6 的人工验证（不伪造结果）
  - 搜索词与 Quick Goals 的真实命中率
- 反馈驱动的信息架构与文案修正

## v0.3 — Real Data Pilot

- 接入 5–10 个官方来源的真实课程（official_provider / university_site）
- 真实数据走 `data_class=real` + 完整 Source Provenance
- 费用人工观测流程 SOP（记录 URL / 日期 / 字段范围）

## v0.4 — Backend Ready

- Repository/Adapter 替换为 REST API（数据访问已抽象，UI 无需重写）
- 账号体系 + 云同步收藏/评价（替换 Local Prototype）
- LLM Learning Advisor（后端代理持有密钥，结构化检索不变）

## v1.0 — Learning Decision Infrastructure

- 混合检索（结构化 + 向量）
- 学习成果反馈层（完成率 / 技能自评）
- Provider Pro / Sponsored（含红线：付费 ≠ 自然排序）
- 学习需求趋势报告（匿名聚合）
