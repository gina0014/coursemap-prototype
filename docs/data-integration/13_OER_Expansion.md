# 13 — Real OER Expansion（真实开放教育资源扩充）

> **目标（Objective）**
> 在 Data-1 已入库的 40 条 verified real resources 基础上，再扩充一批**高质量、
> 官方可验证**的免费/开放学习资源，并把「REAL / VERIFIED / SOURCE-GROUNDED /
> LICENSE-AWARE / OFFICIAL-LINKED」从五个词变成五条可执行的校验规则。
>
> 本轮的重点**不是数量**。任何一条资源如果无法逐条访问官方页面核验，就不入库 ——
> 宁可少 10 条，不可多 1 条来源不明的记录。

- 前置批次：[03_Real_Data_Pilot.md](03_Real_Data_Pilot.md)（40 条）
- 本轮：**+19 条** → 真实资源合计 **59 条**
- 相关文档：[14_Homepage_Featured_OER.md](14_Homepage_Featured_OER.md)、
  [15_OER_Source_Audit.md](15_OER_Source_Audit.md)

---

## 1. 来源政策（Decision）

### 1.1 优先来源（白名单）

| 来源 | 官方域 | 许可 | 本轮采用 |
| --- | --- | --- | --- |
| MIT OpenCourseWare | `ocw.mit.edu` | CC BY-NC-SA 4.0 | ✅ |
| Harvard CS50 OpenCourseWare | `cs50.harvard.edu` | CC BY-NC-SA 4.0 | ✅ |
| Google for Developers / ML Education | `developers.google.com`（中国域 `developers.google.cn` 同源） | CC BY 4.0（部分页面无声明） | ✅ |
| OpenStax（莱斯大学） | `openstax.org` | CC BY-NC-SA 4.0 + **额外禁止 LLM 训练** | ✅ |
| Stanford CS229 / CS231n | `cs229.stanford.edu` / `cs231n.stanford.edu` | **无开放许可** | ❌ 拒绝 |

### 1.2 明确禁止（不予采信）

- 大众点评式聚合站 / 课程比价站
- 盗版课程站、网盘转载
- 未经授权的课程搬运站
- **搜索结果摘要**作为最终事实来源
- 第三方转载作为主要 Source

> 这条政策在 v0.3 被固化为机器规则 **VR-C18**：REAL 来源的 `official_url`
> 必须落在官方域名白名单内。详见 [15_OER_Source_Audit.md](15_OER_Source_Audit.md) §4。

---

## 2. 采集模式：METADATA + OFFICIAL LINK（Implementation）

本轮**不复制课程正文**。对每条资源只保存官方页面能够直接支撑的字段：

```
resource_id · title · provider · subject · learning_goal · resource_type
language · difficulty · prerequisites · fee · free_access · duration
learning_outcomes · certificate · official_url · license · license_url
data_class · verification_status · observed_at · source_id
```

**官方没有明确说明的字段一律 `null`**，禁止根据常识或 LLM 推测。本轮落地的
具体判断见 §3。

### 2.1 关键字段判定规则

| 字段 | 规则 | 本轮结果 |
| --- | --- | --- |
| `difficulty` | 官方只给 `Undergraduate` / `Graduate` / `Intermediate` 等级 → **不映射**为 CourseMap 难度枚举 | 19/19 为 `null`，官方等级另存 `level_official` |
| `duration_hours` / `weekly_workload_hours` | 官方未给统一口径的学时 | 19/19 为 `null` |
| `rating` / `rating_count` | 官方页面不提供评分 | 19/19 为 `null` |
| `certificate_available` | 只在官方有明确表述时才取值 | CS50 = `true`；MIT OCW = `false`；OpenStax / Google = `null` |
| `fee` | 只在官方页面声明时取 `0` | CS50 / MIT / OpenStax = `0`；**Google = `null`**（页面未声明） |
| `currency` | `fee=0` 不涉及币种，避免编造 USD/CNY | 全部 `null` |
| `description` | 官方描述未逐条核验 | 19/19 为 `null`（前端显示「官方描述未核验」） |

**为什么 Google 的 fee 是 `null` 而不是 `0`**：MLCC 与各模块页**从未**出现
「free / 免费」字样（探测证据见 [15](15_OER_Source_Audit.md) §3）。「看起来
显然是免费的」不是来源，是推测。按 Module O 原则记为 `null`，前端显示
「费用未核验」。

---

## 3. 本轮新增资源（Result）

19 条，全部 `data_class=real`、`verification_status=source_verified`、
`observed_at=2026-10-06`、`fee` 均为来源可支撑的值。

### 3.1 Harvard CS50（6 条，provider_id=103）

| id | 课程 | 官方等级 | 证书 | 先修（官方原文节选） |
| --- | --- | --- | --- | --- |
| 144 | CS50x: Introduction to Computer Science | Introductory | ✅ | 无 |
| 145 | CS50's Introduction to Programming with Python | Introductory | ✅ | 无（官方：no prior experience required） |
| 146 | CS50's Introduction to Artificial Intelligence with Python | Intermediate | ✅ | CS50x 或至少一年 Python 经验 |
| 147 | CS50's Introduction to Programming with R | Introductory | ✅ | 无 |
| 148 | CS50's Introduction to Databases with SQL | Introductory | ✅ | 无 |
| 149 | CS50's Web Programming with Python and JavaScript | Intermediate | ✅ | CS50x 或同等经验 |

> CS50 的 `certificate_available=true` 依据官方 FAQ：完成课程可获得**免费的
> CS50 Certificate**（与 edX 的付费 verified certificate 是两件事，两条都记录）。

### 3.2 Google for Developers（6 条，provider_id=104）

| id | 模块 | 许可 | fee |
| --- | --- | --- | --- |
| 150 | Machine Learning Crash Course | **unknown**（落地页无声明） | `null` |
| 151 | Introduction to Machine Learning | CC BY 4.0 | `null` |
| 152 | Introduction to Machine Learning Problem Framing | CC BY 4.0 | `null` |
| 153 | Managing Machine Learning Projects | CC BY 4.0 | `null` |
| 154 | Rules of Machine Learning | CC BY 4.0 | `null` |
| 155 | Decision Forests | CC BY 4.0 | `null` |

> **同一提供方内部许可不一致**，这是真实的、必须逐页核验的事实：
> MLCC 落地页（`/machine-learning/crash-course`）**没有**许可声明，
> 而同域其它模块页统一带「Except as otherwise noted, the content of this page is
> licensed under the Creative Commons Attribution 4.0 License」。因此 150 记
> `unknown`、151–155 记 `CC BY 4.0` —— 不允许用站点默认值抹平差异。

### 3.3 MIT OpenCourseWare 补充（3 条，provider_id=101）

| id | 课程 | 用途 |
| --- | --- | --- |
| 141 | 6.006 Introduction to Algorithms | 算法基础（CS 方向补齐） |
| 142 | 18.S191 Introduction to Computational Thinking | 计算思维 / 科学计算（Julia） |
| 143 | RES.1-002 Introduction to R and Geographic Information Systems (GIS) | R 语言方向 |

### 3.4 OpenStax 补充（2 条，provider_id=102）

| id | 教材 | 用途 |
| --- | --- | --- |
| 158 | Principles of Data Science | 数据分析（补强原本仅 2 条的薄弱方向） |
| 159 | Introductory Business Statistics 2e | 统计 |

### 3.5 新增分类节点

为上述资源补齐分类节点（`data_class=real`，不污染 demo 段）：

- Subject 6：`学术通用能力`（Academic & General Learning Skills）
- Skill 19–26：研究方法设计 / 科研诚信 / 学习策略 / 算法与数据结构 /
  计算思维与科学计算 / 数据科学与统计建模 / 学术写作 等
- Goal 13–20：研究方法 / 科研诚信 / 大学学习成功 / 算法基础 /
  计算思维 / **数据科学基础** / 学术写作 等

---

## 4. 扩充后的数据集分布（Result）

```
resources : 107 = 48 demo + 59 real
sources   :  61 =  2 demo + 59 real

真实资源 · 按提供方
  MIT OpenCourseWare                 41
  OpenStax（莱斯大学）                6
  哈佛大学 CS50 公开课                 6
  Google for Developers              6
  ──────────────────────────────────────
  合计 4 家官方提供方                 59

真实资源 · 按学科
  科研方法        17
  人工智能        16
  编程            13
  学术英语         7
  数据分析         5   （扩充前为 2）
  学术通用能力     1

真实来源 · 许可分布
  CC BY-NC-SA 4.0   53
  CC BY 4.0          5
  unknown            1
  ──────────────────────
  public_domain = true     : 0
  commercial_use = true    : 5   ← 全部来自 Google 的 CC BY 4.0
```

**许可分布是本轮最重要的产出之一**：数据集第一次同时存在
「禁止商用（NC）」与「允许商用（BY）」两种真实许可，
因此**任何把「免费」等同「开放」、把「开放」等同「可商用」的代码都会被测试打出来**
（见 §5 的 L-01 ~ L-06）。

---

## 5. 测试（Tests）

### 5.1 `tests/ai/oer-expansion.test.mjs`（89 条断言，零网络零成本）

| 分组 | 断言 | 覆盖规格 |
| --- | --- | --- |
| E-00\* | 新增资源就位；REAL ≥ 55 且全部有来源；来源无一落在官方白名单外 | 来源治理 |
| S1–S5 | 5 个用户场景的检索：Python / AI / 机器学习 / R / 数据分析 | Module 8/10 |
| S6 | 同难度层内真实资源优先，但 demo **未被硬过滤**；返回 `data_class_counts` | Module 8 |
| S6b | 排序回归（可变异）：同层内「demo 排在 real 之前」违例 = 0；zh 偏好下 demo 未整体压过 real | Module 8 |
| H-01…H-11 | 事实水合：模型故意给错 `fee=9999 / duration=123 / difficulty=advanced / provider=不存在`，全部被 Repository 覆盖 | Module 9 |
| H-12/H-13 | 幻觉 ID（999001）被代码层剔除，真实资源保留 | Module 10 |
| L-01…L-06 | 三种许可（NC / BY / unknown）互不相同、互不混淆；无人被写成公有领域 | Module 5 |
| B-01…B-03 | 59 条真实资源全部有官方来源且 `resource.url` 与来源一致（Broken = 0） | Module 12 |
| N-01…N-07 | 未知字段一律 `null`，不猜 | Module 5/9 |
| SC1–SC5 | 5 个场景端到端（Mock）：推荐非空、无幻觉、事实水合逐字相等、含真实资源 | Module 10 |

### 5.1b 排序修复：本轮发现并修掉的 3 个真实缺陷

接入新资源时暴露出检索排序的两个缺陷 —— 它们**不是新引入的**，
只是过去「全部数据都是 demo」时不会显形。三条都由回归断言锁定（S6b-01 / S6b-02 / S6b-03）。

#### DEFECT-3（严重）：连续稳定排序让**最后一个键**成为最高优先级

修复前检索器这样排序：

```js
list = repo.orderByDifficulty(list, intent.current_level);
list = repo.orderByDataClass(list);      // 「同一层内 real 优先」
list = repo.orderByLanguage(list, intent.language);
```

由于三次都是**稳定**排序，最后一次排序成为**最高**优先级键，
实际优先级是 `language > dataClass > difficulty` —— 与代码注释宣称的
「先按难度分层 → 同层内真实优先 → 最后看语言」**正好相反**。

**实测**：目标「机器学习基础」+ 语言偏好 `zh`，4 条 zh 演示资源
**全部**排在全部已核验真实资源之前。这正是 Module 8 明令禁止的
「明显有更合适 REAL 结果却只返回 DEMO」。

→ 修复为**单次复合比较器** `CourseMapRepository.orderForRetrieval()`，
复合键 `[难度层, 真实性/核验, 先修满足度, 语言]`，一次排序定序，
不再依赖稳定排序的隐式语义。

#### DEFECT-4（严重）：把「难度未核验」当成「难度最差」

修掉 DEFECT-3 后，难度成为首要键，「距离目标水平越近越靠前」。
但**59 条已核验 OER 的 `difficulty` 一律为 `null`**（本轮的既定决策：
拒绝把官方 Undergraduate / Graduate 猜成难度枚举）。
若 `null` 被映射为「距离 = 9（最差）」，则**全部真实资源系统性排在
全部 demo 之后** —— 换一种方式重犯同一个 Module 8 违规。

**实测**：SC1–SC4 四个场景的候选窗口 `real=0/3`。

→ 修复为**未核验 = 中性（不是失配）**：

```
难度键：0 = 与目标水平一致
        1 = 未核验（difficulty === null）—— 中性
        2+ = 已核验但不符（距离越大越靠后）
```

依据：CourseMap 的核心纪律是「**未核验 ≠ 不合适**」。把「不知道」
当成「不好」，等于用一个我们没有的信息去做排序 —— 与 Module O
「CourseMap 当前未核验该字段」的诚实原则自相矛盾。

#### DEFECT-5（中）：先修排序把「未提及」当成「什么都不会」

`sanitizeIntent` 在不传 `known_skills` 时返回 `[]`。若把空数组当作
「用户声明什么都不会」，则所有带先修的真实资源（如 CS50AI，
先修 = Python 基础）会被系统性下调 —— 用**默认值**当**用户断言**去排序。

→ 修复为**空数组 = 未提及，不参与先修排序**；只有非空技能清单才生效。
技能匹配为「声明名 vs 技能名」的**精确比对**（大小写不敏感），
不做模糊/子串匹配 —— 模糊匹配同样是猜。

**修复后的实测排序**（`orderForRetrieval`）：

| 场景 | 结果 |
| --- | --- |
| Python 入门 / beginner | 5 条 zh beginner 演示（难度精确匹配）→ 第 6 名起为真实资源，窗口内 3 条 real |
| 机器学习基础 / intermediate | 3 条精确匹配演示 → 其后 19 条真实资源，窗口内 5 条 real |
| 机器学习基础 / beginner | 无 beginner 演示 → **全部真实资源在前** |
| R 语言入门 / beginner | 1 条精确匹配演示 → 第 2 名起为真实资源 |
| 数据分析 / beginner | 全部真实资源 |

这既是「多因素排序」（不是 REAL 一概优先），也保证
**窗口永远不会被 demo 占满**。

---

### 5.2 数据校验（rules v0.2 + VR-C18）

```
resources: 48 demo + 59 real = 107
sources:   2 demo + 59 real = 61
real resources without Source: 0
BLOCKER: 0  ERROR: 0  WARN: 212
PASS
```

### 5.3 浏览器 QA

`scripts/regression/browser_smoke.mjs` 从 16 个目标扩展到 **18 个**，新增：

- `17_Home_Featured_OER`（桌面）：精选区数量 6–8、**零 DEMO 徽标**、
  每卡都有 REAL 徽标、每卡都有 https 官方白名单外链、许可不得虚标商用、
  费用不得空白、选取口径说明必须写明「不按机构名气排序」。
- `18_Home_Mobile_Featured`（390×844 移动视口）：
  无横向溢出、精选卡完整、官方链接完整。

> 详见 [14_Homepage_Featured_OER.md](14_Homepage_Featured_OER.md)。

---

## 6. 涉及文件（Files）

| 文件 | 变更 |
| --- | --- |
| `scripts/data/ingest_real_oer.mjs` | 新增 `LICENSE_CC_BY_4` / `LICENSE_UNKNOWN`；新增 `HARVARD()` / `GOOGLE()` 构造器；许可按「每条资源自己的声明」分发（不再按提供方二分）；`fee=null` 的产生式不写费用观测记录 |
| `scripts/research/oer_source_probe.mjs` | **新增**：用 CDP 逐页渲染官方页面并抽取许可/免费原文，产出审计证据 |
| `scripts/validate/validate_data.py` | 新增 **VR-C18**（官方域名白名单）与 `OFFICIAL_SOURCE_DOMAINS` |
| `data/schema/validation-rules-v0.2.json` | 登记 VR-C18，scope 扩写为 v0.3 来源治理 |
| `data/*.json` | 资源 88 → 107；来源 42 → 61；provider / subject / skill / goal 新增分类节点 |
| `js/featured-oer.js` | **新增**：首页精选模块选取算法与渲染 |
| `js/labels.js` | `PROVIDER_TYPE` 新增 `company_open`；`USAGE_PERMISSION` 新增 `commercial_reuse_with_attribution` |
| `js/pages/home.js` | 接入精选模块 |
| `index.html` | 新增精选区骨架 |
| `css/pages.css` | 精选区样式 |
| `tests/ai/oer-expansion.test.mjs` | **新增** 89 条断言 |
| `tests/ui/featured-oer.test.mjs` | **新增** 15 条断言 |

---

## 7. 已知限制（Known Limitations）

1. **Google MLCC 的许可是 `unknown`**。这不是缺陷，是事实：官方落地页确实没有
   许可声明。若 Google 日后补上，应改为实际许可并刷新 `observed_at`。
2. **`description` / `duration_hours` / `rating` 全为 `null`**。这意味着 AI 顾问
   在这些字段上只能说「CourseMap 当前未核验该字段」，而不能给出具体数字。
   这是「不猜」原则的直接代价，**刻意保留**。
3. **Stanford CS229 / CS231n 被拒绝**（材料受限、无开放许可）。拒绝理由与证据
   记录在 [15_OER_Source_Audit.md](15_OER_Source_Audit.md) §2。
4. **许可文本为人工核验**：`oer_source_probe.mjs` 抽取的是页面上的许可**链接**
   与**声明文本片段**，不是对法律条款的自动解释。`commercial_use` 等布尔量由
   编辑依据许可名称（NC = 禁止商用）确定，属**编辑判断**，已在
   `resource-source` 的 `editorially_mapped_fields` 中如实标记。
5. **公网 E2E 未在本机执行**（DNS/SNI 无法访问 `*.vercel.app`），由 GitHub
   Actions `live-verify` 工作流产出证据。

---

## 8. 提交（Commit）

本模块的提交边界与「来源研究 / 真实摄取 / 首页精选 / AI 检索 / 校验 / 文档」
一一对应，**不 squash**。见 [00_Master_Log.md](00_Master_Log.md) §5 的完整清单。
