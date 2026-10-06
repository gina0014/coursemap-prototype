# 10 — AI Acceptance Tests（模块 R / S / T / U）

## Objective

把「AI 是不是真的接上了」「AI 会不会编课程」「AI 会不会编数字」「AI 会不会把免费说成可商用」
这四个问题，变成**可重复执行、可断言、零成本、离线可跑**的测试。

## Decision

**测试分层：Mock 优先，真实调用只做最终确认。**

| 层 | 文件 | 是否调用真实 DeepSeek | 作用 |
| --- | --- | --- | --- |
| 数据运行时 | `tests/runtime.test.mjs` | 否 | 数据集契约（含真实数据不变量） |
| AI 单元 | `tests/ai/unit.test.mjs` | 否 | 适配器/仓储/检索/工具/水合 |
| AI 路由 | `tests/ai/routing.test.mjs` | 否 | 路由与配置卫生 |
| HTTP 集成 | `tests/ai/integration.test.mjs` | 否 | 限流/CORS/envelope/错误映射 |
| **Data-1 验收** | **`tests/ai/data1.test.mjs`（本轮新增）** | 否 | **R / S / T / U 四个模块** |
| 真实调用 | `tests/ai/live.deepseek.test.mjs` | 是（有 Key 才跑） | 端到端真实链路 |
| 公网 E2E | `scripts/verify/public_e2e.mjs` | 是（经生产后端） | 前端 → Vercel → DeepSeek → CourseMap |

**为什么 R/S/T/U 必须用 Mock 而不是真实调用**：
真实调用的输出不可复现（同一 prompt 两次结果不同），无法作为回归断言。
所以把「行为契约」用 Mock 在**确定性**条件下锁定，再用真实调用做一次「链路确实通了」的确认。
两种测试回答的是不同问题，不能互相替代。

## Implementation

`tests/ai/data1.test.mjs` —— 64 项断言，零网络、零成本。结构：

```js
const repo      = getRepository();
const retriever = new StructuredRetriever(repo);
const realPy    = repo.orderByDataClass(repo.getResourcesByGoal(1, 200))
                      .find((r) => r.data_class === 'real');

function mkOrchestrator(mock) {
  return new AIOrchestrator({ adapter: mock, repository: repo, retriever,
    conversationStore: new ConversationStore(), usageLogger: new UsageLogger() });
}
```

### R — Real AI Test

**场景**：`我是零基础大学生，想免费学 Python`（Module R 原文场景）。

| 断言组 | 内容 |
| --- | --- |
| `R-00` / `R-00b` / `R-00c` | 数据集含真实资源与来源；真实/演示 ID 区间严格分离 |
| `R-01` / `R-01b` / `R-01c` | 「Python 入门」检索命中真实资源；返回 `data_class_counts` |
| `R-02` / `R-02b` | `orderByDataClass` 在同层内 real 优先，且不丢元素 |
| `R-03` ~ `R-03m` | 端到端：`data_class='real'`、`official_url` 为 https 且与 Repository 一致、`license` 非空、`sources[]` 全带官方链接、`verified_recommendation=true`、`fee` 为 Repository 值、`grounding.verified_recommendations ≥ 1`、`evidence` 绑定 `source_refs`、`learning_goal_names` 非空 |
| `R-04` / `R-04b` / `R-04c` | 混合推荐两条都保留、混合构成被披露、`verified_recommendations` 只计真实 |

**关键断言示例**（`R-03e`）：
```js
check('R-03e', 'official_url 与 Repository 的 url 一致（不伪造）',
  rec0.official_url === repo.getResourceById(realPy.resource_id).url);
```
这条断言的意义是：官方链接**必须**与数据层完全一致，任何"模型自己写的 URL"都会被这条测试拦下。

### S — Hallucination Test

| 断言 | 场景 | 期望 |
| --- | --- | --- |
| `S-01` | 幻觉 ID + 真实 ID 混合 | 只保留真实，`recommendations.length === 1` |
| `S-01b` | 同上 | `rejected_resource_ids` 记录幻觉 ID |
| `S-01c` | 同上 | 幻觉 ID 不出现在 `recommendations` / `evidence` |
| `S-02` | 只有幻觉 ID | **拒绝整个回答**（`INVALID_MODEL_OUTPUT`） |
| `S-03` | 不存在的学习目标（「量子炼丹与时空穿梭」） | `NO_MATCHING_RESOURCE`（友好语义） |
| `S-04` | 同上 | 检索候选为 0（不靠模糊匹配编造） |

### T — Unknown Field Test

| 断言 | 场景 | 期望 |
| --- | --- | --- |
| `T-00` | 数据事实 | 被测真实资源 `duration_hours === null` |
| `T-01` | Mock 模型**故意返回** `duration_hours: 42` | 最终响应中仍为 `null` |
| `T-01b` / `T-02` | — | `unknown_fields` 含 `duration_hours` / `rating` |
| `T-03` | — | `uncertainties` 含「未核验」且含「不会给出数值」 |
| `T-04` | — | `grounding.unknown_fields` 非空 |
| `T-05` | Prompt 内容 | Stage B 指令含「CourseMap 当前未核验该字段」 |
| `T-05b` | Prompt 内容 | 指令禁止模型输出 fee/duration/certificate/rating/license |
| `T-05c` | Prompt 内容 | 指令禁止编造 resource_id |
| `T-05d` | Prompt 内容 | 指令禁止把 NonCommercial 升级为 public domain / commercial |
| `T-06` | — | SYSTEM_PROMPT 声明 null/unknown 不得猜测 |

`T-01` 是本模块最有价值的一条：它证明「不编数字」这件事**由代码保证**，
而不是依赖模型的自觉。模型即使返回 42，水合层也会把它覆盖为 `null`。

> 测试修正记录：`T-05b` 初版断言 prompt 里含中文「禁止」，但 prompt 是英文
> （`Do NOT output fee / duration / ...`），因此断言失败。
> 判断：**是断言写错了，不是 prompt 有问题**。修正为断言英文契约本身
> （`Do NOT output fee` + 字段名），并补充 `T-05c` / `T-05d` 覆盖另两条禁令。

### U — License Test

| 断言 | 内容 |
| --- | --- |
| `U-01` | MIT OCW 许可精确等于 `CC BY-NC-SA 4.0` |
| `U-01b` / `U-01c` | 明确 `public_domain === false` / `commercial_use === false` |
| `U-01d` | `attribution_required === true` 且 `share_alike === true` |
| `U-01e` | 许可链接为 http(s) |
| `U-02` / `U-02b` | OpenStax 同为 CC BY-NC-SA 4.0 且非公有领域 |
| `U-03` | **同一许可名下 AI 训练权限相反**（OCW `true` / OpenStax `false`） |
| `U-04` ~ `U-04c` | 所有真实来源都带许可与官方链接；无一被误标公有领域/可商用 |
| `U-05` ~ `U-05c` | `licenseSummaryFor()` 返回布尔语义且 `public_domain=false` |
| `U-06` | SYSTEM_PROMPT 声明 Free ≠ Open ≠ Public Domain ≠ Commercial |

### I — Model Audit（与 R/S/T/U 同文件）

见 [13_DeepSeek_Model_Audit.md](13_DeepSeek_Model_Audit.md)。`I-01` ~ `I-06` 共 7 项断言。

## Files

| 文件 | 变化 |
| --- | --- |
| `tests/ai/data1.test.mjs` | **新增**（57 → 含 I 段后 64 项断言） |
| `tests/runtime.test.mjs` | T-05 边界更新；T-07 真实/演示 `rating_count` 区分；T-21 系列重写为真实数据不变量（`T-21d` ~ `T-21l`） |
| `package.json` | `test` / `test:ai` 纳入 `data1.test.mjs`；新增 `test:data1` |
| `.github/workflows/live-verify.yml` | `offline-gates` job 执行 `npm test` |

## Result

```
tests/runtime.test.mjs            PASS: 84   FAIL: 0
tests/ai/unit.test.mjs            PASS: 78   FAIL: 0
tests/ai/routing.test.mjs         PASS: 10   FAIL: 0
tests/ai/integration.test.mjs     PASS: 10   FAIL: 0
tests/ai/data1.test.mjs           PASS: 64   FAIL: 0
```

- R / S / T / U 四个模块全部有可执行断言，零网络零成本。
- 幻觉防线、事实水合、未核验字段、许可语义四类"AI 常见失真"全部由测试锁定。
- 测试在修复过程中真实发现了 1 处断言错误（`T-05b`）与 1 处数据缺陷（OpenStax `fee` 未列入核验清单），均已修正。

## Known Limitations

- **Mock 无法验证真实模型的服从度**：`S-02` 证明"如果模型给幻觉 ID 会被拦"，
  但不能证明"真实 DeepSeek 不会频繁给幻觉 ID"。后者需要真实调用统计（当前样本量太小，无统计意义）。
- `R-03` 系列断言依赖 `realPy`（goal 1 的第一条真实资源）。若数据集中删除该资源，测试会失败 ——
  这是**期望行为**（数据契约变化应当被发现），但需要同步更新测试。
- 测试不覆盖**多轮对话**下的接地（会话上下文与真实资源组合的场景）；
  `unit.test.mjs` 有 `ConversationStore` 的独立测试，但没有"第二轮推荐仍接地"的端到端断言。
- 公网 E2E 中的 AI 断言依赖真实模型行为，因此 `V-01`（真实资源出现在推荐中）设计为**跨场景聚合**而非逐场景断言，以避免测试脆弱。
