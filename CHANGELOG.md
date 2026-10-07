# Changelog

## UI V0.2 · Visual Upgrade（2026-10-07）

> **Product 版本 `CourseMap-v0.2-AI-Beta`（不变）· UI Release `UI V0.2 · Visual Upgrade`**
> 本轮只做 UI / UX / 视觉 / 交互打磨，交付物是设计系统与页面表现层。
> 产品版本号不因 UI 轮次而变动，两套版本号**平行表达、互不覆盖**（见 README「版本口径」）。
> 基线 `85e9129` → UI commit `95513e6`。

### Added

- **Design System upgrade**：`css/variables.css` 令牌重调（Slate 底 + Trust Blue `#2563EB` +
  AI Violet `#7C3AED`），令牌**名称不变**、语义色（DEMO / REAL / 核验 / 许可）取值不变；
  新增视觉层 `css/upgrade.css`（最后加载、只覆盖视觉，不改任何 `data-*` 契约），13 个页面接入。
  建立 **DATA ≠ AI REASONING** 的视觉区分规则：AI 视觉语言（紫 sparkle / `badge--ai` /
  极淡渐变）只用于 Advisor、AI 建议、AI 路径；普通课程数据一律中性色。
- **Homepage redesign**：Hero 围绕「你想学什么」重建 —— AI badge + 双语 headline +
  中央 AI Goal Input（"What do you want to learn?"）+ Popular goals chips +
  Trusted sources 行（只列数据集中已核验的真实提供方）+ 原四条件检索降级为次级区块。
- **Discover UI redesign**：sticky 筛选栏（8 组条件）、Sort by 条、结果头部 `aria-live` region、
  等高卡片网格、移动端筛选抽屉（backdrop + Esc / 点击关闭）。
- **Resource Card redesign**：Provider / 资源名 / 两行描述 / tags / metadata 层级化，
  底部 `View course →` + `Add to compare`；卡片高度趋于一致。
- **Course Detail redesign**：由介绍页改为「学习决策页」—— 右侧 sticky 决策面板
  （Provider / Level / Duration / Language / Cost / Certificate / Last verified）+
  Why CourseMap recommends + Suitable for + Source & Verification 核验卡。
- **Compare redesign**：顶部统计卡行 + 可横向滚动的对比表（best 值高亮）+
  底部「起点建议」AI 面板，与数据表**视觉强分离**。
- **AI Advisor redesign**：结构化输入（Goal / Current level / Time / Target duration /
  Budget / Language）+ 自然语言补充；AI thinking 状态；输出分段
  （约束解析 / 推荐资源 / 学习序列 / 建议 / 不确定性 / 证据）。
- **Learning Path redesign（重构幅度最大）**：垂直 roadmap 时间线 —— 阶段序号圆点 +
  标题 + 技能/目标 tag + 时长 + 阶段目标 + 核心资源卡 + 可选资源 disclosure +
  **Not started / In progress / Completed** 状态控件（本机 localStorage 持久化，可一键清除）。
  新增 `STORAGE_KEYS.pathProgress`（UI 层专用：不进数据集、不上传服务器、不建立用户画像）。
  诚实性约束：阶段周数仅在资源**同时标注时长与每周投入**时按 `时长 ÷ 每周投入` 估算并显式
  标注「估算」，未标注字段不计入、**不按 0 处理**；阶段目标直接引用数据 `step.description`
  （数据无 milestone 字段，不虚构）。
- **Responsive improvements**：1440 / 1024 / 768 / 390 四档；Discover 侧栏 → 抽屉、
  Compare 表横向滚动（`min-width:720px`）、Learning Path 移动端单列时间线、
  ≤430 按钮/输入/chip 命中区 44px；冒烟在 390×844 视口断言无横向溢出。
- **Accessibility improvements**：全局 `:focus-visible` 2px 高对比焦点环；
  主按钮/控件/导航链接命中区 ≥44px；修复 `status-pill` 对比度
  （muted on surface-3 ≈4.3:1 → text-soft）；搜索结果头部新增 `aria-live="polite"`；
  阶段状态控件 `role="group"` + `aria-pressed`；`prefers-reduced-motion` 下动效归零。
- **Micro-interactions**：卡片/按钮 hover、筛选过渡、loading skeleton、AI thinking 状态、
  路径生成动效；统一 150–250ms 三档 token，无复杂动画。
- 顺手修复两处存量缺陷：资源卡提供方链接被整体 `esc()` 转义成可见 HTML；
  `.badge--primary` 被引用但从未定义样式。

### Unchanged（本轮明确未改变）

- **AI API contract 未改变**：`POST /api/ai/advisor` 与 `GET /api/ai/health` 的请求/响应结构原样；
  顾问页结构化输入在提交时仍只产出**一个 `text` 参数**（前端拼装，契约不变）。
- **核心 data schema 未改变**：`data/`（11 张实体表 + `data/schema/`）一行未动，
  `git diff 85e9129..95513e6 -- data api server` 为空。
- 未删除真实课程数据、未修改 course ID、未把真实 AI 改成 mock、未删除 fallback mode；
  Compare / Learning Path / 搜索 / DeepSeek integration 全部保持可用。

### Verified

- 8 个测试套件 **395 PASS / 0 FAIL**（runtime 86 / ai-unit 81 / data1 72 / oer 88 /
  model-output 33 / featured-oer 15 / routing 10 / integration 10）。
- CDP 浏览器冒烟 **18/18 PASS**（13 页面 18 目标；0 未处理异常、0 失败请求；
  仅 Advisor 探测生产后端的白名单 CORS 噪声）。
- `docs/evidence/screenshots/01–18` 与 `docs/evidence/browser-smoke.json` 全部重新生成。

### Status

- **LOCAL UI UPGRADE COMPLETE**
- **REMOTE DEPLOYMENT PENDING** —— 本地领先 `origin/master` 32 个 commit；本机 push 不可用
  （出网代理不为 `git-receive-pack` 建隧道），**公网目前仍是升级前版本**。
  需在有正常出网的环境执行 `git -c http.sslBackend=openssl push origin master`。

## CourseMap-v0.2-AI-Beta · Production Activation（2026-10-06，ai-20 / ai-21）

后端完成人工部署授权（Vercel + `DEEPSEEK_API_KEY` Secret）后，
把「真实生产验证」做成了可复跑、可审计的流水线，并据此发现并修复了 4 处真实缺陷。

### Added

- **生产验证脚本**：
  - `scripts/verify/live_public_verify.mjs` — 后端 64 项断言（部署/配置、3 个用户场景、
    Fact Hydration、Source Binding、Learning Path、Multi-turn、No Matching、Invalid Input、
    Hallucination、Prompt Injection、Rate Limit）；输出 `30_*` 证据。
  - `scripts/verify/public_e2e.mjs` — 真实 Chrome（CDP）37 项断言，访问公网前端，
    断言 REAL LLM 模式、推荐接地、DOM 层事实绑定、Graceful Fallback 保留；输出 `31_*` 证据。
  - `scripts/verify/deepseek_shadow.mjs` — 本地 DeepSeek 测试替身（走完整 HTTP + OpenAI 兼容协议，
    故意返回错误 fee/rating 以验证 Fact Hydration）。
  - `scripts/verify/wait_for_deploy.mjs` — **部署闸门**：轮询 `meta.build` 直到本次提交的部署生效。
- **CI 流水线** `.github/workflows/live-verify.yml`：`public-e2e` / `backend-verify` /
  `publish-evidence`（证据自动回写 master）。
- `tests/ai/routing.test.mjs` — 断言「本地路由 == 生产路由」，防 Serverless 文件系统路由漏文件。
- `/api/ai/health` 增加 `meta.build` 部署指纹（`VERCEL_GIT_COMMIT_SHA` / `VERCEL_DEPLOYMENT_ID`）。

### Fixed（4 处真实生产缺陷）

1. **Serverless 路由缺文件**：生产 `GET /api/ai/health` 404（本地正常）→ 前端探测恒失败 → 静默降级。
   补 `api/ai/health.js`。
2. **难度/语言硬过滤**：单细胞目标只有 advanced 资源 → 0 候选 → 合法请求被判 NO_MATCHING_RESOURCE。
   改为软偏好排序（预算/时长仍硬约束），检索返回 `relaxations`。
3. **`getLearningPath` 严格 `===` 比较 id**：`path_id` 为字符串时返回 0 步 → 学习路径静默为空。
   全 Repository id 比较规范化；`path_ref` 改用 `asId()`。
4. **目标名匹配过于脆弱**（首轮 CI 暴露，影响最大）：真实 DeepSeek 把目标改写成自然措辞
   （`Python 编程入门` / `Python数据分析` / `单细胞分析`）→ 3 个用户场景全部退化为
   NO_MATCHING_RESOURCE。`findGoalByName` 改 3 级匹配（精确 → 双向包含（ASCII 词边界保护）
   → Dice 0.6，含 CJK 一方优先）；Stage A 提示词枚举规范目标清单（模型「选择」而非「创造」）。

### Fixed（验证工具自身）

- 测试替身在 Stage A 会正则扫整段提示词，命中目标清单里的 `单细胞 RNA-seq 入门`，
  导致本地把 3 个场景全部误判为该目标（假失败）。改为先切出 `User message:` 段再推断。
- `backend-verify` 改为 `if: always()`：前端回归失败不再掩盖后端证据。

### Verified

- 首轮真实生产 E2E（`51d9537`）：**25 PASS / 10 FAIL**（如实记录失败）。
- 修复后本地等价验证：后端 **64/64**、浏览器 E2E **37/37**；
  核心回归 75、AI 单元 78、路由 10、集成 10 全 PASS；数据 BLOCKER 0 / ERROR 0；Secret 扫描 0（150 文件）。

### Honest Status

- 生产首轮验证**未通过**并已定位根因；修复已完成并本地全量验证通过。
- **判定 Production Activation COMPLETE 仍需**：修复推送 → Vercel redeploy →
  CI `live-verify` 同时通过 `public-e2e` 与 `backend-verify` 并产出 `30_*` / `31_*` 证据。

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

- 工程闭环 COMPLETE；当时的 **Real DeepSeek Call 未经真实 Key 验证**（当时环境无密钥），
  状态 = ENGINEERING COMPLETE · WAITING FOR DEEPSEEK_API_KEY / DEPLOYMENT AUTHORIZATION。
  → 后续已由 **Production Activation**（见本文件顶部）完成部署与真实调用验证。
- 测试数量当时为 58 单元 / 10 集成；现已扩展为 78 单元 / 10 路由 / 10 集成。

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
