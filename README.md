# CourseMap · 学途

**CourseMap（学途）** 是一个教育领域原型项目：**学习目标驱动的课程与学习资源智能决策平台**。

> 按学习目标找资源，而不是先找平台再翻课程。
> Find learning resources by goal, not by platform.

**Educational domain prototype.** 本仓库当前 Product 版本为 `CourseMap-v0.2-AI-Beta`，
UI 发布版本为 `UI V0.2 · Visual Upgrade`：
静态 JSON 数据驱动的动态前端 + 已部署的 AI 后端（Serverless Function），
用于验证「Learning Goal → Learning Resource → Comparison → Learning Path → Decision」
这条核心决策链路，不是产品最终形态。

## 版本口径

两套版本号**平行表达、互不覆盖**，唯一真源为 `js/config.js` 的 `APP`
（Footer 与「关于」页均引用该处，不得另行硬编码；`VERSION` 文件同步记录两行）：

| 口径 | 取值 | 含义 |
| --- | --- | --- |
| Product 版本 | `CourseMap-v0.2-AI-Beta` | AI 接入 / 数据 / 业务能力版本（AI-1 轮次定义，UI 升级不改变它） |
| UI Release | `UI V0.2 · Visual Upgrade` | 仅视觉 / 交互层的发布版本（commit `95513e6`，2026-10-07） |

后端 AI 服务另有一枚**独立**的运行时标记 `v0.3-Data1`（`/api/ai/health` 的 `meta.version`），
用于生产部署核验，与前端 Product / UI 版本无关。

**发布状态（2026-10-07，如实）**：`LOCAL UI UPGRADE COMPLETE · REMOTE DEPLOYMENT PENDING`
—— UI V0.2 已在本地提交（领先 `origin/master` 32 个 commit），**公网尚未更新**。

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
| AI 学习顾问 | `pages/advisor.html` | AI Beta · Real LLM（DeepSeek via server-side backend）｜后端不可用时优雅降级为规则引擎并明示 |
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

# Node 运行时测试（75 项核心断言）+ AI 测试（78 单元 + 10 路由 + 10 HTTP 集成）
npm test              # = runtime + AI unit + routing + integration
npm run test:ai-live  # Live DeepSeek 测试（仅当配置了 DEEPSEEK_API_KEY 才真实运行）

# 生产验证（对已部署后端 / 公网前端；开发机无法直连 vercel 时请在 CI 跑）
npm run verify:live   # 后端 64 项生产断言
npm run verify:e2e    # 真实浏览器 E2E 37 项（需 Chrome）

# 本地 AI 后端（无 Key 时 health 正常、advisor 诚实返回 NOT_CONFIGURED）
npm run dev:ai

# 浏览器冒烟（需先启动本地服务器 + Chrome）
node scripts/regression/browser_smoke.mjs
```

## AI 学习顾问（v0.2 AI-Beta）

- **Powered by DeepSeek API（服务端代理）**：浏览器只与 CourseMap AI Backend 通信，
  DeepSeek API Key 仅存在于服务端环境变量 / 平台 Secret，前端与 Git 仓库零密钥。
  此为技术集成说明，不代表与 DeepSeek 官方有任何合作关系。
- **已部署**：AI Backend 运行于 Vercel（`https://coursemap-prototype.vercel.app`），
  前端 `js/config.js` 的 `AI.aiBackendBase` 指向该稳定地址。
  架构：GitHub Pages 前端 → Vercel AI Backend → CourseMap 检索 → DeepSeek API → 接地回答。
- **AI recommendations are grounded in CourseMap data where applicable**：
  推荐必须绑定真实存在的 resource_id（前后端双重代码级校验），
  费用/时长/评分/证书/来源等事实一律由 CourseMap 数据渲染，模型只负责理解与解释。
- **优雅降级**：AI 后端不可用或未配置密钥时，前端自动切换为规则原型（Rule-based
  Prototype · Not LLM），课程搜索、对比、学习路径等核心功能完全不依赖 AI。
- 架构与部署详见 `docs/ai-integration/`（Master Log + 20 篇模块文档 + 8 篇 ADR）；
  生产验证流水线见 `.github/workflows/live-verify.yml`。
- **验证状态（如实）**：本地等价验证 后端 64/64、浏览器 37/37 全通过；
  真实生产首轮验证暴露 4 处缺陷（已修），生产再验证待修复推送后由 CI 出证据
  —— 详见 `docs/ai-integration/19_AI1_Final_Report.md`。

## 原型边界（务必阅读）

- 全部课程/提供方/评价数据均为 **DEMO（演示数据）**，页面显著标注——**即使 AI 是真的，数据也可能是 Demo**（REAL LLM + DEMO DATA 同时明示）。
- 评价与收藏为 **Local Prototype**：仅存 localStorage，无账号、无云同步。
- AI 学习顾问为 **AI Beta（双引擎）**：已配置 AI 后端 + 密钥时走 DeepSeek 服务端代理管线；
  否则自动降级为规则原型（Rule-based Prototype · Not LLM）并明示。
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
