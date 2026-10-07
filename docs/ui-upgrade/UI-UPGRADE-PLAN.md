# CourseMap UI/UX Visual Upgrade · Plan（Step 2）

> 基线：`coursemap-prototype` @ `85e9129` · 版本 CourseMap-v0.2-AI-Beta
> 本文是升级前的实施计划；升级报告见 `UI-UPGRADE-REPORT.md`。

## 1. Step 1 审计结论

| 项目 | 现状 |
| --- | --- |
| 页面 | 13 个 HTML：首页 / 搜索 / 资源详情 / 提供方 / 对比 / 路径列表 / 路径详情 / 收藏 / 写评价 / AI 顾问 / 数据方法论 / 关于 / 404 |
| 渲染方式 | 除首页正文与 404/关于外，**页面主体由 JS 渲染**（`js/pages/*.js` 内置模板字符串） |
| 样式 | 5 个 CSS：`variables`(tokens) / `reset` / `layout` / `components`(921 行) / `pages`(605 行) / `responsive`(100 行) |
| 交互选择器 | **全部为 `data-*` 属性**（`data-page`、`data-filters`、`data-field`、`data-sort`、`data-results`、`data-advisor-*`、`data-coursemap-*` …），极少依赖 class → 视觉改造风险低 |
| 现有 tokens | 已有完整色板/字号/间距/圆角/阴影令牌，但取值是早期「纸感靛蓝」；缺 AI 强调色、缺字阶（36px 以上）、缺动效分级 |
| 硬约束（测试依赖） | `scripts/regression/browser_smoke.mjs` 对以下内容有断言：首页文案「今天想学什么 / 按学习目标找资源 / 找学习资源 / DEMO」、对比页 `[data-compare-count/min/max]`、精选区 `[data-coursemap-featured-card]` 6–8 张 + REAL 徽标 + 官方链接白名单 + `[data-coursemap-license-cell]` + `[data-coursemap-featured-fee]` + note 含「不按机构名气排序」、顾问页文案「Rule-based Prototype」、移动端无横向溢出 |
| 其他 | 395 项 Node 断言（含 UI 组件层 15 项）也会校验组件输出结构 |

**结论：视觉升级走「tokens 重设 + 新增 override 层 + 定点改渲染函数」，不重写业务逻辑。**

## 2. Step 3 设计令牌（`css/variables.css` 重设取值，令牌名不变）

| 令牌 | 旧值 | 新值 |
| --- | --- | --- |
| `--cm-bg` | #F8FAFD | **#F8FAFC** |
| `--cm-surface` | #FFFFFF | #FFFFFF |
| `--cm-border` | #D8E2EE | **#E2E8F0** |
| `--cm-text` | #1B2A3D | **#0F172A** |
| `--cm-text-muted` | #66798F | **#64748B** |
| `--cm-primary` | #2F5FD0 | **#2563EB** |
| `--cm-primary-strong` | #23479C | **#1D4ED8** |
| 新增 `--cm-ai` / `--cm-ai-soft` / `--cm-ai-border` | — | **#7C3AED** / #F5F3FF / #DDD6FE |
| 新增 `--cm-success` / `--cm-warning` | — | **#16A34A** / **#F59E0B** |
| 字阶 | 最大 36px | 新增 `--cm-fs-hero: 3.25rem`（52px）+ 收紧 3xl=40px |
| 动效 | 120/200ms | **150–250ms** 三档（`--cm-t-fast/base/slow`），保留 `prefers-reduced-motion` |

保留语义色（费用/核验/DEMO/实验性）不变 —— 颜色是数据治理语义，不得为了美观改动。

## 3. Step 4 全局组件（`css/upgrade.css` 新增层 + `components.js` 定点修改）

| 组件 | 改动 | 风险控制 |
| --- | --- | --- |
| Header | 主纳 `Discover / Learning Paths / AI Advisor / About` + 右侧 `Search / GitHub / Get Started`；sticky + 半透明白底 + 细底边；active 用下划线指示条 | 保留 `<nav>` 元素与全部链接（冒烟计数 `nav a`），保留 `data-nav-toggle` 折叠 |
| Footer | 结构不变，改用新 token 与间距 | 不动选择器 |
| Demo/REAL 横幅 | 视觉降噪（去掉重底色，改为细边 + 中性底） | **保留 tag 文案与 `data-coursemap-banner`** |
| Buttons | 统一高度 40/44px、hover 位移 0、focable ring 一致 | 类名不变 |
| Badges | 统一 11px/600、语义色保留；新增 `.badge--ai`（紫） | 语义徽标文字不变 |
| Resource card | 等高化（flex 列 + 动作区贴底）、hover 抬起 2px、metadata 行统一 | 保留 `.resource-card`、`data-coursemap-card`、全部 `data-coursemap-*` 子节点 |
| Skeleton / State | 统一圆角与节奏 | 保留 `data-coursemap-state` |

## 4. Step 5–10 页面

| Step | 页面 | 关键改动 | 保留项 |
| --- | --- | --- | --- |
| 5 | Home | Hero 改为「Badge + 双语 Headline + 副标题 + 大号 AI 目标输入（提交 → 顾问页 `?goal=`）+ 热门目标 chips + 受信来源行」；原筛选表单保留为其下「按条件浏览」区块 | 首页 4 条 mustContain 文案全部保留 |
| 6 | Discover(search) | 结果头 + 排序条 + 左筛选栏（sticky）+ 卡片等高；移动端筛选改为抽屉（新增 `data-filter-drawer` 与按钮，不动 `data-filters` 内容） | `data-filters / data-sort / data-results / data-result-header / data-pager` |
| 7 | Resource detail | 顶部 Provider/标题/徽标/CTA 三连；主体分栏 + 右侧 sticky 决策面板（提供方/难度/时长/语言/费用/证书/最后核验）；新增「为什么推荐给你」（数据推导）+「来源与核验」区块 | 15 问对应 section 全保留（含 `data-coursemap-section` 值）、`data-coursemap-official-link`、来源与许可渲染 |
| 8 | Compare | 表头列卡化 + 行分组；新增底部「起点建议」块（**由 CourseMap 数据推导**，视觉与数据表分离，并明确标注非 LLM）+ 「让 AI 顾问给出理由 →」链接 | `[data-compare-count/min/max/spread]`、`data-cmp-view`、`data-compare-body` |
| 9 | Advisor | 结构化输入（目标/当前水平/每周时间/周期/预算/语言）→ 组合为自然语言后调用同一 `askAdvisor(text)`；输出拆分为 Understanding / Skills / Recommended / Sequence / Why / Alternative 分区 | **API 契约不变**、双引擎不变、降级分支不变、`Rule-based Prototype` 文案保留、`data-advisor-*` 全保留 |
| 10 | Learning Path | 路径详情改为垂直 roadmap：Stage 卡（序号/周次/资源/产出/Milestone/状态）+ 顶部汇总（stages/weeks/resources） | `data-coursemap-path-card`、`data-page`、路径数据结构不变 |

## 5. Step 11–12

- **Responsive**：1440 / 1024 / 768 / 390 四档；发现页筛选 768 以下转抽屉；对比表横向滚动（已有 `.cmp-scroll`）；路径单列时间线。
- **Accessibility**：焦点环统一 2px `--cm-focus`；交互元素 ≥44px 命中区（导航/按钮/筛选）；AI 区块加 `aria-label`；颜色不作唯一信息载体（沿用现有纪律）。

## 6. Step 13 回归策略

1. `npm test`（395 断言，含 UI 组件 15 项）
2. `npm run validate`（数据校验，应仍 BLOCKER 0 / ERROR 0）
3. `node scripts/regression/browser_smoke.mjs`（18 目标 / 浏览器层断言 + 截图）
4. 手动核对：控制台 0 error、无 404 资源、键盘可达、四档视口无横向溢出

## 7. 明确不做（避免破坏现有系统）

不改 JSON schema / 不改 resource_id / 不改 AI API 契约 / 不把真实 AI 换 mock / 不删 fallback / 不删 DEMO 数据 / 不动 `word_prep` 之外无关目录。
