# 19 AI-1 Final Report — CourseMap DeepSeek Integration

## 1. Executive Result
**DEPLOYED（前端 + 后端）· Real DeepSeek 已接通 · 4 处生产缺陷已修 · 生产再验证 PENDING**
（不是 COMPLETE：修复尚未推送，生产仍未跑修复后的验证；CI 生产证据待产出。）

## 2. Version
Before: CourseMap-v0.1-Prototype → After: **CourseMap-v0.2-AI-Beta**

## 3. Architecture
Frontend: GitHub Pages（不变，`aiBackendBase` 已指向生产后端）
｜Backend: Vercel Serverless Function（**已部署** → `coursemap-prototype.vercel.app`）
LLM: DeepSeek（服务端适配器，密钥仅服务端）｜Retrieval: StructuredRetriever + Repository
Data: data/*.json（前后端同源事实）｜Learning Graph: goals/skills/paths 关系

## 4. DeepSeek
API: OpenAI 兼容 `/chat/completions`（base/model 走 env）｜Structured Output: json_object
Tool Calls: 6 工具 allowlist｜Streaming: 未实现（决策记录）｜Conversation: session 结构化约束

## 5. Modules
M0 PASS(基线)｜M1 PASS(ai-01)｜M2 PASS(ai-01)｜M3 PASS(ai-01, secret=0)｜
M4 PASS(ai-02)｜M5 PASS(ai-03)｜M6 PASS(ai-01/03)｜M7 PASS(ai-03)｜
M8 PASS(ai-03)｜M9 PASS(ai-03/06)｜M10 PASS(ai-06..07)｜M11 PASS(ai-03)｜
M12 PASS(ai-03)｜M13 PASS(ai-03)｜M14 PASS(ai-09)｜
M15 PASS(前端公网 VERIFIED；后端 DEPLOYED 于 Vercel)｜M16 PASS(前端 16/16；E2E 已落地)｜
M17 PASS(ai-11)｜M18 PASS｜
**M19 PASS（本地全量验证通过；生产再验证 PENDING）—— 4 处真实生产缺陷已修**

## 6. Retrieval
Structured: IMPLEMENTED｜Vector: NOT IMPLEMENTED｜RAG: DEFERRED（Retriever 接口已预留）

## 7. AI Grounding
Resource ID Validation: CODE-ENFORCED（前后端双防线）｜Fact Hydration: Repository 重取
Source Binding: source_refs + sources[]｜Uncertainty: 显著展示 + DEMO 提示

## 8. Security
API Key Exposure: 0｜Secret Scan: 0｜CORS: allowlist｜Rate Limit: server-side PASS
Prompt Injection: 探针 PASS｜Input Validation: 白名单 + 范围

## 9. Tests
核心回归 75 PASS｜AI 单元 78 PASS｜路由一致性 10 PASS｜Mock HTTP 集成 10 PASS｜
Hallucination PASS｜Fact Conflict PASS｜Injection PASS｜
**后端生产验证（本地等价）64/64 PASS**｜**浏览器 E2E（本地等价）37/37 PASS**｜
数据校验 BLOCKER 0 / ERROR 0｜Secret 扫描 0（150 文件）｜
真实生产首轮：35 项中 25 PASS / 10 FAIL（修复前，见 16 文档）

## 10. Runtime（本地与公网回归）
本地等价验证与公网冒烟：Console Errors 0｜Unhandled Rejections 0｜关键资源加载失败 0｜
正常场景无 401/403/404/500（生产后端 statuses=200,200,200）。
（首轮真实生产 E2E 的 3 个 404 控制台错误为「目标解析错误 → 走错渲染分支」的后果，
已随缺陷 4 修复消除；生产复测待 CI。）

## 11. Cost Controls
Rate 10/min/IP｜Message 600 chars｜Tool rounds 4｜Retrieval 12｜Output 2000 tok｜Timeout 45/60s

## 12. Deployment
Frontend URL: https://gina0014.github.io/coursemap-prototype/（**CourseMap-v0.2-AI-Beta 已上线，VERIFIED**）
  - `VERSION` 返回 v0.2；`js/ai-client.js` 200；`.md` 原样直出（Jekyll 已由 `.nojekyll` 关闭）。
  - `AI.aiBackendBase` 已指向生产后端（稳定 URL）。
  - 公网浏览器冒烟：`COURSEMAP_BASE=<public>` → 16/16 PASS，Console Errors 0 / Failed Requests 0。
Backend: **DEPLOYED** → `https://coursemap-prototype.vercel.app`
  - `GET /api/ai/health` → `{status:"ok", llm_configured:true, adapter:"deepseek"}` + `meta.build` 部署指纹。
  - `DEEPSEEK_API_KEY` 经 Vercel Environment Variables / Secret 注入，仅服务端；前端与仓库零密钥。
  - 真实生产首轮验证：未通过（25/35）→ 4 处缺陷已修（`5dd6052`，待推送）。
  - 生产再验证：由 `.github/workflows/live-verify.yml` 执行并回写证据。

## 13. Evidence
docs/ai-integration/evidence/00_pre_ai_baseline.txt（基线）
evidence/10_secret_scan.txt（扫描，Secret Leak = 0）
**evidence/20_public_deploy_verification.txt（公网部署验证：v0.2 生效 + 16/16 smoke）**
**evidence/31_public_e2e.{json,txt,png}（真实浏览器 E2E，公网 URL 执行）**
**evidence/30_live_public_verification.{json,txt}（后端生产验证 64 项；首轮 CI 因 E2E 失败跳过，
修复推送后由 CI 产出）**
docs/evidence/browser-smoke.json（公网冒烟原始输出）｜tests/ai/*｜git history（ai-01..ai-21）

## 14. Known Limitations → 见 17_Known_Limitations.md

## 15. Future（未实现，仅规划）
PostgreSQL Repository ｜ Vector Retrieval ｜ Hybrid RAG ｜ Learner Profile ｜
Learning Outcome Feedback ｜ Streaming

## 16. Old Project Integrity
Global Library: UNCHANGED｜DishMap: UNCHANGED

## 17. Final Status
**COURSEMAP AI-1 — DEPLOYED（前端 + 后端）· 4 处生产缺陷已修 · 生产再验证 PENDING**

- 前端公网（CourseMap-v0.2-AI-Beta）：**VERIFIED**（VERSION 正确 + 公网 16/16 smoke + 0 控制台错误）。
- 后端（Vercel Function）：**DEPLOYED**，已读到密钥（`llm_configured=true`、`adapter=deepseek`）。
- 真实生产首轮验证暴露 4 处缺陷（含影响最大的「目标名匹配过于脆弱」），
  修复已在本地全量验证通过（后端 64/64、E2E 37/37、单测全绿、Secret 0）。
- **判定 COMPLETE 的唯一剩余条件**：推送修复 → Vercel redeploy →
  CI `live-verify` 同时通过 `public-e2e` 与 `backend-verify`，产出生产证据。
- 纪律：**不以「页面能打开」判定 AI 成功；不以规则降级冒充 DeepSeek**——
  必须证明请求经过 Frontend → Vercel → DeepSeek。
