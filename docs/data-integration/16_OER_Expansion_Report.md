# 16 — Real OER Expansion · 最终报告

> 本文件是 **Real OER Expansion** 这一轮的终局报告。
> 上一轮（Phase Data-1 + AI Production Activation）的报告见
> [12_Data1_Final_Report.md](12_Data1_Final_Report.md)。

---

## 1. 终局横幅

```
COURSEMAP REAL OER EXPANSION
OFFLINE GATES: PASS — VERIFIED OPEN EDUCATIONAL RESOURCES ACTIVE
FEATURED OER SECTION: ACTIVE (REAL ONLY, 0 DEMO)
LICENSE-AWARE RANKING: ACTIVE (NC / BY / unknown 三种语义可分辨)
PUBLIC E2E: 见 §7（生产连通性由 CI 产出）
```

---

## 2. 规格要求的最终报告数字

| 指标 | 数值 |
| --- | --- |
| **新增候选数** | 24（含 Data-1 已有的 3 条 OCW Python 复检项） |
| **本轮接受数** | **19**（其中 17 条为全新入库） |
| **拒绝数** | **2**（Stanford CS229 / CS231n） |
| **REAL 总数** | **59**（原 40 → +19） |
| **DEMO 总数** | **48**（**未删除**，仍用于边界测试） |
| **Provider 数** | 真实提供方 **4**（MIT OCW / OpenStax / Harvard CS50 / Google for Developers）；demo 提供方 10 |
| **License 分布** | `CC BY-NC-SA 4.0` ×53 · `CC BY 4.0` ×5 · `unknown` ×1 |
| **Broken Links** | **0** |
| **Data BLOCKER** | **0** |
| **Data ERROR** | **0** |
| **AI Retrieval Test** | **PASS**（89 条断言，5 个用户场景，零幻觉，事实水合逐字一致） |
| **Public E2E** | 由 GitHub Actions `live-verify` 产出（见 §7） |

### 2.1 拒绝明细

| 候选 | 官方源 | 拒绝理由 |
| --- | --- | --- |
| Stanford CS229 Machine Learning | `cs229.stanford.edu` | 材料受限（官方原文："Course documents are only shared with Stanford University affiliates."）+ **无任何开放许可** |
| Stanford CS231n Deep Learning for CV | `cs231n.stanford.edu` | **无任何开放许可**，且不在优先来源白名单内 |

> 治理规则（本轮固化）：白名单内来源即使某页未声明许可也可收录并**如实记
> `unknown`**；**白名单之外**的来源必须出示**显式开放许可**才可收录。
> 「公开可见」不等于「开放许可」。详见
> [15_OER_Source_Audit.md](15_OER_Source_Audit.md) §2。

---

## 3. 本轮交付

| 维度 | Before | After |
| --- | --- | --- |
| 真实资源 | 40 | **59** |
| 真实来源 | 40 | **59** |
| 许可种类 | 1（全部 CC BY-NC-SA 4.0） | **3**（NC / BY / unknown） |
| 真实提供方 | 2 | **4** |
| 首页 | 无精选区 | **「精选开放学习资源」只展示 REAL** |
| 排序 | 语言键意外成为最高优先级 | **单次复合排序**（难度 → 真实性·核验 → 先修 → 语言） |
| 来源治理 | URL 前缀校验 | **VR-C18 官方域名白名单（BLOCKER）** |
| 断言总数 | 246 | **344** |
| 浏览器 QA 目标 | 16 | **18**（含移动视口） |

---

## 4. 本轮发现并修复的缺陷

| # | 严重度 | 缺陷 | 影响 | 修复 |
| --- | --- | --- | --- | --- |
| 1 | 严重 | `orderByDifficulty → orderByDataClass → orderByLanguage` 三次**稳定**排序，最后一个键成为最高优先级 | 语言偏好 `zh` 时，**全部 demo 排在全部 real 之前** —— 正是 Module 8 禁止的「只返回 DEMO」 | 单次复合比较器 `orderForRetrieval()` |
| 2 | 严重 | 难度键把 `null`（未核验）当「最差」 | 59 条 OER 的 `difficulty` 全为 null → **全部真实资源被系统性排到 demo 之后** | 未核验 = **中性**，不是失配 |
| 3 | 中 | 先修键把 `known_skills: []`（sanitizeIntent 默认值）当「用户声明什么都不会」 | 带先修的真实资源（CS50AI）被无理由下调 | 空数组 = 未提及，不参与排序 |
| 4 | 中 | 旧断言「真实来源的 `commercial_use` 必须全为 false」隐含「真实资源一定是 NC」 | CC BY 4.0 合法允许商用，该断言会误判 | 改为断言「许可布尔量与其许可名称自洽」 |
| 5 | 信息 | Google 落地页（MLCC）**无许可声明**，同站其它页为 CC BY 4.0 | 若用站点默认值会虚标许可 | 逐页核验，150 = `unknown`，151–155 = CC BY 4.0 |

> 缺陷 1–3 都**不是本轮新引入的**，只是在「全部数据都是 demo」的时代不会显形。
> 三条都有可变异回归断言锁定（S6b-01 / S6b-02 / S6b-03）。

---

## 5. 未删除 Demo Dataset（明确决定）

规格要求「不得删除 Demo Dataset，因为仍用于测试边界情况」。本轮遵守：

- 48 条 demo 资源**全部保留**，`data_class=demo`，ID 段 `< 101`。
- demo 继续承载：空态、资源不存在、无外链资源、降级路径、评分聚合、
  本地收藏/评审等边界场景。
- 变化只有一处：**首页精选区不展示 demo**，且检索中 demo 不再无条件优先。
- 断言 `SC-demo-kept` 锁定该决定（demo 在库 ≥40 条）。

---

## 6. 首页 QA 结果（规格 §11）

| 检查项 | 结果 |
| --- | --- |
| Desktop（1440×1100） | **PASS**（7 条精选断言全绿） |
| Mobile（390×844，mobile:true） | **PASS**（无横向溢出，精选卡与官方链接完整） |
| Keyboard | 精选卡的两个操作均为原生 `<a>`，可 Tab 聚焦、可 Enter 激活 |
| Official links | **PASS**（每卡 https + 官方白名单域，`rel="noopener noreferrer nofollow"`） |
| 404 | **PASS**（`15_404` 目标） |
| Console | **PASS**（仅 12_Advisor_Fallback 的本地 CORS 噪声 3 条，已逐条声明并写入证据） |
| Responsive | **PASS**（移动视口无横向溢出） |
| Broken official link | **0** |
| REAL without Source | **0** |
| REAL without official URL | **0** |
| License fabrication | **0**（CC BY-NC-SA 不得标商用，由 `license-honest` 断言拦截） |
| Fact fabrication | **0**（§4 缺陷 2/3 修复后，真实资源必然进入候选窗口） |

浏览器证据：[`../evidence/browser-smoke.json`](../evidence/browser-smoke.json)
与 `../evidence/screenshots/17_Home_Featured_OER.png`、
`../evidence/screenshots/18_Home_Mobile_Featured.png`。

---

## 7. Public E2E（规格 §14 最后一项）

| 状态 | 说明 |
| --- | --- |
| 本机（开发机） | **不可执行** —— DNS/SNI 无法访问 `*.vercel.app` 与 GitHub Pages 的跨域组合 |
| CI（GitHub Actions） | `.github/workflows/live-verify.yml`：`offline-gates` → `public-e2e` → `backend-verify` |
| 触发条件 | 推送 master 后自动执行，证据由 runner 提交回 `docs/ai-integration/evidence/30_*` / `31_*` |

**本机已完成的替代验证**（等价覆盖，但不冒充公网 E2E）：

- 全量数据校验（BLOCKER 0 / ERROR 0）
- 344 条断言（含 5 个用户场景端到端，Mock LLM）
- 18 个页面的真实浏览器回归 + 18 张截图
- 官方源探测（23 页，许可原文取证）

> 结论：**离线侧全部 PASS；公网侧待推送后由 CI 判定。**
> 不把「本地跑通」写成「公网已验证」。

---

## 8. 复现命令

```bash
# 官方源探测（产出许可取证证据，需 Chrome + 网络）
npm run research:oer

# 数据校验（rules v0.2 + VR-C18）
npm run validate

# 全部离线测试（344 条断言）
npm test

# 浏览器回归（18 目标 + 截图）；需另开终端跑静态服务器
python -m http.server 8765
npm run smoke
```

---

## 9. 已知限制

1. **Google MLCC 的许可是 `unknown`**（官方落地页确实无声明）。这不是缺陷，
   是事实；若官方日后补上，应更新 `license` 与 `observed_at`。
2. **`description` / `duration_hours` / `rating` 全为 `null`**。AI 顾问在这些
   字段上只能说「CourseMap 当前未核验该字段」。这是「不猜」原则的直接代价，
   **刻意保留**。
3. **许可布尔量为编辑判断**，由许可名称（NC/BY）确定，不是对法律条款的
   机器解释；已在 `resource-source.editorially_mapped_fields` 如实标记。
4. **公网 E2E 未在本机执行**（见 §7）。
5. **移动端仅验证 390×844 单一视口**，未覆盖更细的机型矩阵。
6. **推送状态**：本轮提交为本地提交；推送与生产验证需在具备出网条件的环境
   执行（见 [00_Master_Log.md](00_Master_Log.md) §5）。
