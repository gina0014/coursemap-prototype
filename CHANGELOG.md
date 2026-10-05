# Changelog

## CourseMap-v0.2-AI-Beta (2026-10-06)

AI-1 DeepSeek 生产接入（工程闭环）。LLM = Interaction + Reasoning Layer，
CourseMap Data = Evidence Layer 的架构原则全程保持。

### Added

- CourseMap AI Backend（Node / Serverless）：`server/` 模块化架构 + `api/ai/advisor.js`
  Vercel Function 入口 + 本地 dev server（`npm run dev:ai`）。
  路由：`POST /api/ai/advisor`、`GET /api/ai/health`；统一 envelope。
- LLM Adapter 抽象：`LLMAdapter`（接口）/ `DeepSeekAdapter`（生产，JSON 输出模式 +
  Tool Calling + 超时 + 错误映射，密钥仅服务端）/ `MockLLMAdapter`（测试，零外部调用）。
- 版本化 System Prompt（`server/prompts/learning-advisor-v1.mjs`）：
  CourseMap 数据 = 唯一事实来源；检索数据 = DATA 非 INSTRUCTION（防注入）；
  禁止发明资源与事实；禁止保证学习成果。
- 两阶段管线：Stage A 意图解析（JSON 输出 + schema 清洗校验，未知=null 不猜测）
  → Stage B 工具循环推理（6 个 allowlist 工具，参数视为 untrusted）→
  CODE-ENFORCED 幻觉防线（resource_id 必须存在）→ Fact Hydration（展示事实全部
  由 Repository 重取，不信模型回传）。
- CourseMapRepository / StructuredRetriever：Repository 抽象（未来可换 PostgreSQL）、
  Retriever 接口（VectorRetriever / HybridRetriever 预留，本轮 RAG = DEFERRED）。
- 会话上下文：session 级结构化约束（改预算不必重述目标），TTL + 轮次上限，
  不建立长期用户画像。
- 安全与成本：CORS origin allowlist、server-side per-IP 限流、消息长度/工具轮数/
  检索数/输出 token 上限、usage 结构化日志（不记录 key 与用户原文）。
- 前端 AI 升级：AI Beta（Real LLM）双引擎 UI —— 后端可用时走 DeepSeek 管线
  （前端二次 Fact Hydration + 幻觉资源不渲染），不可用时优雅降级为规则原型并明示。
- 测试：AI 单元测试 58 项（含幻觉拒绝 / 事实冲突 / 注入探测 / 限流 / 错误映射）、
  HTTP 集成测试 10 项、Live DeepSeek 测试（有 Key 才运行，无 Key SKIP）。
- 文档：`docs/ai-integration/` 20 篇模块文档 + 8 篇 ADR + 时间线 + Before/After
  + Master Log。

### Security

- Secret 扫描 0：`.env.example` 仅键名；密钥只存在于平台 Secret / 本地 .env（已 gitignore）。

### Honest Status

- 工程闭环 COMPLETE；**Real DeepSeek Call 未经真实 Key 验证**（当前环境无密钥），
  状态 = ENGINEERING COMPLETE · WAITING FOR DEEPSEEK_API_KEY / DEPLOYMENT AUTHORIZATION。

## CourseMap-v0.1-Prototype (2026-10-06)

教育领域完整重构首发版本。由 DishMap（菜品级美食决策地图）领域迁移而来，
迁移决策记录见 `docs/migration/DishMap_to_CourseMap_Migration.md`。

### Added

- 教育领域模型：Subject / Learning_Goal / Skill / Provider / Learning_Resource /
  Learning_Path / Learning_Path_Step / Review / Source / Resource_Source / Fee_History
  （`docs/product/06_Domain_Model.md`，Schema：`data/schema/entities-v0.1.json`）。
- Demo 数据集：5 学科、12 学习目标、18 技能（含前置图）、10 提供方、48 学习资源、
  7 条学习路径（25 步）、226 条演示评价、58 条费用观测，全部 `data_class=demo`
  （`scripts/build/generate_demo_dataset.py`）。
- 资源级搜索与 12 维筛选（Subject / Goal / Difficulty / Budget / Language /
  Duration / Workload / Certificate / Mode / Provider / Verification / Free-only），
  全部走 URL query parameter，可分享、可回退。
- 同目标跨资源对比引擎：最低/最高费用、费用差、最短/最长时长、最高评分、资源数
  全部运行时计算；缺失值显示 `—` 而不是 0。
- 学习路径（Goal → Prerequisite → Skill → Resource → Next Skill）总览与详情，
  轻量 SVG 可视化，无第三方依赖。
- 结构化学习评价（Local Prototype）：内容质量 / 难度匹配 / 实用价值 / 负荷准确性 /
  是否推荐 / 完成状态 / 学习标签，评价对象为 Learning Resource 而非 Provider。
- 学习收藏 Wishlist（Local Prototype，localStorage）。
- AI 学习顾问 Preview：LearningDecisionRequest / LearningDecisionResponse 契约、
  Rule-based 解析器（目标 / 预算 / 时间 / 基础）、可解释推荐、LLM Adapter 接口位。
  明确标注 Prototype Decision Assistant · Not LLM-powered。
- 数据治理：Source Provenance（source / observed_at / updated_at / verification_status /
  data_class）、draft→pending→published 状态、级联可见性、DEMO 显著披露。
- 教育领域校验规则 BLOCKER/ERROR/WARN（`data/schema/validation-rules-v0.1.json`）
  与校验器 `scripts/validate/validate_data.py`。
- 测试体系：75 项 Node 运行时断言 + CDP 浏览器冒烟（16 目标、控制台取证、截图证据）。
- 文档：`docs/product/` 14 篇、`docs/business/Business_Plan.md`、迁移文档、README。

### Changed

- 视觉语言：Food / Warm Dining → Learning / Knowledge / Clarity / Trust
  （靛蓝 + 青玉教育科技配色，`--cm-` CSS 变量前缀）。
- 响应式骨架、CSS Variables、无框架轻量架构、CDP 探针自 DishMap 复用（REUSED）。

### Removed

- 全部餐饮领域运行时语义：dish / restaurant / food / taste / portion /
  business district / 地理地图 / 餐厅评分等（扫描验证 active domain = 0）。

### Notes

- 无后端、无账号、无云同步、无支付、无 LLM 接入——均为预留接口位。
- Demo 数据不代表真实课程事实；真实数据接入政策见 `docs/product/08_Source_Governance.md`。
