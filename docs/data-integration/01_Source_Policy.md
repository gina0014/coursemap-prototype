# 01 — Source Policy（模块 B）

## Objective

在引入任何真实数据之前，先把「什么来源可以用、必须记录哪些字段、什么情况一律视为 unknown」写成成文政策。
没有政策的数据集会在第一次审核时被逐条质疑，而无法自证。

## Decision

**优先级：开放教育资源（OER）优先。**

| 优先级 | 来源类别 | 本轮是否使用 | 理由 |
| --- | --- | --- | --- |
| 1 | MIT OpenCourseWare（OCW） | ✅ 使用 | 官方站点披露许可为 CC BY-NC-SA 4.0，且官方单列「Permitted Use of AI Training」条款 |
| 1 | OpenStax（莱斯大学） | ✅ 使用 | 全部教材为 CC BY-NC-SA 4.0，可免费在线阅读与下载 PDF |
| 2 | 其他 OER / 开放教材 | ⬜ 未用 | 本轮规模控制，避免来源分散导致许可核验不充分 |
| — | 商业课程平台 | ❌ 不使用 | 许可不明、条款可单方变更、正文不可复制 |

**强制字段（任何真实来源缺失即视为不合规）**

| 字段 | 含义 | 缺失后果 |
| --- | --- | --- |
| `title` | 官方页面标题 | 不可发布 |
| `provider` | 官方提供方 | 不可发布 |
| `official_url` | 官方页面 URL（必须 http(s)） | **BLOCKER**（VR-C11） |
| `license` | 许可名称（如 `CC BY-NC-SA 4.0`） | **ERROR**（VR-E12） |
| `license_url` | 许可全文链接 | ERROR |
| `observed_at` | 观测日期（ISO 日期） | **ERROR**（VR-E10） |
| `verification_status` | 核验状态（非 `unverified`） | **ERROR**（VR-E13） |
| `source_type` | 来源类型 | 不可发布 |
| `retrieval_method` | 获取方式（官方页面 / 官方 API …） | 建议 |
| 许可布尔语义 | `commercial_use` / `public_domain` / `adaptation_allowed` / `attribution_required` / `share_alike` / `ai_training_allowed` | 必须显式为 `true`/`false`，不得为 `null` |

**未知许可 = `unknown`，不得推测。**
无法确认许可的资源一律不进入数据集；若已存在，`license` 写 `unknown`，且必须在 UI 上以「许可未知」呈现，
并在校验中命中 VR-C12（**未知许可被展示为开放许可 = BLOCKER**）。

**禁止复制正文。**
来源政策同时是一条内容边界：CourseMap 只保存**元数据 + 官方链接**（`METADATA + OFFICIAL LINK`），
不复制课程描述正文、章节文本、讲义、习题或视频。理由有两条：
1. 版权：CC BY-NC-SA 允许非商业复用，但不等于可以无限制重托管；
2. 正确性：正文一旦被复制就会与官方版本漂移，而无链接的复制内容无法被读者核验。

## Implementation

- 政策落地为**数据字段 + 校验规则**，而不是仅写在文档里：
  - 字段定义：`data/schema/entities-v0.1.json`
  - 规则文件：`data/schema/validation-rules-v0.2.json`
  - 执行器：`scripts/validate/validate_data.py`
- 摄取脚本 `scripts/data/ingest_real_oer.mjs` 中的 `LICENSE_CC_BY_NC_SA_4` 对象是本政策在代码里的唯一真源，
  所有真实来源共享同一个许可结构，避免逐条手写导致语义不一致。

## Files

| 文件 | 作用 |
| --- | --- |
| `data/schema/validation-rules-v0.2.json` | 规则真源（含来源与许可规则） |
| `scripts/data/ingest_real_oer.mjs` | `LICENSE_CC_BY_NC_SA_4` / `REAL_PROVIDERS` |
| `scripts/validate/validate_data.py` | 规则执行 |
| `docs/product/08_Source_Governance.md` | 产品侧来源治理说明 |
| `js/labels.js` | `SOURCE_TYPE` / `USAGE_PERMISSION` / `LICENSE_FLAG` 展示映射 |

## Tests

| 断言 | 覆盖 |
| --- | --- |
| `U-04` | 所有真实来源都带 `license` |
| `U-04b` | 所有真实来源都带官方链接 |
| `U-04c` | 没有任何真实来源被误标为公有领域或允许商用 |
| `V-03` | 公网数据集中真实来源的许可语义正确 |
| `VR-C11` / `VR-E10` / `VR-E12` / `VR-E13` | 校验器数据层强制 |

命令：
```bash
python scripts/validate/validate_data.py     # 期望 BLOCKER: 0  ERROR: 0
node tests/ai/data1.test.mjs                 # 期望 PASS: 57  FAIL: 0
```

## Result

- 来源政策以「字段 + 规则 + 代码常量」三重形式落地，不是纸面文档。
- 40 条真实来源全部带 `license`、`license_url`、`official_url`、`observed_at`、`verification_status = source_verified`。
- 许可布尔语义无 `null`；`public_domain` 在全部真实来源上均为 `false`。
- 校验器 `real resources without Source: 0`、`BLOCKER: 0`、`ERROR: 0`。

## Known Limitations

- 本轮只使用 MIT OCW 与 OpenStax 两个提供方，来源多样性有限；扩展提供方时需重新做许可核验。
- `verification_status = source_verified` 的含义是「已比对官方页面」，**不等同于** CourseMap 编辑逐条复核内容的 `human_verified`。
- 许可条款本身可能被提供方修订；本轮以 `observed_at = 2026-10-06` 的观测为准，后续需定期复检。
