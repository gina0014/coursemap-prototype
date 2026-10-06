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

## FINAL STATUS
**COURSEMAP AI-1 ENGINEERING COMPLETE — WAITING FOR DEEPSEEK_API_KEY / DEPLOYMENT AUTHORIZATION**

- 前端公网（CourseMap-v0.2-AI-Beta）：**VERIFIED**（VERSION 正确 + 公网 16/16 smoke + 0 控制台错误）。
- 后端（Vercel Function）：**NOT DEPLOYED**，按设计停在人工密钥/授权边界。
- 唯一人工操作：提供 `DEEPSEEK_API_KEY` 并在部署平台配置 Secret（见 15_Deployment.md）。

