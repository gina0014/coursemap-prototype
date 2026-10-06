# 12 — Data-1 Final Report（模块 Y）

> 本文件是 **Phase Data-1 + AI Production Activation** 的终局报告。
> 它只陈述**可复现的事实**，并对无法在本环境完成的部分如实标记 `BLOCKED`。

生成时间：2026-10-06
执行器：`scripts/verify/data1_final_gates.mjs`
证据：`docs/data-integration/evidence/data1_final_gates.json` / `.txt`

---

## 1. 判决

```
COURSEMAP DATA-1 + AI ACTIVATION PARTIAL
OFFLINE GATES: PASS (12 gates) — VERIFIED OPEN EDUCATIONAL RESOURCES ACTIVE
PENDING (需 GitHub Actions live-verify 在本次推送的 commit 上执行):
  - REAL DEEPSEEK AI ADVISOR ACTIVE                       → backend-verify
  - EVIDENCE-GROUNDED RECOMMENDATION READY (public path)  → public-e2e
```

**为什么是 PARTIAL 而不是 COMPLETE，也不是 BLOCKED：**

- 规格要求的 14 条门禁中，**12 条已经在离线环境拿到 PASS**，且每条都有可复算的证据指针；
- **0 条 FAIL** —— 没有任何一条验收标准被证伪；
- **2 条 BLOCKED** —— 它们不是「没做」，而是「本环境无法执行」：
  生产真实 DeepSeek 调用与公网端到端验证都需要 `*.vercel.app` 的连通性，
  而本机沙箱既无法访问该域名，也无法把提交推送到远端以触发 CI。

按规格，只有全部条件满足才能输出 `COMPLETE` 横幅。
在 2 条生产门禁未取得证据的情况下输出 `COMPLETE` 就是在伪造验收 —— 故输出 `PARTIAL`。

---

## 2. 门禁逐条结果

| # | 门禁 | 状态 | 证据 |
| --- | --- | --- | --- |
| Y-01 | Real Resources > 0 | **PASS** | `data/resources.json` → `data_class === 'real'` 计数 = **40** |
| Y-02 | 所有真实资源都有 Source | **PASS** | 40/40 绑定；独立复算 `validate_data.py` → `real resources without Source: 0` |
| Y-03 | License Audit = PASS | **PASS** | 40 条真实来源逐一审计；分布 `CC BY-NC-SA 4.0 × 40`；无一条被标为 open/public_domain/commercial |
| Y-04 | Data BLOCKER = 0 | **PASS** | `validate_data.py` exit 0，`BLOCKER: 0` |
| Y-05 | Data ERROR = 0 | **PASS** | `ERROR: 0`（`WARN: 149`，均为「真实资源缺描述」类可接受项） |
| Y-06 | Real DeepSeek Call = PASS | **BLOCKED** | `30_live_public_verification.json` **从未生成**；本机 probe `unreachable (AbortError)` |
| Y-07 | CourseMap Retrieval = PASS | **PASS** | 断言 `R-01/R-01b/R-01c/R-03/R-03g/R-03k` 全绿（6/6） |
| Y-08 | Hallucinated Resource = 0 | **PASS** | 断言 `S-01/S-01b/S-01c/S-02/S-04` 全绿（5/5） |
| Y-09 | Fact Binding = PASS | **PASS** | 断言 `R-03e/R-03i/T-01` 全绿（3/3）：模型编造的 `duration_hours=42` 被丢弃；fee 与 official_url 等于 Repository 值 |
| Y-10 | Unknown Field Test = PASS | **PASS** | 断言 `T-00/T-01b/T-02/T-03/T-04/T-05` 全绿（6/6） |
| Y-11 | Source Binding = PASS | **PASS** | 断言 `R-03c/R-03d/R-03h/R-03l/U-04b` 全绿（5/5） |
| Y-12 | Secret Leak = 0 | **PASS** | `scripts/validate/secret_scan.mjs` exit 0 |
| Y-13 | Public E2E = PASS | **BLOCKED** | 仓库内最新证据是 **AI-1 阶段的历史 FAIL**（`2026-10-06T09:10:19Z`，35 checks / 10 FAIL），产出于本轮修复之前，不能用于本轮验收 |
| Y-14 | Regression = PASS | **PASS** | runtime 84/84 · ai-unit 78/78 · ai-routing 10/10 · ai-integration 10/10 · data1 64/64 = **246 断言，FAIL 0** |

汇总：**PASS 12 · FAIL 0 · BLOCKED 2**

---

## 3. 门禁本身是可失败的（变异测试）

一个「永远 PASS」的门禁等于没有门禁。因此对 Y-02 / Y-03 做了变异测试：

| 注入的缺陷 | 期望 | 实测 |
| --- | --- | --- |
| 向 `resources.json` 注入一条 `data_class='real'` 但无来源关系的资源（`resource_id=999`） | Y-02 FAIL | ✅ `40/41 bound; validator reports 1 unbound` |
| 把来源 101（CC BY-NC-SA 4.0）的 `public_domain` 改为 `true` | Y-03 FAIL | ✅ `1 problem(s)` |
| 上述两次变异下的进程退出码 | 非 0 | ✅ `EXIT=1` |
| 还原数据后重跑 | 全绿 | ✅ 88 resources / 42 sources / `public_domain=false` / `EXIT=0` |

同时可见 **Y-02 具备双重独立证据**：既由脚本自行计算绑定数，也交叉核对校验器的 `real resources without Source` 计数。两者同时为 0 才判 PASS。

---

## 4. 交付物清单

### 4.1 数据（真实、可溯源）

| 项 | 数量 | 说明 |
| --- | --- | --- |
| 资源总数 | 88 | 48 demo + **40 real** |
| 来源总数 | 42 | 2 demo + **40 real**（均带 `license` + `license_url` + `official_url` + `observed_at`） |
| 来源关系 | — | `data/resource-source.json`；每条真实资源 ≥1 条关系 |
| 许可分布 | 40 × `CC BY-NC-SA 4.0` | MIT OpenCourseWare / OpenStax，无一标为公有领域或可商用 |

真实资源领域覆盖（规格要求 5 个领域全覆盖）：

| 领域 | 条数 |
| --- | --- |
| 编程（Programming） | 8 |
| 数据分析（Data Analysis） | 9 |
| 人工智能（AI） | 9 |
| 研究方法（Research Methods） | 7 |
| 学术与通用学习技能（Academic / General Learning Skills） | 7 |

### 4.2 摄取与治理

- `scripts/data/ingest_real_oer.mjs` —— 零依赖 Node ESM 摄取脚本，支持 `--dry-run`，幂等（重复执行不产生漂移）。
- 只保存 **METADATA + OFFICIAL LINK**，不复制课程正文。
- 未知字段一律 `null`（`difficulty` / `duration_hours` / `weekly_workload_hours` / `rating` / `rating_count` / `description` / `updated_at`）。
- `source_verified_fields` 与 `editorially_mapped_fields` 严格区分：**任何取到值的事实字段都必须能指出是哪个来源声明了它**。
- `data/schema/validation-rules-v0.2.json` + `scripts/validate/validate_data.py`：新增 6 条 BLOCKER、4 条 ERROR、1 条 WARN 规则。

### 4.3 代码

| 层 | 关键改动 |
| --- | --- |
| 后端模型配置 | `server/config.mjs`：模型默认值 `deepseek-flash` → **`deepseek-v4-flash`**；显式 `thinking=disabled`；`maxOutputTokens` 2400 |
| 后端适配器 | `server/llm/DeepSeekAdapter.mjs`：思考模式参数注入、`reasoning_content` 回传、JSON 空内容重试、`servedModel` 可归因 |
| 检索 | `server/retriever/StructuredRetriever.mjs`：`orderByDifficulty → orderByDataClass → orderByLanguage`（真实优先但**不**自动置顶）；返回 `data_class_counts` |
| 编排 | `server/orchestrator/AIOrchestrator.mjs`：Fact Hydration 扩展（`license`/`official_url`/`observed_at`/`unknown_fields`/`verified_recommendation`）+ `grounding` 区块 |
| 提示词 | `server/prompts/learning-advisor-v1.mjs`：Null/unknown、License semantics（Free ≠ Open ≠ Public Domain ≠ Commercial）、Grounding order 三节约束 |
| 前端 | `js/components.js` `sourceItem()` 增许可行与「查看官方资源」按钮；新增 `badgeDataClass()`；`js/labels.js` 补 `source_verified` 标签；11 个页面统一改用数据类别徽标；首页统计改为运行时双计数 |
| 门禁 | `scripts/verify/data1_final_gates.mjs`（新增）；`scripts/verify/public_e2e.mjs` 增真实资源/许可/事实绑定断言；`.github/workflows/live-verify.yml` 增 `offline-gates` 作业 |

### 4.4 测试

| 套件 | 断言 | 结果 |
| --- | --- | --- |
| `tests/runtime.test.mjs` | 84 | PASS |
| `tests/ai/unit.test.mjs` | 78 | PASS |
| `tests/ai/routing.test.mjs` | 10 | PASS |
| `tests/ai/integration.test.mjs` | 10 | PASS |
| `tests/ai/data1.test.mjs`（新增） | 64 | PASS |
| **合计** | **246** | **FAIL 0** |

### 4.5 文档

`docs/data-integration/00_Master_Log.md` … `13_DeepSeek_Model_Audit.md`（14 份，含本文件）。

---

## 5. 本轮发现并修复的真实缺陷

按「本机全绿、生产必错」或「治理上会放过假数据」的标准筛选，共 **5 个**：

| # | 缺陷 | 影响 | 发现方式 |
| --- | --- | --- | --- |
| D1 | 默认模型名写作 `deepseek-flash`，**官方模型表中不存在**（正确名为 `deepseek-v4-flash`） | 生产真实调用必然失败；Mock 测试不校验模型名，故 CI 全绿也发现不了 | 模块 I 官方文档核验 |
| D2 | 默认模型名原为 `deepseek-chat`，**已于 2026-07-24 15:59 UTC 永久停用** | 同上，调用返回 HTTP 错误 | 模块 I |
| D3 | OpenStax 真实资源的 `fee=0` 未列入 `source_verified_fields`，被校验器判为「猜的费用」 | 若不修，等于放过「无来源声明的事实」——正是本轮要禁止的行为 | 模块 H 校验器（4 个 BLOCKER）；**修的是数据，不是规则** |
| D4 | 来源关系表缺 `data_class` 字段，`keepDemo()` 无法识别旧真实关系 → 重复摄取时关系从 88 条膨胀到 128 条 | 幂等性破坏，数据静默污染 | 模块 C 二次执行对比 |
| D5 | `verification_status='source_verified'` 在 `labels.js` 中无对应标签，UI 会显示原始英文枚举串 | 前端呈现未本地化，用户看到裸值 | 模块 F/G 前端接入 |

D3 特别值得记录：**校验器拦下了工程师的疏忽**，而修复动作是把事实的出处补全，而不是把规则放宽。
这正是「真实数据不得靠猜」这条政策从口号变成机制的证据。

---

## 6. 已知限制与未完成项（不隐藏）

### 6.1 BLOCKED：生产真实调用（Y-06）

- **事实**：`docs/ai-integration/evidence/30_live_public_verification.json` **从未生成**。
  也就是说，**「生产环境真实 DeepSeek 调用成功」这件事目前没有任何证据**。
- **原因**：本机沙箱无法访问 `https://coursemap-prototype.vercel.app`
  （`fetch` 探测结果 `unreachable (AbortError)`），且不应在本机持有生产密钥。
- **不做的替代方案**：不接受「配置看起来对」「Mock 通过」「代码可读」作为真实调用证据。
- **解除条件**：提交推送后由 CI 的 `backend-verify` 作业执行 `scripts/verify/live_public_verify.mjs`。

### 6.2 BLOCKED：公网端到端（Y-13）

- **事实**：仓库内最新的 `31_public_e2e.json` 是 **AI-1 阶段的 FAIL 记录**
  （`2026-10-06T09:10:19.760Z`，35 checks / **10 FAIL**）。
  它早于本轮的修复，**不能**用作本轮验收依据。门禁因此判 `BLOCKED` 而非 `PASS`。
- **解除条件**：对本次推送的 commit 重跑 `public-e2e` 作业。

### 6.3 环境限制：无法推送

| 尝试 | 结果 |
| --- | --- |
| `git push --dry-run`（默认 schannel） | `fatal: schannel: server closed abruptly` |
| `git -c http.sslBackend=openssl push --dry-run` | **成功** → 凭据与 ref 协商正常 |
| `git -c http.sslBackend=openssl push`（真实推送） | `RPC failed; curl 22 ... error: 502` |
| 逐条增量推送单提交 | `fatal: CONNECT tunnel failed, response 502` |

结论：**沙箱出网代理拒绝为 `git-receive-pack` 建立 CONNECT 隧道**，属出网策略限制，非凭据缺失。
本轮 9 个提交（连同 AI-1 遗留共 **11** 个，`4281734..9d263d6`）均为本地提交，尚未进入远端。**未尝试绕过。**

### 6.4 其他限制

- **模型表会变**：本次核验时点为 2026-10-06。断言 `I-01` 只覆盖已知三类名称，**不能自动发现**官方新增/停用；持续保障依赖人工复检官方文档 + CI 中 `E-04c` 的持续执行。
- **`rating` / `duration_hours` 全部为 `null`**：这是**有意为之**——MIT OCW 与 OpenStax 官方页面不提供这两类字段。代价是「推荐理由」中缺少时长/评分维度，收益是不出现任何编造数字。若未来接入提供方 API 可补齐。
- **真实资源描述为空**（149 条 WARN）：官方页面描述未抓取（避免复制正文）。前端显示「官方描述未核验」，AI 不做描述性扩写。
- **本地浏览器冒烟有 1 条已声明容差**：本机以 `127.0.0.1` 直跑静态服务时，浏览器对后端的跨域探测会被 CORS 拒绝并产生一条 console error；该噪音在生产不出现。容差是**目标级 + 逐条声明 + 写入证据**的，不是把 Console Error 一律忽略。结果 16/16 PASS。
- **`ai_training_allowed` 的差异**：MIT OCW 记为 `true`（署名/非商用/相同方式共享下允许），OpenStax 记为 `false`（官方明确要求书面许可）。这是两家提供方政策的真实差异，不是推断。
- **未做**：真实提供方 API 接入、课程时长补全、评分体系、多语言扩展、CMS、真实后端数据库。均属本轮 **scope 之外**，不视为缺陷。

---

## 7. 解除 BLOCKED 的下一步（需要用户侧一次操作）

```bash
# 1) 在可正常出网的环境推送（openssl TLS 后端可绕开 schannel 中断）
git push origin master
#    如仍失败：git -c http.sslBackend=openssl push origin master

# 2) 推送会自动触发 .github/workflows/live-verify.yml：
#    offline-gates → public-e2e → backend-verify → publish-evidence
#    产出 docs/ai-integration/evidence/30_live_public_verification.{json,txt}
#          docs/ai-integration/evidence/31_public_e2e.{json,txt,png}

# 3) 拉回证据后重跑终局门禁，把 2 条 BLOCKED 升级为 PASS/FAIL
node scripts/verify/data1_final_gates.mjs
```

重跑后若两条均 PASS，横幅将自动变为：

```
COURSEMAP DATA-1 + AI ACTIVATION COMPLETE
VERIFIED OPEN EDUCATIONAL RESOURCES ACTIVE
REAL DEEPSEEK AI ADVISOR ACTIVE
EVIDENCE-GROUNDED RECOMMENDATION READY
```

**注意**：横幅由 `data1_final_gates.mjs` 依据证据文件自动判定，
不存在「手工改成 COMPLETE」的路径 —— 判定逻辑是代码，不是文案。
