# 14 — Homepage Featured OER（首页「精选开放学习资源」模块）

> **目标（Objective）**
> 首页增加「精选开放学习资源」模块，**只展示 verified real resources**，
> 让访客第一屏就能看到「来自高校与教育机构的公开学习资源，CourseMap 已核验
> 来源与访问方式」——而不是先看到一批 DEMO 记录。
>
> 同时，普通搜索**不删 DEMO**（DEMO 仍用于测试边界情况），但**优先展示
> 符合条件的 REAL**，且 DEMO 必须继续明确标注。

- 实现：`js/featured-oer.js`（新增）、`js/pages/home.js`、`index.html`、`css/pages.css`
- 测试：`tests/ui/featured-oer.test.mjs`（15 条）、
  `scripts/regression/browser_smoke.mjs` 的 `17_*` / `18_*`
- 上游：[13_OER_Expansion.md](13_OER_Expansion.md)

---

## 1. 设计决策（Decision）

### 1.1 三条不可协商的纪律

1. **只展示 verified real resources。** demo 记录永远不会出现在精选区，
   因此本模块**不需要**（也**不允许**）出现 DEMO 徽标 —— 出现即视为缺陷，
   由浏览器 QA 的 `no-demo-badge` 断言拦截。
2. **不得因为机构名气硬编码排名。** Harvard / MIT / Google / OpenStax 这些
   名字只用于多样性约束（同一机构最多 2 条），**不作为加分项**。
3. **每张卡必须能点回官方页面。** 没有 `official_url` 的真实资源**直接排除**，
   而不是渲染一个空链接。

### 1.2 选取算法（可解释、可复算）

```
候选 = status=published 且 data_class=real
       且至少绑定一个带 http(s) official_url 的来源

打分 = 可核验字段完整度
        + (level_official 非 null)
        + (certificate_available 非 null)
        + (prerequisites_official 非 null)
        + (fee 非 null)
        + (source.license !== 'unknown')
        + (source.usage_permission !== 'unknown')

排序 = 分数降序 → resource_id 升序（稳定，不随机）

贪心 = 依次取分最高者；若该 provider 已达 maxPerProvider(=2)
       或该 subject 已达 maxPerSubject(=3) 则跳过
保底 = 不足 8 条时放宽 subject 约束，但**不放宽** provider 约束
       （避免整屏同一机构）
```

**为什么用「完整度」而不是「名气」**：完整度是**可从数据里复算**的量，
名气是主观的、不可审计的。任何一个读者都可以用同一份 data 跑出同一份结果。

**为什么 maxPerProvider=2**：59 条真实资源里有 41 条来自 MIT OCW。如果按
分数纯排序，首页会被 MIT 刷屏 —— 那既不利于用户，也会让「精选」名不副实。

---

## 2. 卡片字段（Implementation）

每张卡显示（规格要求的 10 个字段全部落地）：

| 展示项 | 来源 | DOM 标记 |
| --- | --- | --- |
| REAL / VERIFIED | `resource.data_class` | `[data-coursemap-badge="real"]` |
| 课程名称 | `resource.title`（链到详情页） | `.card__title a` |
| Provider | `providerById` | `[data-coursemap-featured-provider]` |
| Subject | `subjectById` | — |
| 类型 / 语言 | `resource_type` + `language` | — |
| Difficulty | `difficulty` → 无则 `level_official` → 无则「难度未核验」 | `[data-coursemap-featured-difficulty]` |
| Free / Fee | `fee` → `0`=「免费」/ `null`=「费用未核验」/ 其它=¥数额 | `[data-coursemap-featured-fee]` |
| 适合学习目标 | `learning_goal_ids` → `goalById` | — |
| License | `source.license`（含商用/公有领域 tooltip） | `[data-coursemap-license-cell]` |
| Source | `source.provider` + `observed_at` | — |
| Official Link | `source.official_url` | `[data-coursemap-official-link]` |

两个按钮：**「查看详情」**（站内）与 **「访问官方资源 ↗」**（
`rel="noopener noreferrer nofollow" target="_blank"`，**直指官方页面**）。

---

## 3. 页面接线（Implementation）

`index.html` 新增骨架：

```html
<section class="section" data-featured-oer-section>
  <h2 class="section-title">精选开放学习资源</h2>
  <p class="section-sub">来自高校与教育机构的公开学习资源，CourseMap 已核验来源与访问方式。</p>
  <div class="grid grid--cards" data-featured-oer></div>
  <p class="cmp-dim" data-featured-oer-note></p>
</section>
```

`js/pages/home.js` 在页面初始化时调用 `renderFeaturedOer(ctx)`；
`[data-featured-oer-note]` 写出**选取口径说明**（条数、覆盖机构数、学科数、
「不按机构名气排序」、以及「DEMO 记录不会出现在本区」）。

> 写出选取口径不是装饰：它让「为什么是这 8 条」对用户和审计者都可回答。

---

## 4. 测试（Tests）

### 4.1 `tests/ui/featured-oer.test.mjs`（15 条）

| 断言 | 内容 |
| --- | --- |
| F-01…F-04 | 精选数量在 6–8；全部 `data_class=real`；零 demo；每卡有来源 |
| F-05…F-08 | 每卡有 https 官方链接；provider / subject 多样性（≤2 / ≤3）；不同机构 |
| F-09…F-11 | 稳定排序：同输入两次运行结果一致；不以 provider_id 或机构名排序 |
| F-12 | 没有 `official_url` 的真实资源被**排除**而不是渲染空链接 |
| F-13 | `fee=null` 的卡片不得显示为「免费」（全量遍历，不是抽样） |
| F-14 | `license=unknown` 的卡片不得出现「允许商用」（全量遍历） |
| F-15 | 渲染 HTML 转义（标题含 `<` 不破坏结构） |

### 4.2 浏览器 QA（`browser_smoke.mjs` 新增两个目标）

**`17_Home_Featured_OER`（桌面 1440×1100）** —— 7 条 DOM 断言，全部通过：

```
OK   featured-count>=6     精选卡 6–8 张
OK   no-demo-badge         精选区内零 DEMO 徽标 / 零 "DEMO" 字样
OK   all-real-badge        每张卡都有 REAL 徽标
OK   official-links        每张卡的官方链接都是 https 且落在白名单域
                           （ocw.mit.edu / cs50.harvard.edu /
                             developers.google.com|cn / openstax.org）
OK   license-honest        CC BY-NC-SA 不得被标为「允许商用」
OK   fee-honest            费用单元格不得为空
OK   selection-note        选取说明必须写明「不按机构名气排序」
```

**`18_Home_Mobile_Featured`（移动 390×844，`mobile:true`）** —— 3 条：

```
OK   no-h-overflow         documentElement.scrollWidth - innerWidth ≤ 2px
OK   mobile-featured-cards 移动端精选卡仍 ≥ 6
OK   mobile-official-links 移动端每卡官方链接完整
```

### 4.3 结果

```
浏览器 smoke：18/18 PASS
  其中 12_Advisor_Fallback 的 3 条 CORS/ERR_FAILED 为
  已登记的本地环境噪声（本机静态服务器端口不在生产白名单内），
  逐条声明并写入证据 JSON，不影响判定。
```

---

## 5. 展示策略调整（Result）

| 位置 | 策略 | 理由 |
| --- | --- | --- |
| 首页精选区 | **只展示 REAL** | 第一屏应给出可信内容 |
| 普通搜索 | REAL 与 DEMO 都出现，**同难度层内 REAL 优先** | 不能为了「好看」隐藏 demo —— demo 用于测试边界情况 |
| 全部资源 / 资源详情 | 两者都在，**各自带 REAL / DEMO 徽标** | `badgeDataClass()` 统一渲染，不靠颜色代替文字 |
| AI 顾问推荐卡 | 每条推荐各自带 REAL / DEMO 徽标 | REAL AI ≠ 全部数据为真 |

**没有删除 Demo Dataset。** 48 条 demo 记录完整保留，继续承担
「空态 / 边界 / 降级 / 无外链资源」的测试职责。

---

## 6. 已知限制（Known Limitations）

1. **精选区可能不足 8 条**（当前恰好 8 条）。若日后真实资源减少或大量集中于
   同一机构，保底逻辑会放宽学科约束但**不放宽机构约束** —— 宁可少展示，
   也不让首页变成单一机构目录。
2. **`level_official` 直接展示英文原文**（如 `Introductory` / `Intermediate`）。
   这是刻意的：把它翻译成中文或映射成 CourseMap 难度枚举，都属**推断**。
3. **`fee=null`（Google 6 条）在精选区会显示「费用未核验」**。如果 Google
   在分数上占优进入精选，用户会看到「费用未核验」而不是「免费」——
   这是诚实，不是 bug。
4. 移动端断点验证为 390×844 单一视口；更细的机型矩阵未覆盖。
