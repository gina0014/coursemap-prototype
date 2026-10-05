# Implementation Timeline — CourseMap AI-1

> 时间戳不可靠（执行环境限制），按 Step 序号记录真实执行顺序；每步对应 git commit。

| Step | Module | Action | Result | Commit |
| --- | --- | --- | --- | --- |
| 01 | M0 | 冻结基线：git 状态/数据集计数/核心回归 75 PASS/0 FAIL 重跑确认，写 evidence/00_pre_ai_baseline.txt | PASS | （无代码） |
| 02 | M1/M2 | 设计架构；写 config/errors/repo/retriever/vercel.json/package.json | PASS | ab0b80a ai-01 |
| 03 | M4 | DeepSeekAdapter + LLMAdapter 接口 + MockLLMAdapter + 版本化 System Prompt v1 | PASS | 8202ce2 ai-02 |
| 04 | M5-M13 | orchestrator（intent schema/编排/幻觉防线/事实水合）+ 工具 + 会话 + 安全 + 成本 + httpHandler + dev server + api 入口 + .env.example | PASS | ae31920 ai-03..05 |
| 05 | M5 | 修 bug：整型 ID 与字符串 ID 的 Map 键不一致 → Repository 全键 String 规范化 + asId() | PASS | （并入 ai-03..05） |
| 06 | M14 | tests/ai/unit（58 项：含幻觉/事实冲突/注入/限流/错误映射）+ integration（10 项 HTTP）+ live（Key 门控） | PASS / SKIP | ai-09 |
| 07 | M6-M9 | 数据集预置 prompt-injection 探针（§47，DEMO 标注）并重新生成 + 校验 BLOCKER 0 | PASS | （并入 ai-03..05） |
| 08 | M10/M11/M12 | 前端双引擎 advisor + ai-client + config AI 段 + 披露文案；修 404 探测噪音（未配置后端不探测）；冒烟断言更新 | PASS（16/16） | ai-06..07 |
| 09 | M15 | 部署边界确认：前端已上线 v0.2；后端停在用户授权边界（Key + 平台账号） | WARN | ai-10 |
| 10 | M17 | docs/ai-integration 全套（20 文档 + 8 ADR + 时间线 + Before/After + Master Log）+ README/VERSION/CHANGELOG | PASS | ai-11 |
| 11 | M18 | Secret 扫描 / git 历史扫描 / 旧项目完整性 / push / 公网回归 | PASS | ai-11 |
| 12 | M16 | Real DeepSeek 调用与公网 7 Case E2E | **PENDING（待 Key）** | — |
