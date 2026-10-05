# 19 AI-1 Final Report — CourseMap DeepSeek Integration

## 1. Executive Result
**ENGINEERING COMPLETE · WAITING FOR HUMAN SECRET / DEPLOYMENT AUTHORIZATION**
（不是 COMPLETE：Real DeepSeek Call 未被真实 Key 验证，后端未部署。）

## 2. Version
Before: CourseMap-v0.1-Prototype → After: **CourseMap-v0.2-AI-Beta**

## 3. Architecture
Frontend: GitHub Pages（不变）｜Backend: Serverless Function（代码就绪，待部署）
LLM: DeepSeek（服务端适配器）｜Retrieval: StructuredRetriever + Repository
Data: data/*.json（前后端同源事实）｜Learning Graph: goals/skills/paths 关系

## 4. DeepSeek
API: OpenAI 兼容 `/chat/completions`（base/model 走 env）｜Structured Output: json_object
Tool Calls: 6 工具 allowlist｜Streaming: 未实现（决策记录）｜Conversation: session 结构化约束

## 5. Modules
M0 PASS(基线)｜M1 PASS(ai-01)｜M2 PASS(ai-01)｜M3 PASS(ai-01, secret=0)｜
M4 PASS(ai-02)｜M5 PASS(ai-03)｜M6 PASS(ai-01/03)｜M7 PASS(ai-03)｜
M8 PASS(ai-03)｜M9 PASS(ai-03/06)｜M10 PASS(ai-06..07)｜M11 PASS(ai-03)｜
M12 PASS(ai-03)｜M13 PASS(ai-03)｜M14 PASS(ai-09; Live SKIP)｜
M15 WARN(前端已部署；后端待授权)｜M16 WARN(前端公网 16/16；7 Case 待 Key)｜
M17 PASS(ai-11)｜M18 PASS(本报告)

## 6. Retrieval
Structured: IMPLEMENTED｜Vector: NOT IMPLEMENTED｜RAG: DEFERRED（Retriever 接口已预留）

## 7. AI Grounding
Resource ID Validation: CODE-ENFORCED（前后端双防线）｜Fact Hydration: Repository 重取
Source Binding: source_refs + sources[]｜Uncertainty: 显著展示 + DEMO 提示

## 8. Security
API Key Exposure: 0｜Secret Scan: 0｜CORS: allowlist｜Rate Limit: server-side PASS
Prompt Injection: 探针 PASS｜Input Validation: 白名单 + 范围

## 9. Tests
Unit 58 PASS｜Mock HTTP 集成 10 PASS｜Hallucination PASS｜Fact Conflict PASS｜
Injection PASS｜Live: SKIP（待 Key）｜核心回归 75 PASS｜浏览器冒烟 16/16

## 10. Runtime（本地与公网回归）
Console Errors 0｜Backend Errors（mock 面）0｜Unhandled Rejections 0｜Failed Requests 0

## 11. Cost Controls
Rate 10/min/IP｜Message 600 chars｜Tool rounds 4｜Retrieval 12｜Output 2000 tok｜Timeout 45/60s

## 12. Deployment
Frontend URL: https://gina0014.github.io/coursemap-prototype/（v0.2 前端已上线）
Backend: READY / NOT DEPLOYED（等待授权 + Key）

## 13. Evidence
docs/ai-integration/evidence/00_pre_ai_baseline.txt（基线）
evidence/10_secret_scan.txt（扫描）｜tests/ai/*（测试）｜git history（ai-01..ai-11）

## 14. Known Limitations → 见 17_Known_Limitations.md

## 15. Future（未实现，仅规划）
PostgreSQL Repository ｜ Vector Retrieval ｜ Hybrid RAG ｜ Learner Profile ｜
Learning Outcome Feedback ｜ Streaming

## 16. Old Project Integrity
Global Library: UNCHANGED｜DishMap: UNCHANGED

## 17. Final Status
**COURSEMAP AI-1 ENGINEERING COMPLETE — WAITING FOR DEEPSEEK_API_KEY / DEPLOYMENT AUTHORIZATION**
用户唯一人工操作：提供 Key + 在部署平台配置（见 15_Deployment.md「唯一人工步骤」）。
