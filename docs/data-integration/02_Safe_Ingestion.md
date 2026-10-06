# 02 — Safe Ingestion（模块 C）

## Objective

用**可重复、可幂等、可评审**的方式把真实 OER 元数据写入数据集，并在结构上保证：
「未知就是 `null`，绝不由脚本或 AI 猜测」。

## Decision

三条设计决策：

**1. `METADATA + OFFICIAL LINK` 摄取模式。**
脚本只写入：标题、提供方、官方 URL、许可及其布尔语义、观测日期、官方层级（`level_official`）。
**不写入**课程描述正文、学习产出、讲师完整信息、课程时长。

**2. 官方未提供的字段一律 `null`，不做推断。**

| 字段 | 写入值 | 理由 |
| --- | --- | --- |
| `difficulty` | `null` | 官方表述是 `Undergraduate` / `Graduate` / `College`，**不是** CourseMap 的 `beginner/intermediate/advanced` 枚举；语义不同不得混用 |
| `level_official` | 官方原值（如 `Undergraduate`） | 保留原始事实，不映射成 CourseMap 枚举 |
| `duration_hours` | `null` | 官方页面未给出固定总时长；OCW 为自学节奏，无法折算 |
| `weekly_workload_hours` | `null` | 同上 |
| `rating` / `rating_count` | `null` | 官方不提供学习者评分；**不得用提供方自评代替** |
| `description` | `null` | 不复制正文（来源政策） |
| `certificate_available` | OCW `false`（官方明示"no credit or certification"） / OpenStax `null`（官方未声明） | 只有官方明确表述时才写布尔；否则 `null` |
| `fee` | `0` | 免费访问是官方事实 |
| `currency` | `null` | 免费 = 无货币；**不得凭空写 `'CNY'`** |
| `updated_at` | `null` | 官方无统一更新日期字段 |
| `authors` / `publish_date` | OpenStax 有则写，无则 `null` | 逐条按官方页面实际披露 |

**3. 幂等：重复运行不产生重复记录。**
真实记录的 ID 从 `101` 起编号，演示记录 ID < 101。`keepDemo()` 的过滤条件是
`row.data_class !== 'real' && Number(row[key]) < 101` —— 双重条件，
既排除已写入的真实记录，也排除历史遗留的越界 ID。

> 这一条是踩坑后加固的：初版只按 `data_class !== 'real'` 过滤，而 `resource-source` 关系表当时**没有** `data_class` 字段，
> 导致第二次运行把 40 条真实关系重复写入（关系数 88 → 128）。修复方式：给关系行补 `data_class`，并让 `keepDemo` 同时校验 ID 区间。

## Implementation

`scripts/data/ingest_real_oer.mjs`（约 400 行，Node ESM，零依赖）

```
ID 基址
  RESOURCE_ID_BASE = 101      SOURCE_ID_BASE   = 101
  PROVIDER_ID_BASE = 101      SKILL_ID_BASE    = 19
  GOAL_ID_BASE     = 13       SUBJECT_ID       = 6   (academic-skills)
  OBSERVED_AT      = '2026-10-06'

结构
  REAL_PROVIDERS  MIT OCW(101) / OpenStax(102)
  REAL_SUBJECTS   academic-skills(6)
  REAL_SKILLS     research methods design(19) / research integrity(20) / learning strategies(21)
  REAL_GOALS      research methods(13) / research integrity(14) / college success(15)

辅助函数
  OCW(num, slug, title, level, goals, skills, subject)
  OPENSTAX(slug, title, goals, skills, subject, publishDate, authors)
  keepDemo(list, key)          // 幂等过滤
  build()                      // 产出 sources / resources / relations / fees
  main()                       // 写入（--dry-run 只打印）
```

**`source_verified_fields` vs `editorially_mapped_fields`** —— 这是本轮最关键的字段设计。
校验器用这两个清单区分「官方页面直接核验到的事实」与「CourseMap 编辑做的映射」：

| 提供方 | `source_verified_fields` | `editorially_mapped_fields` |
| --- | --- | --- |
| MIT OCW | `title, provider, url, license, level_official, language, learning_mode, fee, certificate_available` | —（`learning_mode` 官方即自学节奏） |
| OpenStax | `title, provider, url, license, language, publish_date, authors, fee` | `learning_mode` |

> 踩坑记录：OpenStax 首次写入时 `fee = 0` 但未把 `'fee'` 列入 `source_verified_fields`，
> 校验器立即报出 **VR-C13（疑似猜测费用）= BLOCKER × 4**。这不是误报，而是校验器按设计工作：
> 一个"事实字段"若不在已核验清单里，就无法证明它来自官方。
> 修复：把 `'fee'` 加入核验清单，并把 `'learning_mode'` 从「核验」降级为「编辑映射」（因为 OpenStax 是自学节奏这件事属于编辑判断）。

## Files

| 文件 | 变化 |
| --- | --- |
| `scripts/data/ingest_real_oer.mjs` | **新增** |
| `data/sources.json` | +40 真实来源（2 → 42） |
| `data/resources.json` | +40 真实资源（48 → 88） |
| `data/resource-source.json` | +40 关系（含 `data_class`） |
| `data/fee-history.json` | +40 费用观测 |
| `data/providers.json` | +2（MIT OCW / OpenStax） |
| `data/subjects.json` | +1（academic-skills） |
| `data/skills.json` | +3 |
| `data/learning-goals.json` | +3 |

## Tests

| 断言 | 覆盖 |
| --- | --- |
| `R-00c` | 真实资源 ID ≥ 101 且演示资源 ID < 101（区间严格分离） |
| `T-00` | 被测真实资源 `duration_hours === null`（未知没有被伪造） |
| `T-01` | 模型给出的 `duration_hours=42` 未被采纳 |
| `T-01b` | `unknown_fields` 包含 `duration_hours` |
| `U-04` / `U-04b` | 真实来源全部带许可与官方链接 |

**幂等性验证**（手工两轮）：
```bash
node scripts/data/ingest_real_oer.mjs
node scripts/data/ingest_real_oer.mjs     # 关系数必须仍为 88，不增长
```

## Result

- 40 条真实 OER 成功写入，覆盖 8 个学习目标（`goal 1/2/4/5/8/13/14/15`）。
- 幂等：连续两次运行关系数稳定在 88。
- 未知字段**全部为 `null`**，无一条被推测：`duration_hours`、`weekly_workload_hours`、`rating`、`rating_count`、`description`、`updated_at` 均为 `null`。
- 校验器在摄取过程中真实拦下了 4 个 BLOCKER（见上文），修复后 `BLOCKER: 0`。

## Known Limitations

- 真实资源与学习目标的关联（`learning_goal_ids`）为**编辑映射**：官方页面不会给出 CourseMap 的目标 ID。
  这一层的准确性弱于官网直接事实，UI 与 AI 均不得把它当作「官方声明」。
- 单一脚本管理 40 条记录；扩展到数百条时应改为「数据源文件 + 生成器」结构，避免脚本内硬编码清单成为维护瓶颈。
- 未实现自动抓取/更新（无爬虫、无定时同步）。这是刻意的范围控制——抓取会引入正文复制与许可风险；更新依赖人工复审。
