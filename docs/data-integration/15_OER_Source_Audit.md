# 15 — OER Source Audit（来源治理审计）

> **目标（Objective）**
> 对 Real OER Expansion 的**每一个候选来源**留下可复核的记录：
> `Candidate / Accepted / Rejected / Reason / Official Source / License / Verification Date`。
>
> 本文件是 [13_OER_Expansion.md](13_OER_Expansion.md) 的证据附件。
> 所有「官方页面说了什么」的判断，都指向 `oer_source_probe.mjs` 产出的
> 机器可读证据 `docs/data-integration/evidence/oer_source_probe.json`。

- 核验日期（observed_at）：**2026-10-06**
- 核验方式：真实 Chrome（CDP）逐页渲染官方页面，抽取许可链接、许可原文、
  免费表述、先修表述、证书表述与**限制性表述**；不使用搜索结果摘要作为事实来源
- 证据文件：`docs/data-integration/evidence/oer_source_probe.json`
  （23 个页面，23/23 可达）
- 复现命令：`npm run research:oer`

---

## 1. 候选总表

| # | Candidate | 官方来源 | License | 判定 | Verification Date |
| --- | --- | --- | --- | --- | --- |
| 1 | CS50x | `cs50.harvard.edu/x/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 2 | CS50P | `cs50.harvard.edu/python/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 3 | CS50 AI | `cs50.harvard.edu/ai/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 4 | CS50R | `cs50.harvard.edu/r/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 5 | CS50 SQL | `cs50.harvard.edu/sql/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 6 | CS50 Web | `cs50.harvard.edu/web/` | CC BY-NC-SA 4.0 | **Accepted** | 2026-10-06 |
| 7 | MCW 6.100L Introduction to CS and Programming using Python | `ocw.mit.edu` | CC BY-NC-SA 4.0 | 已在库（Data-1） | 2026-10-06 |
| 8 | MIT 6.0001 Introduction to CS and Programming in Python | `ocw.mit.edu` | CC BY-NC-SA 4.0 | 已在库（Data-1） | 2026-10-06 |
| 9 | MIT 6.0002 Introduction to Computational Thinking and Data Science | `ocw.mit.edu` | CC BY-NC-SA 4.0 | 已在库（Data-1） | 2026-10-06 |
| 10 | **MIT 6.006 Introduction to Algorithms** | `ocw.mit.edu/courses/6-006-...` | CC BY-NC-SA 4.0 | **Accepted**（新增 141） | 2026-10-06 |
| 11 | **MIT 18.S191 Introduction to Computational Thinking** | `ocw.mit.edu/courses/18-s191-...` | CC BY-NC-SA 4.0 | **Accepted**（新增 142） | 2026-10-06 |
| 12 | **MIT RES.1-002 Introduction to R and GIS** | `ocw.mit.edu/courses/introduction-to-r-and-gis-...` | CC BY-NC-SA 4.0 | **Accepted**（新增 143） | 2026-10-06 |
| 13 | **Google Machine Learning Crash Course** | `developers.google.com/machine-learning/crash-course` | **unknown**（落地页无声明） | **Accepted**（新增 150） | 2026-10-06 |
| 14 | **Google Introduction to Machine Learning** | `.../machine-learning/intro-to-ml` | CC BY 4.0 | **Accepted**（新增 151） | 2026-10-06 |
| 15 | **Google Introduction to ML Problem Framing** | `.../problem-framing` | CC BY 4.0 | **Accepted**（新增 152） | 2026-10-06 |
| 16 | **Google Managing ML Projects** | `.../managing-ml-projects` | CC BY 4.0 | **Accepted**（新增 153） | 2026-10-06 |
| 17 | **Google Rules of Machine Learning** | `.../guides/rules-of-ml` | CC BY 4.0 | **Accepted**（新增 154） | 2026-10-06 |
| 18 | **Google Decision Forests** | `.../decision-forests` | CC BY 4.0 | **Accepted**（新增 155） | 2026-10-06 |
| 19 | MIT 15.075J Statistical Thinking and Data Analysis | `ocw.mit.edu` | CC BY-NC-SA 4.0 | **Accepted**（新增 156） | 2026-10-06 |
| 20 | MIT 14.310x Data Analysis for Social Scientists | `ocw.mit.edu` | CC BY-NC-SA 4.0 | **Accepted**（新增 157） | 2026-10-06 |
| 21 | **OpenStax Principles of Data Science** | `openstax.org/details/books/principles-data-science` | CC BY-NC-SA 4.0 + **禁止 LLM 训练** | **Accepted**（新增 158） | 2026-10-06 |
| 22 | **OpenStax Introductory Business Statistics 2e** | `openstax.org/details/books/introductory-business-statistics-2e` | CC BY-NC-SA 4.0 + **禁止 LLM 训练** | **Accepted**（新增 159） | 2026-10-06 |
| 23 | Stanford CS229 Machine Learning | `cs229.stanford.edu` | **无许可声明** | **Rejected** | 2026-10-06 |
| 24 | Stanford CS231n Deep Learning for CV | `cs231n.stanford.edu` | **无许可声明** | **Rejected** | 2026-10-06 |

**结果：候选 24 条 → 接受 19 条（其中 17 条为本轮新增）→ 拒绝 2 条。**

---

## 2. 拒绝记录（含原文证据）

### 2.1 Stanford CS229 — Machine Learning → **REJECTED**

**理由（双重）**：

1. **材料受限**。官方页面明确写着：

   > "All links will require you to be logged into your Stanford email to access.
   > Course documents are only shared with Stanford University affiliates."

   这不是「免费访问方式」——课程文档只对斯坦福成员开放。

2. **无开放许可**。`oer_source_probe` 在 `cs229.stanford.edu` 全页未找到任何
   `creativecommons.org` 链接，也未找到任何许可声明文本
   （`ccUrls: []`、`licenseHits: []`）。

**治理意义**：这是一条带**硬证据**的拒绝。「Stanford 的 ML 课很有名」不构成
收录理由；页面自己说了「只给本校」，我们就不能把它标成 open。

### 2.2 Stanford CS231n — Deep Learning for Computer Vision → **REJECTED**

**理由**：

1. **无开放许可**。全页未找到 `creativecommons.org` 链接或许可声明
   （`ccUrls: []`、`licenseHits: []`）。
2. **不在优先来源白名单内**，且没有开放许可可供依据。

**治理规则（本轮固化）**：

> 白名单内的来源（MIT OCW / CS50 / Google for Developers / OpenStax）
> 即使某页许可未声明，也可收录并**如实记 `unknown`**；
> **白名单之外**的来源，必须出示**显式开放许可**（CC / 公有领域声明）
> 才可收录。「公开可见」不等于「开放许可」。

这条规则解释了为什么 Google MLCC（`unknown`）被接受，而 Stanford CS231n
（同样是 `unknown`）被拒绝 —— 差异来自**来源政策**，不是来自许可本身。

---

## 3. 许可核验原文（License Evidence）

以下原文由 `oer_source_probe.mjs` 从官方页面抽取，**逐字保留**。

### 3.1 Harvard CS50 → CC BY-NC-SA 4.0

来源页：`https://cs50.harvard.edu/x/license/`

> "This course is licensed under a Creative Commons
> **Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**
> license. This is a human-readable summary of (and not a substitute for) the
> license."

抽取到的许可链接：`creativecommons.org/licenses/by-nc-sa`

→ `commercial_use = false`、`public_domain = false`、`share_alike = true`、
`attribution_required = true`、`ai_training_allowed = null`（**官方未就 AI 训练表态**）。

### 3.2 MIT OpenCourseWare → CC BY-NC-SA 4.0

来源页：`https://ocw.mit.edu/pages/privacy-and-terms-of-use/`

抽取到 "Creative Commons License"、"You are free to:"、
链接 `creativecommons.org/licenses/by-nc-sa`。

→ `commercial_use = false`、`ai_training_allowed = true`（官方另有
「Permitted Use of AI Training」条款：署名 + 仅非商业 + 衍生模型同许可）。

### 3.3 Google for Developers → **分页不一致**

**站点级许可**（`/terms/site-policies`，逐字）：

> "Except as otherwise noted, the content of this page is licensed under the
> **Creative Commons Attribution 4.0 License**, and code samples are licensed
> under the Apache 2.0 License. For details, see the Google Developers Site
> Policies."

抽取到的许可链接：`creativecommons.org/licenses/by`

**但 MLCC 落地页（`/machine-learning/crash-course`）例外**：
`ccUrls: []`、`licenseHits: []` —— 该页**没有**任何许可声明。

→ 因此：**150 = `unknown`**，**151–155 = `CC BY 4.0`**。
`CC BY 4.0` 的 `commercial_use = true` —— 这是数据集中**唯一允许商用**的一批。

### 3.4 OpenStax → CC BY-NC-SA 4.0 **+ 额外禁止 LLM 训练**

来源：`openstax.org/details/books/...` 章节署名块。

> 未经 OpenStax 事先书面许可，本书不得用于训练大语言模型或以其他方式被
> 摄取进 LLM / 生成式 AI 产品。

→ `commercial_use = false`、`ai_training_allowed = **false**`。

**这一条与 MIT OCW 的 `ai_training_allowed = true` 形成真实对照**，
证明这个字段不是形式化的：两个来源都是 CC BY-NC-SA 4.0，但 AI 训练政策相反。

---

## 4. 机器可执行的来源治理：VR-C18

v0.2 规则的 `real_domains` 只校验 URL 前缀（是否为 `http(s)`），
**没有**校验「这个域到底是不是官方域」。本轮补上：

```python
OFFICIAL_SOURCE_DOMAINS = (
    "ocw.mit.edu",
    "cs50.harvard.edu",
    "developers.google.com",
    "developers.google.cn",
    "openstax.org",
)

# VR-C18 —— BLOCKER
# REAL 来源的 official_url 必须落在官方域名白名单内
```

**变异测试（规则必须可失败）**：

```
注入：把 source 101 的 official_url 改成
      https://example-course-aggregator.com/mit-6-0001
结果：VR-C18 报出 1 条 BLOCKER，校验退出码 = 1
还原：EXIT = 0，数据无漂移
```

> 「不得使用聚合站 / 盗版站 / 未授权搬运站」由此从一句政策，变成一条
> **会在 CI 里把构建打红**的规则。

---

## 5. 不变量汇总（Invariants）

扩展后对全部 **59 条**真实资源成立：

| 不变量 | 结果 |
| --- | --- |
| REAL without Source = 0 | ✅ |
| REAL without official URL = 0 | ✅ |
| REAL 的 `url` 与其来源 `official_url` 一致（无自造链接） | ✅ 59/59 |
| 来源 `official_url` 落在官方白名单（VR-C18） | ✅ 59/59 |
| REAL without `observed_at` | 0 |
| `verification_status` = `unverified` 的真实资源 | 0 |
| 被标为 `public_domain = true` 的真实来源 | **0** |
| 未核验却标为「免费」的资源 | 0 |
| 被编造的 `rating` / `duration_hours` / `difficulty` | 0（全为 `null`） |
| Broken official link | **0** |
| Data BLOCKER / ERROR | **0 / 0** |

---

## 6. 已知限制

1. **许可布尔量是编辑判断**。`commercial_use=false` 由许可名称
   （`NC` = NonCommercial）确定，不是对法律条款的机器解释。
   该判断已在 `resource-source` 的 `editorially_mapped_fields` 中如实标记。
2. **无法穷尽官方站点**。本轮核验 23 个官方页面 + 逐条 WebFetch 核验，
   覆盖四大来源的候选清单；这**不等于**「已发现全部 OER」。
3. **Google 中国域（`developers.google.cn`）与 `developers.google.com`
   同源同内容**，本环境中前者可达、后者不可达；`official_url` 统一写
   `developers.google.com`（国际规范域），并在 `verification_url` 记录实际
   完成核验的域，两者都保留以便审计。
4. **Stanford 被拒绝不代表其内容无价值**，只代表它**不符合本轮的开放许可
   政策**。若日后 Stanford 为某门课出示 CC 许可，可重新进入候选。
