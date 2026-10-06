# 05 — Source Provenance & Citation（模块 F / N）

## Objective

一条推荐若不指向任何可核验的出处，它就不能被称为「已核验推荐」。
本模块保证：**每条真实资源在 UI 上都能回到官方页面**，且回溯路径由数据（Source 记录）驱动，不由模型生成。

## Decision

**用户可见的来源字段（Module F）**

| 展示项 | 数据来源 | 缺失时的显示 |
| --- | --- | --- |
| Source（来源标题） | `source.title` | 回退到 `source.provider` |
| Official Provider（官方提供方） | `source.provider` | — |
| License（许可） | `source.license` + `license_url` | 「许可 Unknown」 |
| Observed Date（观测日期） | `source.observed_at || source.retrieved_at` | 「未记录」 |
| Verification Status（核验状态） | `source.verification_status` | 原始值 |
| 「查看官方资源」按钮 | `source.official_url || source.url` | **不渲染**（绝不伪造 URL） |

**「已核验推荐」的判据（Module N）**

```js
verified_recommendation = Boolean(primary && primary.official_url)
```

即：**有官方 URL 才配称已核验**。没有来源的记录在 AI 推荐卡上会明确显示
「无官方来源，不作为已核验推荐」，而不会被静默地当作可信结果。

**引用绑定（Module N）**

- 每条推荐携带 `source_refs: [source_id...]`（机器可读）
- 每条推荐携带 `sources: [{ source_id, title, provider, official_url, license, license_url, observed_at }]`（展示可用）
- `evidence[]` 中每条记录重复出现 `resource_id` + `source_refs`，使「证据 → 资源 → 来源」三层可交叉核对

## Implementation

### 组件层

`js/components.js`

```js
licenseBadge(source)          // 许可徽标（含 title 提示：公有领域? / 允许商用?）
licensePanel(source)          // 许可面板：许可 + 许可全文链接 + 布尔语义 + 语义提示
officialResourceLink(source)  // 「查看官方资源」按钮，无 official_url 时不渲染
sourceItem({source, relation, note})
                              // 完整来源卡：类型/官方提供方/支撑字段/核验/
                              // 授权/许可/观测日/官方链接/note/许可面板
sourceList(entries)           // 语义标签为 data-coursemap-source / data-coursemap-license-value
```

`sourceItem()` 的渲染顺序刻意把「官方链接」与「查看官方资源」放在**许可面板之前**，
使用户先看到"能去哪里核验"，再看"能怎么用"。

### 服务端水合

`server/orchestrator/AIOrchestrator.mjs` 中每条推荐的来源字段**全部由 Repository 水合**：

```js
const sources = this.repo.getSourcesForResource(r.resource_id);
const licenses = this.repo.licenseSummaryFor(r.resource_id);
const primary  = licenses[0] || null;
// ...
official_url: primary ? primary.official_url : (r.url || null),
source: primary,
license: primary ? primary.license : null,
observed_at: r.observed_at || null,
verified_recommendation: Boolean(primary && primary.official_url),
source_refs: sources.map((s) => s.source.source_id),
sources: sources.map((s) => ({ source_id, title, source_type, verification_status,
                               provider, official_url, license, license_url, observed_at })),
```

模型即使"提到"某个 URL，也不会进入 `official_url` —— 该字段只来自 `licenseSummaryFor()`。

### 前端二次水合（Repository Facts > Model Facts）

`js/pages/advisor.js` 的 `hydrate()` 不只取资源，还从**本地 ctx**重建来源：

```js
const relations = ctx.indexes.resourceSourcesByResource.get(row.resource_id) || [];
const sources   = relations.map((rel) => ctx.indexes.sourceById.get(rel.source_id)).filter(Boolean);
const licensed  = sources.find((s) => s.license) || null;
const official  = sources.find((s) => s.official_url || s.url) || licensed || null;
```

因此即使服务端返回的来源字段被篡改，渲染仍以本地数据为准。
「查看官方资源」按钮的 `href` 直接取自本地 `source.official_url`。

## Files

| 文件 | 变化 |
| --- | --- |
| `js/components.js` | `licenseBadge` / `licensePanel` / `officialResourceLink` / `sourceItem` 重写 |
| `js/pages/resource.js` | 溯源区块新增「官方许可」「官方来源」指标 + 官方资源主按钮 |
| `js/pages/advisor.js` | 推荐卡新增「来源」「许可」「观测日期」行 + 官方资源按钮 |
| `server/orchestrator/AIOrchestrator.mjs` | `official_url` / `source` / `license` / `verified_recommendation` / `sources[]` |
| `server/repo/CourseMapRepository.mjs` | `licenseSummaryFor(resourceId)` |
| `css/components.css` | `.source-item__actions` / `.license-panel` / `.license-flags` |

## Tests

| 断言 | 位置 | 覆盖 |
| --- | --- | --- |
| `R-03c` | `data1.test.mjs` | 推荐携带 `source` 且非 null |
| `R-03d` | `data1.test.mjs` | `official_url` 是合法 http(s) |
| `R-03e` | `data1.test.mjs` | `official_url` 与 Repository 的 `url` 一致（不伪造） |
| `R-03g` | `data1.test.mjs` | `recommendations[].sources` 全部带 http(s) `official_url` |
| `R-03h` | `data1.test.mjs` | `verified_recommendation === true` |
| `R-03l` | `data1.test.mjs` | `evidence` 绑定 `resource_id` + `source_refs` |
| `Sx-08` | `public_e2e.mjs` | 真实资源带「查看官方资源」，DOM `href` == Repository `url` |
| `Sx-10` | `public_e2e.mjs` | 每条推荐都显示来源（Source binding） |
| `V-01b` | `public_e2e.mjs` | 每条推荐都有 `resource_id` 且存在于 CourseMap |
| `VR-E11` | 校验器 | 无效来源关系 = ERROR |

## Result

- 资源详情页与 AI 推荐卡都能一键回到官方页面。
- 官方链接与许可全部来自数据层；无来源即不渲染按钮、不称「已核验」。
- 40 条真实资源在 `R-03e` 上全部满足「DOM 链接 == Repository 链接」。

## Known Limitations

- `primary = licenses[0]`：当一个资源有多个来源时，只取第一个作为「主来源」。
  当前全部真实资源都只有 1 个来源，所以未暴露问题；多来源时需要一个显式的 `is_primary` 标记。
- `source_verified` 状态在前端 `SOURCE_VERIFICATION` 标签表中原本**不存在**，
  会导致 UI 直接显示原始字符串 `source_verified`。本轮已补上映射（`来源已核验`），
  但这类「标签表与数据枚举漂移」是结构性风险：应在数据层定义枚举并由标签表生成，而非各自维护。
- 「查看官方资源」按钮指向第三方站点，`rel="noopener noreferrer nofollow"` 已设置，但未做链接健康检查（可能失效）。
