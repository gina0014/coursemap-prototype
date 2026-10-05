# CourseMap · 学途

**CourseMap（学途）** 是一个教育领域原型项目：**学习目标驱动的课程与学习资源智能决策平台**。

> 按学习目标找资源，而不是先找平台再翻课程。
> Find learning resources by goal, not by platform.

**Educational domain prototype.** 本仓库当前版本为 `CourseMap-v0.1-Prototype`：
纯前端、静态 JSON 数据驱动的动态应用，用于验证「Learning Goal → Learning Resource →
Comparison → Learning Path → Decision」这条核心决策链路，不是产品最终形态。

## 它是什么 / 不是什么

CourseMap 是：Learning Resource Discovery + Cross-platform Comparison +
Learning Path + Decision Support + AI-ready Architecture。

CourseMap 不是：课程内容生产网站、普通课程目录、MOOC 导航站、课程广告集合、
单纯 Chatbot。

## 页面

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `index.html` | 按学习目标找资源（Hero + Quick Goals） |
| 找课程 | `pages/search.html` | 资源级搜索 + 12 维筛选（URL 参数可分享） |
| 资源详情 | `pages/resource.html?id=` | 回答 15 个核心学习决策问题 |
| 提供方详情 | `pages/provider.html?id=` | Provider 信息 ≠ 资源质量 |
| 同目标对比 | `pages/compare.html?goal=` | 费用/时长/难度/评分动态统计 |
| 学习路径 | `pages/paths.html`、`pages/path.html?id=` | Goal → Skill → Resource 可视化 |
| 收藏 | `pages/favorites.html` | Local Prototype（localStorage） |
| 写学习评价 | `pages/review.html?resource_id=` | 结构化评价，Local Prototype |
| AI 学习顾问 | `pages/advisor.html` | 规则原型（Not LLM-powered） |
| 数据方法论 | `pages/data-methodology.html` | 来源、核验与统计口径 |
| 关于 | `pages/about.html` | 原型声明 |
| 404 | `404.html` | 未找到 |

## 本地运行

```bash
# 任何静态服务器都可以，例如：
python -m http.server 8765
# 打开 http://127.0.0.1:8765
```

必须通过 HTTP 访问（ES Modules + fetch JSON 不支持 file://）。

## 数据与架构

- `data/*.json` — 11 张实体表（subjects / learning-goals / skills / providers /
  resources / learning-paths / learning-path-steps / reviews / fee-history /
  sources / resource-source），由 `scripts/build/generate_demo_dataset.py` 生成。
- `data/schema/` — 实体 Schema（v0.1）与 BLOCKER/ERROR/WARN 校验规则。
- `js/data-loader.js` — 数据访问唯一入口（级联可见性），未来可替换为 REST/GraphQL Adapter。
- `js/derive.js` — 派生计算单一真源（费用最新观测、评分聚合、对比统计、路径）。
- `js/ai-advisor.js` — LearningDecisionRequest/Response + 规则解析器 + LLM Adapter 接口位。

## 脚本

```bash
# 数据校验（BLOCKER/ERROR 必须为 0）
python scripts/validate/validate_data.py

# Node 运行时测试（75 项断言，覆盖搜索/筛选/对比/路径/AI 解析等）
node tests/runtime.test.mjs

# 浏览器冒烟（需先启动本地服务器 + Chrome）
node scripts/regression/browser_smoke.mjs
```

## 原型边界（务必阅读）

- 全部课程/提供方/评价数据均为 **DEMO（演示数据）**，页面显著标注。
- 评价与收藏为 **Local Prototype**：仅存 localStorage，无账号、无云同步。
- AI 学习顾问为 **规则原型（Not LLM-powered）**：解析目标/预算/时间后调用
  本地结构化数据给出可解释推荐；LLM Adapter 已预留但未接入。
- 任何未实现的能力都明确标记 Prototype / Reserved / Future，不假装完成。

## 文档

- `docs/product/` — 产品定义 / 用户问题 / 领域模型 / 数据字典 / AI 架构等 14 篇
- `docs/business/Business_Plan.md` — 商业模式（规划，未上线收费功能）
- `docs/migration/DishMap_to_CourseMap_Migration.md` — 从 DishMap 的领域迁移记录

## 来源

CourseMap 由 DishMap（菜品级美食决策地图）教育领域重构而来，迁移决策记录见
`docs/migration/`。原 DishMap 仓库与本仓库相互独立。

## License

MIT
