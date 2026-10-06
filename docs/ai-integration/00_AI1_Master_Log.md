# CourseMap AI-1 Master Log — DeepSeek Production Integration

> 记录原则：每完成一个模块立即追加（Module / Goal / Files Changed / Architecture Decision / Tests / Result / Known Issues / Git Commit）。禁止事后回忆补写。

---

## M0 Baseline

- **Module**: M0 Baseline
- **Goal**: 记录 AI 接入前的完整项目状态，保证可回滚、可对比。
- **Files Changed**: `docs/ai-integration/evidence/00_pre_ai_baseline.txt`（新增）
- **Architecture Decision**: 在任何代码改动前冻结基线；回归以 `tests/runtime.test.mjs`（75 PASS / 0 FAIL）+ 数据校验（BLOCKER 0）+ 公网冒烟（16/16）为基准线。
- **Tests**: 既有回归重跑确认 75/0。
- **Result**: PASS
- **Known Issues**: 公网 evidence commit `1271d04` 在基线时点因 GitHub 瞬时断连未推送（仅证据 JSON，不影响站点）。
- **Git Commit**: （基线不产生代码 commit，见 ai-01）

---

## M1 Architecture / M2 Backend

- **Module**: M1+M2
- **Goal**: 平台无关后端骨架：config/errors 单点、Repository、Retriever、Vercel 入口。
- **Files Changed**: server/{config,errors}.mjs、server/repo/*、server/retriever/*、api/ai/advisor.js、vercel.json、package.json
- **Architecture Decision**: ADR-001（必须有后端）/ ADR-008（Vercel 单函数）；handler 平台无关，dev-server 复用生产代码。
- **Tests**: 数据加载/检索手测 + 后续单测覆盖。
- **Result**: PASS
- **Known Issues**: 数据目录多候选解析（Vercel bundle 布局差异）。
- **Git Commit**: ab0b80a（ai-01）

---

## M4 DeepSeek Adapter / M3 Secret Security

- **Module**: M4+M3
- **Goal**: 可替换 LLM 适配层 + 密钥只进服务端。
- **Files Changed**: server/llm/{LLMAdapter,DeepSeekAdapter,MockLLMAdapter}.mjs、server/prompts/learning-advisor-v1.mjs、.env.example
- **Architecture Decision**: ADR-002；OpenAI 兼容 chat/completions；JSON 输出 + tool 协议；错误映射永不泄 key。
- **Tests**: A-13/A-14 系列；真实调用待 Live。
- **Result**: PASS（Live PENDING）
- **Git Commit**: 8202ce2（ai-02）

---

## M5-M13 Orchestrator 全链路

- **Module**: M5 意图解析 / M6 检索 / M7 工具 / M8 推荐编排 / M9 学习路径 / M11 会话 / M12 错误降级 / M13 限流成本
- **Files Changed**: server/orchestrator/*、server/tools/*、server/context/*、server/security/*、server/cost/*、server/httpHandler.mjs、server/dev-server.mjs、data/*（注入探针）、scripts/build/generate_demo_dataset.py
- **Architecture Decision**: ADR-003/004/005/007；幻觉防线 CODE-ENFORCED；事实水合 Repository>LLM；会话存结构化约束。
- **Tests**: unit 58 / integration 10 / core 75；修复整型 ID Map 键 bug。
- **Result**: PASS
- **Git Commit**: ae31920（ai-03..05）

---

## M10 Frontend AI Experience

- **Module**: M10
- **Goal**: AI Beta 双引擎 UI + 优雅降级 + REAL LLM/DEMO DATA 双披露。
- **Files Changed**: js/ai-client.js（新）、js/config.js、js/pages/advisor.js、pages/advisor.html、scripts/regression/browser_smoke.mjs（断言）
- **Architecture Decision**: 前端二次 Fact Hydration；未配置后端不发探测请求（消 404 噪音）；non-streaming 决策。
- **Tests**: 浏览器冒烟 16/16，Console/Exceptions/FailedRequests=0。
- **Result**: PASS
- **Git Commit**: ai-06..07

---

## M14 Testing

- **Module**: M14
- **Files Changed**: tests/ai/{unit,integration,live.deepseek}.test.mjs
- **Result**: unit 58 PASS / integration 10 PASS / live SKIP（无 Key）；核心 75 PASS。
- **Git Commit**: ai-09

---

## M15 Deployment / M16 Public E2E

- **Result（初版）**: 前端 v0.2 公网已上线；后端停在授权边界（Key + 平台账号）；7 Case E2E PENDING。
- **Git Commit**: ai-10（部署配置在 ai-01 已含）
- **Issue**: 推送后公网仍服务 v0.1 —— Pages 默认 Jekyll 构建失败，部署未推进。
- **Fix**: commit `f390fea` 在仓库根新增空 `.nojekyll`，关闭 Jekyll，原始静态树直出。
- **Re-verify（公网）**: HEAD `f390fea`；`VERSION` → `CourseMap-v0.2-AI-Beta`；`js/ai-client.js`
  （v0.1 不存在）返回 200；`.md` 原样返回（Jekyll 已禁用）。
- **Public smoke**: `COURSEMAP_BASE=https://gina0014.github.io/coursemap-prototype` →
  **16/16 PASS**，Console Errors 0 / Failed Requests 0 / Exceptions 0；17 张截图与本地逐像素一致。
- **Evidence**: docs/ai-integration/evidence/20_public_deploy_verification.txt
- **Result（终版）**: 前端公网部署 **VERIFIED**；后端 **NOT DEPLOYED**（按设计，等待 Key + 授权）。

---

## M17 Documentation / M18 Final Audit

- **Files Changed**: docs/ai-integration/**（本目录）、README.md、VERSION、CHANGELOG.md
- **Audit**: Secret 扫描 0（含 git 历史）；旧语义扫描 0；Global Library / DishMap UNCHANGED。
- **Result**: PASS
- **Git Commit**: ai-11

---

## M19 Production Activation（真实生产验证 + 缺陷修复）

- **Module**: M19
- **Goal**: 后端人工部署授权完成后，做真实生产验证（Frontend → Vercel → DeepSeek 全链路），
  并把验证本身沉淀为可复跑、可审计的流水线。
- **Files Changed**:
  - `api/ai/health.js`（新增路由文件）、`vercel.json`、`tests/ai/routing.test.mjs`（ai-20）
  - `scripts/verify/live_public_verify.mjs`（64 项后端断言）、`scripts/verify/public_e2e.mjs`（37 项浏览器断言）、
    `scripts/regression/cdp-client.mjs`、`scripts/verify/deepseek_shadow.mjs`（本地测试替身）、
    `server/dev-server.mjs`、`package.json`（`verify:live` / `verify:e2e`）（ai-20）
  - `.github/workflows/live-verify.yml`（GitHub Actions 生产验证流水线，证据回写 master）（ai-20）
  - `scripts/verify/deepseek_shadow.mjs`、`scripts/verify/live_public_verify.mjs`、
    `scripts/verify/public_e2e.mjs`、`scripts/verify/wait_for_deploy.mjs`（新增）、
    `server/httpHandler.mjs`、`server/orchestrator/AIOrchestrator.mjs`、
    `server/prompts/learning-advisor-v1.mjs`、`server/repo/CourseMapRepository.mjs`、
    `tests/ai/unit.test.mjs`（ai-21 修复）
- **Architecture Decision**:
  - 生产验证必须在能直连 `*.vercel.app` 的网络执行 → 放 GitHub Actions，证据提交回仓库。
  - 新增 `meta.build` 部署指纹 + 部署闸门：先确认「验的是本次提交的部署」再验证，
    避免 Vercel 未完成 redeploy 时误验旧代码（首轮 CI 即如此误判）。
  - Stage A 提示词枚举 CourseMap 规范目标清单：**模型「选择」目标名而非「创造」**。
- **Tests**:
  - 首轮真实生产 E2E（commit 51d9537）：**25 PASS / 10 FAIL**。
  - 修复后本地等价验证：后端 64/64、浏览器 37/37；
    unit 78 / routing 10 / integration 10 / core 75 全 PASS；
    数据校验 BLOCKER 0 ERROR 0；Secret 扫描 0（150 文件）。
- **Result**: 修复 **PASS**（本地）；生产再验证 **PENDING**（待推送 + Vercel redeploy + CI）。
- **Known Issues**: 4 处真实缺陷已修（见下）；生产再验证证据尚未产出。
- **Git Commit**: ai-20（`51d9537`）、ai-21 修复（`5dd6052`，**本地已提交，待推送**）

### M19 修复的 4 处真实生产缺陷

| # | 缺陷 | 现象 | 修复 |
| --- | --- | --- | --- |
| 1 | Serverless 文件系统路由缺文件 | 生产 `GET /api/ai/health` 404（本地 dev-server 正常）→ 前端探测恒失败 → 静默降级 | 新增 `api/ai/health.js`；新增 `tests/ai/routing.test.mjs` 断言「本地路由 == 生产路由」，并用变异测试验证该测试真会失败 |
| 2 | 难度/语言为硬过滤 | 目标「单细胞 RNA-seq 入门」只有 advanced 资源 → 0 候选 → 合法请求返回 INVALID_MODEL_OUTPUT / NO_MATCHING_RESOURCE | 难度/语言改为**软偏好**排序（预算/时长仍硬约束）；检索返回 `relaxations` |
| 3 | `getLearningPath` 用严格 `===` 比较 id | `path_id` 为字符串 → 0 步 → 学习路径静默为空 | 全 Repository 的 id 比较规范化为 `String(a) === String(b)`；`path_ref` 改用 `asId()` 保留数值 id |
| 4 | **目标名匹配过于脆弱**（首轮 CI 暴露，影响最大） | 真实 DeepSeek 把目标改写成自然措辞（`Python 编程入门` / `Python数据分析` / `单细胞分析`）→ 3 个用户场景全部退化为 NO_MATCHING_RESOURCE | `findGoalByName` 改 3 级匹配（精确 → 双向包含（ASCII 词边界保护）→ Dice 0.6，含 CJK 一方优先）；Stage A 枚举规范目标清单 |

### M19 附带修复的验证器缺陷（重要）

- **测试替身「扫全段提示词」**：Stage A 提示词加入目标清单后，
  `deepseek_shadow.mjs` 的正则扫整段提示词会命中清单里的
  `单细胞 RNA-seq 入门`，导致本地把三个场景**全部**误判为该目标（假失败）。
  已改为先从提示词切出 `User message:` 段再推断——**等价于「模型只看用户说的话」**。

---

## FINAL STATUS
**COURSEMAP AI-1 — DEPLOYED（前端 + 后端）· 4 处生产缺陷已修 · 生产再验证 PENDING**

- 前端公网（CourseMap-v0.2-AI-Beta）：**VERIFIED**（VERSION 正确 + 公网 16/16 smoke + 0 控制台错误）。
- 后端（Vercel Function `https://coursemap-prototype.vercel.app`）：**DEPLOYED 且已读到密钥**
  （`llm_configured=true`、`adapter=deepseek`）。
- 首轮真实生产验证：**未通过**（25/35），暴露 4 处真实缺陷；修复已完成并本地全量验证通过。
- **剩余一步**：把修复提交（`5dd6052`）推送至 master → Vercel 自动 redeploy →
  CI `live-verify` 产出生产证据（`30_*` / `31_*`）后，方可判定 Production Activation COMPLETE。
- 纪律：**绝不以「页面能打开」判定 AI 成功；绝不以规则降级冒充 DeepSeek**——
  必须证明请求经过 Frontend → Vercel → DeepSeek。

