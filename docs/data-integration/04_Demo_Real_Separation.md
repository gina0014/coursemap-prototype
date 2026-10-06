# 04 — Demo / Real Separation（模块 E / P）

## Objective

让「演示数据」与「真实数据」在**数据层、渲染层、AI 层**三处都不可混淆：
读者在任何一个页面、任何一条推荐上，都必须能立刻判断这条记录是真实存在并可溯源的，还是仅用于演示。

## Decision

**1. 数据层：`data_class` 是强制字段，取值只有两个。**

```json
{ "data_class": "demo" }   // 演示数据：不指向任何真实第三方页面
{ "data_class": "real" }   // 真实数据：必须绑定官方来源 + 许可 + 观测日期
```

**2. ID 区间分离（人为但有效的一道防线）**

| 区间 | 含义 |
| --- | --- |
| `resource_id` < 101 | 演示资源 |
| `resource_id` ≥ 101 | 真实资源 |

同一约定适用于 `source_id` / `provider_id`。这让「某条记录属于哪一类」在日志与截断输出中**一眼可辨**，
也让幂等写入可以按区间过滤（见 [02_Safe_Ingestion.md](02_Safe_Ingestion.md)）。

**3. 渲染层：REAL 与 DEMO 都必须显式标注，不能"只有 DEMO 才有徽标"。**
原实现 `badgeDemo(isDemo)` 对真实记录返回空字符串 —— 结果是真实资源在列表里**没有任何徽标**，
读者无法区分「这是一条没有标记的真实记录」还是「这是一条被误判的记录」。修复为 `badgeDataClass()`：

```js
badgeDataClass(true)  → <span class="badge badge--demo">DEMO · 演示数据</span>
badgeDataClass(false) → <span class="badge badge--verified">REAL · 真实资源</span>
```

**4. AI 层：REAL AI ≠ ALL DATA REAL。**
这两个命题必须**同时**成立且同时被表述：
- 「AI 引擎是真的」（DeepSeek 真实调用）；
- 「数据集里既有真实记录也有演示记录」。

任何只讲其一的文案都是误导。

## Implementation

### 数据层

| 位置 | 实现 |
| --- | --- |
| `scripts/data/ingest_real_oer.mjs` | 所有真实 records 写 `data_class: 'real'`；`keepDemo()` 按 `data_class` + ID 区间双条件过滤 |
| `data/resource-source.json` | 关系行也带 `data_class`（幂等修复的一部分） |
| `scripts/validate/validate_data.py` | 校验真实资源必须绑定来源 |

### 渲染层

| 位置 | 实现 |
| --- | --- |
| `js/components.js` `badgeDataClass()` | 统一的数据类别徽标 |
| `js/components.js` `resourceCard()` | 卡片徽标由 `badgeDemo` → `badgeDataClass` |
| `js/components.js` `compareTable()` / `compareCards()` | 对比表/卡片同上 |
| `js/components.js` `demoBannerHtml()` | 全站披露横幅：`REAL + DEMO` / `REAL` / `DEMO` 三种形态，条数运行时计算 |
| `js/components.js` `pageDataBadges(ctx)` | 页面级徽标改为**运行时计算**，删除硬编码 `badgeDemo(true)` |
| `js/demoBannerHtml` 调用点 | `mountChrome()` → 所有页面共享 |

### 运行时统计

`js/data-loader.js` 的 `datasetStats()` 在 `totals` 下新增**面向学习资源**的口径：

```js
totals: {
  records, demo, real, rawRecords,     // 全实体口径（保留）
  resources: {                          // Module P：披露口径必须落在「学习资源」上
    total, demo, real,
    realVerified,                       // real 且 verification_status !== 'unverified'
  },
}
```

> 为什么必须分开：`records` 会把 `sources`、`resource-source` 关系也计进去。
> 用「所有实体行」去说「学习资源有多少条真实」是错的，会把 42 条来源算成资源。

### AI 层

| 位置 | 实现 |
| --- | --- |
| `server/orchestrator/AIOrchestrator.mjs` | `data_class_counts` + 混合构成写入 `uncertainties`；`grounding.verified_recommendations` |
| `js/pages/advisor.js` | 顶部披露增加「AI 是真实的 ≠ 全部数据都是真实的」+ 真实/演示条数；响应头徽标按真实/演示分别渲染 |
| `js/ai-advisor.js`（规则引擎后备） | 不确定性文案由「全部为演示数据」改为按实际构成分三种表述 |
| `js/pages/home.js` | 首页统计条同时显示真实与演示条数 |

## Files

| 文件 | 变化 |
| --- | --- |
| `js/components.js` | `badgeDataClass` / `pageDataBadges` / `demoBannerHtml` 重写；卡片与对比组件改用 `badgeDataClass` |
| `js/data-loader.js` | `totals.resources` 口径 |
| `js/pages/home.js` | 统计条显示真实 + 演示 |
| `js/pages/compare.js` / `paths.js` / `data-methodology.js` | 删除硬编码 `badgeDemo(true)`，改用 `pageDataBadges(ctx)` |
| `js/pages/provider.js` / `path.js` / `review.js` | 记录级徽标改用 `badgeDataClass` |
| `js/pages/advisor.js` | REAL AI ≠ ALL DATA REAL 披露 |
| `js/ai-advisor.js` | 不确定性文案按实际构成生成 |
| `js/labels.js` | `DATA_CLASS` 展示映射（已有，保持） |

## Tests

| 断言 | 位置 | 覆盖 |
| --- | --- | --- |
| `T-21` 系列 | `runtime.test.mjs` | demo/real 严格分离且两者非空 |
| `T-21d` | `runtime.test.mjs` | `data_class` 只能取 `demo` / `real` |
| `R-00c` | `data1.test.mjs` | ID 区间严格分离 |
| `R-04` / `R-04b` | `data1.test.mjs` | 混合推荐两条都保留，且混合构成被披露 |
| `R-04c` | `data1.test.mjs` | `verified_recommendations` 只计已核验真实资源 |
| `Sx-07` | `public_e2e.mjs` | DOM 上数据类别标注与数据集一致 |
| `M-02` / `M-03` | `public_e2e.mjs` | 页面声明 REAL AI ≠ ALL DATA REAL，并披露真实/演示条数 |

## Result

- 全站横幅按运行时数据渲染，三种形态自动切换（本轮为 `REAL + DEMO`）。
- 所有列表/详情/对比/AI 推荐上的记录都带 `REAL` 或 `DEMO` 徽标，无"无标注"状态。
- 首页统计条同时显示真实与演示条数。
- AI 页与规则引擎后备都明确声明「AI 真实 ≠ 数据全部真实」。
- 混合推荐不再被笼统描述为「全部为演示数据」。

## Known Limitations

- `verification_status` 有多个取值（`unverified` / `editorial_verified` / `provider_confirmed` / `source_verified`），
  而 `realVerified` 的判据只是「非 `unverified`」。这是一个**宽松**口径，不区分核验强度。
  未来应改为按核验等级加权披露。
- 路径（`learning-paths`）仍是演示数据，其 `data_class` 不会被资源级的真实数据改变 ——
  所以「真实资源」页面上仍可能出现演示路径。这一点已在横幅中说明，但页面级提示仍可更醒目。
- 截图证据（`docs/evidence/screenshots/`）为本地 CDP 生成，与公网部署的渲染可能因缓存而略有差异。
