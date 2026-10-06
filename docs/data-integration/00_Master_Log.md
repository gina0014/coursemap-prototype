# CourseMap — Data-1 + AI Production Activation · Master Log

> 本目录记录 **Phase Data-1 + AI Production Activation** 的完整工程闭环：
> 来源治理 → 真实 OER 摄取 → 许可校验 → 真实数据 UI → AI 接地 → DeepSeek 激活 → 测试 → 部署 → 终局审计。
>
> 纪律：每个模块都必须留下 **Documentation / Tests / Evidence / Commit**。
> 任何「已核验」的声明都必须能指向本目录中的证据文件或可复现命令。

---

## 1. 本轮目标

| 维度 | Before | After（本轮目标） |
| --- | --- | --- |
| 数据集 | 全部为 DEMO 演示数据（48 条资源） | DEMO + **已核验真实开放教育资源（OER）** 混合，`data_class` 严格区分 |
| 来源 | 无真实第三方来源 | 每条真实资源绑定官方来源 + 许可 + 观测日期 |
| 许可 | 仅 `license_note` 文本 | 结构化许可（`license` / `license_url` / `commercial_use` / `public_domain` / `ai_training_allowed` …） |
| AI | 基础设施就绪（`deepseek-chat` 配置，已退役） | **真实 DeepSeek 调用** + 当前受支持模型 + 接地检索 + 事实水合 |
| 回答契约 | 「AI 解释」 | 「LLM 只解释证据；资源身份/费用/时长/难度/证书/评分/来源全部由 Repository 水合」 |
| 验证 | 本地 Mock | 离线门禁（CI）+ 公网前端 E2E + 生产后端验证 |

---

## 2. 终局状态（截至本目录最后更新）

```
课程数据校验（rules v0.2 + VR-C18）
  resources: 48 demo + 59 real = 107
  sources:   2 demo + 59 real = 61
  real resources without Source: 0
  BLOCKER: 0  ERROR: 0  WARN: 212
  PASS

真实资源构成
  提供方   MIT OCW 41 · OpenStax 6 · Harvard CS50 6 · Google for Developers 6
  许可     CC BY-NC-SA 4.0 ×53 · CC BY 4.0 ×5 · unknown ×1
           public_domain=true: 0   commercial_use=true: 5（全部 CC BY 4.0）
  Broken official link: 0

测试
  tests/runtime.test.mjs          PASS: 86  FAIL: 0
  tests/ai/unit.test.mjs          PASS: 81  FAIL: 0
  tests/ai/routing.test.mjs       PASS: 10  FAIL: 0
  tests/ai/integration.test.mjs   PASS: 10  FAIL: 0
  tests/ai/data1.test.mjs         PASS: 72  FAIL: 0
  tests/ai/model-output.test.mjs   PASS: 33  FAIL: 0  ← 生产缺陷修复新增（17 号文档）
  tests/ai/oer-expansion.test.mjs PASS: 88  FAIL: 0
  tests/ui/featured-oer.test.mjs  PASS: 15  FAIL: 0
  ────────────────────────────────────────────────
  合计 395 项断言，FAIL = 0

浏览器回归（本地，真实 Chrome，18 个目标）
  Result: PASS (18/18)，容差 3 条（12_Advisor_Fallback 的本地 CORS 噪声，已写入证据）

密钥扫描
  files scanned: 180 · git-history added-line findings: 0 · SECRET LEAK = 0

最终门禁（模块 Y）  命令：node scripts/verify/data1_final_gates.mjs
  在线下可执行的 12 条：PASS
  依赖生产连通性的 2 条：BLOCKED（见 §5）
  判决：PARTIAL
```

> **生产缺陷修复轮（2026-10-06 增量）**：CI 生产验证首次跑出
> **48 检查 / 41 PASS / 7 FAIL**，暴露 3 个产品缺陷 + 4 处「验证器自身写错」。
> 已全部修复并配回归断言（`model-output` 33 条 + `A-21b/c/d` + `I-06`~`I-06g`）。
> 详见 [17_Production_Defect_Remediation.md](17_Production_Defect_Remediation.md)。

门禁证据：[`evidence/data1_final_gates.json`](evidence/data1_final_gates.json) /
[`evidence/data1_final_gates.txt`](evidence/data1_final_gates.txt)

> **Real OER Expansion（第二轮）**的候选/接受/拒绝统计、来源治理决定与
> 排序缺陷修复，见 [16_OER_Expansion_Report.md](16_OER_Expansion_Report.md)。

---

## 3. 模块索引

| 模块 | 规格 | 文档 | 主要产物 |
| --- | --- | --- | --- |
| A | Baseline | 本文件 §4 | 基线快照 |
| B | Source Policy | [01_Source_Policy.md](01_Source_Policy.md) | 来源政策与强制字段 |
| C | Safe Ingestion | [02_Safe_Ingestion.md](02_Safe_Ingestion.md) | `scripts/data/ingest_real_oer.mjs` |
| D | Real Data Pilot | [03_Real_Data_Pilot.md](03_Real_Data_Pilot.md) | 40 条真实 OER，覆盖 5 个领域 |
| E | Demo / Real Separation | [04_Demo_Real_Separation.md](04_Demo_Real_Separation.md) | `data_class` 强制分离 + ID 区间 |
| F | Source Provenance (UI) | [05_Source_Provenance.md](05_Source_Provenance.md) | `sourceItem()` + 官方资源按钮 |
| G | License UI | [06_License_Semantics.md](06_License_Semantics.md) | `licensePanel()` / `licenseBadge()` |
| H | Data Validation | [07_Data_Validation.md](07_Data_Validation.md) | `validation-rules-v0.2.json` + validator |
| I | DeepSeek Model Audit | [13_DeepSeek_Model_Audit.md](13_DeepSeek_Model_Audit.md) | 模型审计与退役模型修复 |
| J | Real AI Activation | [08_AI_Activation.md](08_AI_Activation.md) | 真实 DeepSeek 调用链 |
| K | Grounded Retrieval | [08_AI_Activation.md](08_AI_Activation.md) | Intent → Retrieval → Reasoning → Evidence |
| L | Real-First Retrieval | [08_AI_Activation.md](08_AI_Activation.md) | `orderByDataClass`（软优先，非自动第一） |
| M | AI Answer Contract | [08_AI_Activation.md](08_AI_Activation.md) | Fact Hydration |
| N | Source Citation | [05_Source_Provenance.md](05_Source_Provenance.md) | `source_refs` + 官方链接 |
| O | Unknown Data | [08_AI_Activation.md](08_AI_Activation.md) | `unknown_fields` + 「CourseMap 当前未核验该字段」 |
| P | Real + Demo UI | [04_Demo_Real_Separation.md](04_Demo_Real_Separation.md) | 全站披露横幅 + 数据类别徽标 |
| Q | Cost Control | [09_Cost_Control.md](09_Cost_Control.md) | 服务端限流/长度/超时/日志 |
| R–U | AI Tests | [10_AI_Tests.md](10_AI_Tests.md) | `tests/ai/data1.test.mjs`（64 断言） |
| V | Public E2E | [11_Public_E2E.md](11_Public_E2E.md) | `scripts/verify/public_e2e.mjs` |
| W | Documentation | 本目录 | 00–13 |
| X | Git | §5 | 分模块提交（不 squash） |
| Y | Final Gates | [12_Data1_Final_Report.md](12_Data1_Final_Report.md) | `scripts/verify/data1_final_gates.mjs` |

---

## 4. 模块 A — Baseline（基线快照）

基线在改动前后记录，目的是让「变化」可被审计，而不是靠记忆。

**前端**：GitHub Pages `https://gina0014.github.io/coursemap-prototype`
**后端**：Vercel Serverless `https://coursemap-prototype.vercel.app`

**改动前基线**

| 项 | 值 |
| --- | --- |
| CourseMap 版本 | `v0.2-AI-Beta` |
| git HEAD | `e435c02`（本地领先远端 `4281734`，2 个未推送提交） |
| 数据集（资源） | 48 条，`data_class` 全部为 `demo` |
| 数据集（来源） | 2 条，全部为 `editorial_demo` / `product_doc` |
| AI 状态 | 基础设施就绪；`DEEPSEEK_MODEL` 默认 `deepseek-chat`（**已退役模型名**） |
| 数据校验规则 | `validation-rules-v0.1.json` |
| 测试 | runtime 84 / unit 78 / routing 10 / integration 10 |

**改动后基线**

| 项 | 值 |
| --- | --- |
| CourseMap 版本 | `v0.3-Data1` |
| 数据集（资源） | 88 条 = 48 demo + **40 real** |
| 数据集（来源） | 42 条 = 2 demo + **40 real**（每条带许可与官方链接） |
| AI 状态 | 真实 DeepSeek 调用；模型 `deepseek-v4-flash`（官方当前模型表，2026-10-06 核验） |
| 数据校验规则 | `validation-rules-v0.2.json`（新增 10 条真实数据规则） |
| 测试 | 246 项断言，FAIL = 0（新增 Data-1 验收测试 64 项） |
| 真实来源许可 | 全部 `CC BY-NC-SA 4.0`（40/40），无一被标为公有领域或可商用 |
| git HEAD | `2453b95`（本地领先远端 `4281734` 共 **13** 个未推送提交，其中 **11** 个为本轮） |

基线原文证据：`docs/ai-integration/evidence/00_pre_ai_baseline.txt`

---

## 5. 模块 X — Git 提交策略与推送状态

本轮**不 squash**，按「职责边界」分模块提交，使每一个治理决策可单独回溯：

| # | 提交 | 职责 |
| --- | --- | --- |
| C1 | `60dc126` `feat(data-1): ingest 40 verified open educational resources` | 来源治理 + 真实数据摄取（B/C/D/E） |
| C2 | `cef4505` `feat(validation): rules v0.2 — real-data, license and provenance gates` | 许可与溯源校验（H） |
| C3 | `b38197d` `feat(ui): provenance, license display and real/demo disclosure` | 真实数据 UI（F/G/P） |
| C4 | `77353a6` `feat(ai): grounded retrieval, real-first ordering and fact hydration` | AI 接地与事实水合（K/L/M/N/O） |
| C5 | `76a23c7` `fix(ai): DeepSeek model audit + real activation hardening` | 模型审计与激活（I/J） |
| C6 | `105bbac` `test(data-1): real-data invariants + AI acceptance tests` | 测试（R/S/T/U） |
| C7 | `5b70bdc` `test(e2e): public E2E asserts real resources, license and source binding` | 公网 E2E 与 CI（V） |
| C8 | `aefca04` `test(regression): local browser smoke across 16 pages + refreshed evidence` | 本地回归与证据 |
| C9 | `9d263d6` `docs(data-1): data-integration docs 00-13 + final gate executor` | 文档与最终门禁（W/Y） |
| C10 | `2c3d6e0` `docs(data-1): final SHA accounting + evidence refreshed from C9` | 提交清单对账 |
| C11 | `2453b95` `docs(data-1): correct push-blocker root cause in gate caveat` | 更正 push 阻塞根因表述 |

（更早的 `5dd6052` / `e435c02` 为 AI-1 阶段遗留的未推送提交。
合计：远端 `4281734` 之后共 **13** 个本地提交 = 本轮 **11** 个（C1–C11）+ 遗留 2 个。
以 `git rev-list --count origin/master..HEAD` 为准。）

> ### ⚠️ push 状态：BLOCKED（环境级网络限制，非凭据问题）
>
> 复检结论（2026-10-06）：
>
> | 尝试 | 结果 |
> | --- | --- |
> | `git push --dry-run`（默认 schannel） | `fatal: schannel: server closed abruptly` |
> | `git -c http.sslBackend=openssl push --dry-run` | **成功**（`4281734..aefca04 master -> master`）→ 说明凭据与 ref 协商均正常 |
> | `git -c http.sslBackend=openssl push`（真实推送） | `error: RPC failed; curl 22 The requested URL returned error: 502` |
> | 逐条增量推送单提交 | `fatal: CONNECT tunnel failed, response 502` |
>
> 即：**沙箱出网代理拒绝为 `git-receive-pack` 建立 CONNECT 隧道**。
> 这是出网策略，不是凭据缺失，也**未尝试绕过**。
>
> 因此：
> - 本轮 11 个提交均为**本地提交**（连同 AI-1 遗留共 13 个，`4281734..2453b95`），尚未进入远端；
> - 依赖推送的模块（J 生产真实调用、V 公网 E2E、Y 中两条生产门禁）在本环境
>   **不可完成**，状态如实标记为 `BLOCKED`，**不伪造通过**；
> - 解除方式：在可正常出网的环境执行一次 `git push origin master`
>   （或用 `git -c http.sslBackend=openssl push origin master`），
>   随后 GitHub Actions `live-verify` 会自动产出 `30_*` / `31_*` 生产证据，
>   再重跑 `node scripts/verify/data1_final_gates.mjs` 即可把 2 条 BLOCKED 升级为 PASS/FAIL。

---

## 6. 证据文件

| 证据 | 位置 |
| --- | --- |
| 数据校验输出 | 本文件 §2；命令 `python scripts/validate/validate_data.py` |
| 测试输出 | 本文件 §2；命令 `npm test` |
| **最终门禁（模块 Y）** | `docs/data-integration/evidence/data1_final_gates.{json,txt}`；命令 `npm run verify:data1` |
| 密钥扫描 | `docs/ai-integration/evidence/10_secret_scan.txt`；命令 `node scripts/validate/secret_scan.mjs` |
| 浏览器冒烟 + 截图 | `docs/evidence/browser-smoke.json`、`docs/evidence/screenshots/` |
| 公网 E2E | `docs/ai-integration/evidence/31_public_e2e.{json,txt,png}`（CI 产出，**当前为 AI-1 阶段的历史 FAIL 记录**） |
| 生产后端验证 | `docs/ai-integration/evidence/30_live_public_verification.{json,txt}`（CI 产出，**尚未生成**） |
| 部署验证 | `docs/ai-integration/evidence/20_public_deploy_verification.txt` |

---

## 7. 复现本轮全部离线结论（三条命令）

```bash
python scripts/validate/validate_data.py     # 数据校验：BLOCKER 0 / ERROR 0
npm test                                     # 246 项断言：FAIL 0
npm run verify:data1                         # 14 条最终门禁 + 证据落盘
```

生产侧证据（需可出网环境 + 已推送的 commit）：

```bash
git push origin master
# 之后由 .github/workflows/live-verify.yml 自动执行：
#   offline-gates → public-e2e → backend-verify → publish-evidence
```
