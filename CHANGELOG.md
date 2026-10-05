# Changelog

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
