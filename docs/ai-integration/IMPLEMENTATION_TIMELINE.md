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
| 12 | M19 | 后端人工部署授权完成（Vercel + Secret）→ 写生产验证脚本（后端 64 项 + 浏览器 E2E）+ GitHub Actions 流水线 + 本地 DeepSeek 影子替身 | PASS | 51d9537 ai-20 |
| 13 | M19 | 首轮真实生产验证：定界「开发机无法访问 *.vercel.app」→ 改由 CI 执行；E2E 25/35 FAIL，暴露 4 处真实缺陷 | FAIL（如实记录） | 4281734（CI 证据） |
| 14 | M19 | 修缺陷 1：补 `api/ai/health.js` 路由文件 + 路由一致性测试（含变异验证） | PASS | 51d9537 内 |
| 15 | M19 | 修缺陷 2：难度/语言硬过滤 → 软偏好；修缺陷 3：Repository id 比较规范化（`path_id` 字符串导致 0 步） | PASS | 51d9537 内 |
| 16 | M19 | 修缺陷 4（影响最大）：`findGoalByName` 3 级匹配 + Stage A 枚举规范目标清单 → 3 个用户场景全部命中 | PASS | ai-21（5dd6052） |
| 17 | M19 | 修验证器缺陷：影子替身扫全段提示词会命中目标清单 → 改为先切出 `User message:` 段 | PASS | ai-21 |
| 18 | M19 | 验证流水线加固：`meta.build` 部署指纹 + `wait_for_deploy.mjs` 部署闸门 + V-04b 断言；`backend-verify` 改 `if: always()` | PASS | ai-21 |
| 19 | M19 | 本地全量复验：后端 64/64、E2E 37/37、unit 78 / routing 10 / integration 10 / core 75、Secret 0、数据 BLOCKER 0 | PASS | ai-21 |
| 20 | M19 | 推送 → Vercel redeploy → CI 产出生产证据（`30_*` / `31_*`） | **PENDING（待推送）** | — |
