# 11 — Public E2E（模块 V）

## Objective

在**真实公网**上证明六条用户路径可用，且 AI 请求确实穿过
`GitHub Pages → Vercel Function → DeepSeek → CourseMap Retrieval → 回传水合事实`。

## Decision

**为什么必须用真实浏览器 + 真实网络，而不是接口测试**

规则降级的回答与 DeepSeek 的回答**在视觉上几乎一样**。只看页面"能不能打开"，
无法区分「前端确实切到了真实模型」与「前端静静地走了规则引擎」。
因此断言必须落在三层：

| 层 | 断言方式 |
| --- | --- |
| 模式判定 | 页面徽标必须显示 `Real LLM`，结果卡标题必须含 `deepseek-beta` |
| 接地 | 每条渲染出的推荐 ID 必须存在于 CourseMap 数据集中（反向证明不是模型编的） |
| 事实绑定 | DOM 上显示的费用/时长/许可/官方链接必须**逐字段等于** CourseMap Repository 的值 |

**为什么必须在 GitHub Actions 上跑**
开发机的网络无法访问 `*.vercel.app`（DNS 污染 + TLS SNI 重置），
生产后端的验证只能在能直连 Vercel 的网络里执行。GitHub 托管 runner 具备连通性，
且验证结果由 runner 提交回仓库，形成可审计证据。

**顺序**：先 `public-e2e`（E2E），再 `backend-verify`（限流测试会消耗配额，必须最后跑）。

## Implementation

`scripts/verify/public_e2e.mjs`（真实 Chrome via CDP，无 puppeteer 依赖）。

### 环境

```
COURSEMAP_FRONTEND_BASE  https://gina0014.github.io/coursemap-prototype
COURSEMAP_EXPECT_BACKEND https://coursemap-prototype.vercel.app
COURSEMAP_EXPECT_BUILD   ${{ github.sha }}     ← 部署门禁：确认验证的是本次推送的构建
VERIFY_WAIT_MS           300000
```

### 断言分组

| 组 | 覆盖 |
| --- | --- |
| `E-*` | 前端部署生效（`js/config.js` 已指向生产后端、无 secret）；后端 health 就绪 |
| `E-04c` / `E-04c2` | 生产后端上报的模型名匹配官方当前模型表，且不是停用/错误名称 |
| `E-04d` | 生产后端已加载真实 OER（`data_class_counts.real > 0`） |
| `E-04e` | 生产后端版本标记为 `v0.3-Data1` |
| `E-02` / `E-02b` / `E-02c` | 可从公网取到资源与来源事实；数据集含真实资源与真实许可 |
| `M-00` ~ `M-03` | REAL LLM 模式；DeepSeek 披露；**REAL AI ≠ ALL DATA REAL**；真实/演示条数披露 |
| `S1`–`S4` | 四个用户场景（含 Module R 原文场景「零基础大学生想免费学 Python」） |
| `Sx-02`/`Sx-03` | 渲染出推荐卡；无幻觉资源卡（ID 均存在于 CourseMap） |
| `Sx-05` | DOM 层事实绑定：费用/时长等于数据；未核验字段显示「CourseMap 当前未核验该字段」，且**不得出现疑似编造数值** |
| `Sx-06` | 数据类别徽标存在（REAL 或 DEMO 明确标注） |
| `Sx-07` | 数据类别标注与数据集一致 |
| `Sx-08` | 真实资源带「查看官方资源」，且 DOM `href` == Repository `url` |
| `Sx-09` | 许可显示等于来源事实；未把非公有领域误显示为公有领域、未把禁止商用误显示为允许商用 |
| `Sx-10` | 每条推荐都显示来源（Source binding） |
| `V-01` / `V-01b` | 跨场景聚合：真实 OER 确实出现在 AI 推荐中；无不可溯源记录 |
| `V-02` | AI 请求确实经过 CourseMap Retrieval（grounding 证据约束块已渲染） |
| `V-03` | 公网真实来源的许可语义正确 |
| `F-*` | 优雅降级保留：阻断后端后仍产出建议且不报错 |
| `E-90` ~ `E-92` | 运行时卫生：控制台错误 = 0、未捕获异常 = 0、关键资源加载失败 = 0 |

### 证据产物

| 文件 | 内容 |
| --- | --- |
| `docs/ai-integration/evidence/31_public_e2e.json` | 全部结果 + 卫生快照 + 截图路径 |
| `docs/ai-integration/evidence/31_public_e2e.txt` | 人类可读报告 |
| `docs/ai-integration/evidence/31_public_e2e_advisor.png` | 截图 |

由 `publish-evidence` job 自动提交回 `master`。

### 卫生快照的取值时机

控制台错误的统计必须在**主动阻断后端之前**取快照：

```js
const hygiene = {
  consoleErrors: [...bucket.consoleErrors],
  exceptions:    [...bucket.exceptions],
  failedRequests: bucket.failedRequests.filter((f) => !/api\/ai\//.test(f)),
};
```

因为「阻断请求」这一动作本身会在浏览器里产生网络错误与控制台错误 ——
那属于**测试注入**，不应污染「正常运行期错误 = 0」的结论。

### 回归加固：CI 新增离线门禁

`.github/workflows/live-verify.yml` 新增 `offline-gates` job（在 `public-e2e` 之前）：

```yaml
- name: Data validation (rules v0.2 — BLOCKER/ERROR must be 0)
  run: python scripts/validate/validate_data.py
- name: Runtime + AI + Data-1 tests (mock-only, no live API)
  run: npm test
- name: Secret scan (no leaked credentials)
  run: node scripts/validate/secret_scan.mjs
```

`public-e2e` 依赖 `offline-gates`（`needs: [offline-gates]`）：离线契约不过，不做公网断言。

## Files

| 文件 | 变化 |
| --- | --- |
| `scripts/verify/public_e2e.mjs` | 新增 `S4` 场景；`readResult()` 捕获许可/官方链接/数据类别；`Sx-05`/`Sx-07` ~ `Sx-10` 新增断言；`V-01` ~ `V-03` 聚合断言；`E-04c`/`E-04c2`/`E-04d`/`E-04e`；证据 `kind` 改为 `coursemap-data1-public-frontend-e2e` |
| `.github/workflows/live-verify.yml` | 新增 `offline-gates` job；`public-e2e` 依赖它 |
| `scripts/regression/browser_smoke.mjs` | 本地回归加固：`tolerate` 机制（仅本机 BASE 生效） |

## Local Verification (this machine)

本机不能访问 `*.vercel.app`，因此**公网 E2E 未在本机执行**。
本机完成的是**静态站点浏览器回归**（`browser_smoke.mjs`，真实 Chrome + CDP，16 个页面）：

```
base http://127.0.0.1:8765
P-01 … P-13 : 全部 PASS
Console Errors     : 2（其中 3 条为已登记的本地环境噪声）
Unhandled Rejections / Exceptions : 0
Result : PASS (16/16)
```

> 对比基线：仓库中已提交的 `docs/evidence/browser-smoke.json` 是**公网**
> （`https://gina0014.github.io/coursemap-prototype`）运行的 16/16。
> 本机运行在 P-10（AI 顾问）上会遇到一个**已知环境噪声**：顾问页会探测生产 Vercel 后端的
> `/api/ai/health`，而生产 `ALLOWED_ORIGIN` 白名单不含本机静态服务器端口，
> 浏览器必然报 CORS + `ERR_FAILED`。这属于「本机不在白名单」的部署事实，不是前端缺陷。
> 处理方式：在 `browser_smoke.mjs` 中引入**精确匹配**该 URL 的 `tolerate` 规则，
> 且**仅当 BASE 指向本机时生效**；公网运行不豁免。任何其它控制台错误仍然致命。
> 被豁免的条目会在报告中逐条打印，不隐藏。

`bannerText`（从真实 DOM 抓取，证明 Module P 生效）：

```
REAL + DEMO
当前数据集同时包含已核验真实资源与演示资源。真实资源（标有 REAL 徽标与「查看官方资源」）
来自 MIT OpenCourseWare、OpenStax 等开放教育资源，CourseMap 只保存元数据与官方链接，
不复制课程正文；DEMO 记录仅用于产品演示，不代表真实存在的课程或真实价格。
学习资源：共 88 条，其中已核验真实 40 条（其中带核验状态 40 条）、演示 48 条。
```

## Result

| 项 | 状态 |
| --- | --- |
| 公网 E2E 脚本（E/S/M/V/F 全部分组） | ✅ 已实现 |
| CI 离线门禁 + 公网 E2E 串行编排 | ✅ 已实现 |
| 本机静态站点浏览器回归 | ✅ 16/16 PASS |
| 本机 Module P 横幅渲染验证 | ✅ 从 DOM 抓取到 `REAL + DEMO` + 真实/演示条数 |
| **公网 E2E 实际执行** | ⛔ **BLOCKED（push）** |

**为什么 BLOCKED**：公网 E2E 的触发条件是「本次提交的构建已部署到 GitHub Pages 与 Vercel」。
本环境的 `git push` 被凭据管理器阻断（见 [00_Master_Log.md](00_Master_Log.md) §5），
因此 `docs/ai-integration/evidence/31_*` 仍是上一轮的公网结果，**不能用于本轮结论**。
不伪造通过。

## Known Limitations

- **E2E 依赖真实模型行为**：`Sx-09`（许可）× `Sx-02`（有推荐卡）的组合在模型给出 0 条推荐时会空集通过（vacuously true）。
  已用 `V-01` 做跨场景聚合兜底，但单个场景的许可断言仍可能在空集时失去意义。
- E2E 运行会真实消耗 DeepSeek 配额（每个场景 1–3 次调用）。
  `backend-verify` 的限流测试会打满配额，因此顺序不可颠倒。
- 部署门禁 `wait_for_deploy.mjs` 依赖 `COURSEMAP_EXPECT_BUILD` 与构建指纹比对；
  若 Vercel 或 GitHub Pages 首次部署失败，E2E 会一直等到 `VERIFY_WAIT_MS`（默认 5 分钟）超时，然后对旧构建做断言 —— 因此必须有部署指纹校验，否则会得出错误结论（线上曾发生过一次这种误判）。
- 未覆盖移动端视口（只有桌面 1440×1100）；响应式回归依赖另一套审计。
- 未覆盖无障碍（a11y）与性能指标。
