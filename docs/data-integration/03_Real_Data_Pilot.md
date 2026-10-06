# 03 — Real Data Pilot（模块 D）

## Objective

摄入 **30–100 条真实开放教育资源（OER）**，覆盖 5 个必需领域，且**质量优先于数量**：
宁可只有 40 条每条都可核验，也不要 200 条有一半许可不明。

## Decision

**目标领域与配额**

| 领域 | 目标 | 实际 | 对应学习目标 |
| --- | --- | --- | --- |
| 编程（Programming） | ≥5 | **8** | Python 入门（goal 1） |
| 数据分析（Data Analysis） | ≥5 | **9** | Python 数据分析（2）/ 科研统计基础（5） |
| 人工智能（AI） | ≥5 | **9** | 机器学习基础（4） |
| 研究方法（Research Methods） | ≥5 | **7** | 研究方法与实验设计（13）/ 科研诚信（14） |
| 学术 / 通用学习技能 | ≥5 | **7** | 学术英语写作（8）/ 大学学习与自我管理（15） |
| **合计** | 30–100 | **40** | |

**提供方配额**：MIT OpenCourseWare **36** 条 + OpenStax **4** 条。

**质量门槛**（每条记录必须同时满足）
1. 官方页面可达且为提供方域名；
2. 许可在官方页面明确披露；
3. 观测日期已记录；
4. 不复制正文；
5. 无法确认的字段留 `null`。

## Implementation

数据由 `scripts/data/ingest_real_oer.mjs` 生成，按领域分组定义：

```
OCW  Python x7          6.0001 / 6.100L / 6.189(IAP2011) / 6.189(IAP2008) / 6.S095 / ...
OCW  Data & Stats x8    18.06 / 6.431 / RES.LL-005 / ...
OCW  AI / ML x8         6.036 / 6.867 / RES.EC-001 (Fairness in ML) / 6.S980 / ...
OCW  Research Methods x6 15.347 / 15.348 / 21H.931(2002,2003) / 17.801 / 11.237 (PAR)
OCW  Research Integrity x1 HST.502 (Responsible Conduct of Research)
OCW  Academic Writing x6 21W.036 / 11.229 / 21W.015 / 21W.022 / 7.02CI / 21L.000J
OpenStax x4             Introduction to Python Programming / Introductory Statistics 2e /
                        Writing Guide with Handbook / College Success
```

**为什么 OpenStax 数量少**：OpenStax 章节署名块明确声明
「未经 OpenStax 事先书面许可，本书不得用于训练大语言模型或以其他方式被摄取进 LLM / 生成式 AI 产品」。
因此 CourseMap 在 `ai_training_allowed = false` 上如实记录，并且**只保存元数据与官方链接，不摄取正文**。
该提供方在数据集中保留，是为了如实呈现「同样免费的开放教材，其许可对 AI 训练的立场可以不同」——
这正是 Module U 要求教给用户的知识。

## Files

| 文件 | 变化 |
| --- | --- |
| `data/resources.json` | 88 条（48 demo + 40 real） |
| `data/sources.json` | 42 条（2 demo + 40 real） |
| `data/resource-source.json` | 资源—来源绑定 |
| `data/fee-history.json` | 真实费用观测（免费，`currency = null`） |
| `data/providers.json` | `101` MIT OpenCourseWare / `102` OpenStax（莱斯大学） |
| `data/subjects.json` | `6` academic-skills |
| `data/skills.json` | `19` research methods design / `20` research integrity / `21` learning strategies |
| `data/learning-goals.json` | `13` 研究方法与实验设计 / `14` 科研诚信与负责任研究 / `15` 大学学习与自我管理 |

## Tests

| 断言 | 覆盖 |
| --- | --- |
| `R-00` | 数据集含真实资源（>0） |
| `R-01` / `R-01b` | 「Python 入门」检索命中真实资源 |
| `T-05` 系列 | 领域字段缺失被如实标注 |
| 校验器 `resources: 48 demo + 40 real = 88` | 规模与构成 |
| `runtime.test.mjs` T-05 | 资源数在 40–120 区间 |

## Result

- **40 条**真实 OER，落在 30–100 的规格区间内。
- 5 个必需领域全部覆盖，且每个领域都超过最低配额。
- 提供方 2 个，均为可核验许可的官方开放教育资源机构。
- 全部真实资源 `status = published`，可被前端与 AI 检索到。

## Known Limitations

- **地域与语言偏斜**：全部为英文资源（`language = 'en'`）。中文开放教育资源（如中国大学 MOOC 开放许可部分）本轮未纳入，因为许可核验成本高且部分平台条款不允许元数据再发布。
- **学科偏斜**：集中在计算机/统计/科研方法，缺少人文社科的深度覆盖（仅 `21L.000J` 一条文学写作）。
- **`learning_outcomes` 为空数组**：官方页面不提供结构化的「学习产出」字段，CourseMap 不自行撰写。
  这意味着详情页「能学到什么？」区块在真实资源上为空——这是**有意的诚实缺口**，而不是待补的 bug。
- 规模仍然偏小：40 条无法支撑「按难度/时长筛选」等依赖这些字段的功能（因为这些字段在真实记录上为 `null`）。
  真实数据的价值本轮体现在**可溯源**，而非**可比较**。
