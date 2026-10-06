# 08 — AI Activation & Grounding（模块 J / K / L / M / N / O）

> 模型审计（模块 I）单独见 [13_DeepSeek_Model_Audit.md](13_DeepSeek_Model_Audit.md)。
> 成本与限流（模块 Q）见 [09_Cost_Control.md](09_Cost_Control.md)。

## Objective

把 AI 从「能调用模型的聊天机器人」变成「只能解释证据的推荐器」。
一句话概括本轮确立的契约：

> **LLM 只解释证据；资源身份、费用、时长、难度、证书、评分、来源全部由 CourseMap Repository 水合。**

## Decision

### K — Grounded Retrieval：固定五段管线

```
用户消息
  ↓ 输入校验（security/inputValidation）
  ↓ 会话上下文合并（ConversationStore · structured constraints，非全量 raw chat）
  ↓ [Stage A] Intent Extraction   —— LLM JSON 输出 + schema 校验
  ↓ StructuredRetriever 检索候选  —— CourseMap Data = Evidence
  ↓ [Stage B] Tool-calling 推理   —— allowlist 工具，参数 untrusted
  ↓ 终局 JSON 校验
  ↓ CODE-ENFORCED 资源 ID 校验     —— 幻觉资源直接剔除 / 拒绝
  ↓ Fact Hydration                —— 全部展示值从 Repository 重取
  ↓ LearningDecisionResponse      —— Evidence-backed 与 General advice 分层
```

设计要点：**Stage A 只做意图，Stage B 只做排序与解释。** 两段都不产出事实。

### L — Real-First Retrieval（但不自动排名第一）

排序顺序（`server/retriever/StructuredRetriever.mjs`）：

```js
retrieve() {
  orderByDifficulty(list, level)   // 1. 先按适配度分层（软偏好，不硬过滤）
  orderByDataClass(list)           // 2. 同一层内 real 优先
  orderByLanguage(list, language)  // 3. 再按语言偏好
  // 预算 / 时长仍为硬约束
}
```

`orderByDataClass` 的排序键：

```js
const rank = (r) => {
  if (r.data_class !== 'real') return 1;
  return (r.verification_status && r.verification_status !== 'unverified') ? 0 : 1;
};
```

**为什么是"同层内优先"而不是"无条件置顶"**：
用户的真实决策包含目标契合度、难度、预算、时间、语言。把 `data_class=real` 直接排到第一位，
等于用数据治理属性覆盖用户偏好 —— 一个完全不对口但"真实"的资源会挤掉对口资源。
所以真实优先只作为**同难度层内的 tiebreaker**，其余维度优先。

**历史踩坑（已修复并有回归测试）**：难度与语言曾经是**硬过滤**，
导致「单细胞 RNA-seq 入门 + intermediate」候选为 0，合法请求返回 `NO_MATCHING_RESOURCE`。
修复为软偏好排序，回归测试 `A-05c` / `A-05d` / `A-05e` / `A-05f` 锁定该行为。

### M — AI 回答契约（每条推荐必须回答的问题）

| 用户问题 | 字段 | 提供者 |
| --- | --- | --- |
| 推荐什么资源 | `title` + `resource_id` | Repository（模型只能引用已存在的 ID） |
| 谁提供 | `provider` | Repository |
| 为什么推荐 | `reason` / `fit_factors` / `tradeoffs` | **模型**（唯一允许模型生成的字段） |
| 多少钱 | `fee` / `currency` | Repository |
| 难度（若已知） | `difficulty` + `level_official` | Repository |
| 多久（若已知） | `duration_hours` / `weekly_workload_hours` | Repository |
| 对应什么学习目标 | `learning_goal_names` | Repository |
| 是否核验 | `verification_status` / `verified_recommendation` | Repository |
| 来源 | `source` / `sources[]` / `source_refs` | Repository |
| 官方链接 | `official_url` | Repository |

### N — Source Citation

见 [05_Source_Provenance.md](05_Source_Provenance.md)。

### O — Unknown Data（未核验字段的处理）

服务端**用代码列出**未核验字段，不指望模型自觉：

```js
const TRACKED_FACT_FIELDS = ['difficulty', 'duration_hours', 'weekly_workload_hours',
                            'certificate_available', 'rating'];
function unknownFieldsOf(resource, ratingSummary) { /* → string[] */ }
```

| 环节 | 行为 |
| --- | --- |
| 服务端 | 把 `unknown_fields` 与 `grounding.unknown_fields` 写入响应；在 `uncertainties` 中说明「以下字段 CourseMap 当前未核验，AI 不会给出数值」 |
| Prompt | Stage B 指令含「If a fact is null in the evidence, mention it as "CourseMap 当前未核验该字段" — never estimate it」 |
| 前端（AI 页） | 每个未核验字段渲染为「CourseMap 当前未核验该字段」，带 `data-coursemap-unknown-field` 属性 |
| 前端（资源页） | 缺描述 → 「官方描述未核验」；缺学习产出 → 「官方页面未提供结构化字段，CourseMap 不代为撰写」 |

**关键验证**：测试 `T-01` 让 Mock 模型**故意返回** `duration_hours: 42`，断言最终响应里该字段仍是 `null`。
这证明防线在代码里，不在 prompt 里。

### P — REAL AI ≠ ALL DATA REAL

见 [04_Demo_Real_Separation.md](04_Demo_Real_Separation.md)。

## Implementation

| 文件 | 关键变化 |
| --- | --- |
| `server/config.mjs` | `DEEPSEEK_MODEL` 默认 `deepseek-v4-flash`（官方当前模型表，2026-10-06 核验）；新增 `thinking` / `reasoningEffort`；`maxOutputTokens` 2000 → 2400 |
| `server/llm/DeepSeekAdapter.mjs` | 新增 `#modelParams()`（thinking 开关）；`chatJSON` 对空 content 重试最多 2 次；thinking 模式下把 `reasoning_content` 回传；记录**实际服务的模型**（`servedModel`） |
| `server/repo/CourseMapRepository.mjs` | `orderByDataClass` / `dataClassCounts` / `licenseSummaryFor` / `goalById` |
| `server/retriever/StructuredRetriever.mjs` | 三段排序；返回 `data_class_counts`；紧凑候选新增 `level_official` / `has_official_source` / `license` |
| `server/orchestrator/AIOrchestrator.mjs` | `unknownFieldsOf` / Fact Hydration 扩展 / `data_class_counts` / `grounding` / 混合构成披露 |
| `server/prompts/learning-advisor-v1.mjs` | SYSTEM_PROMPT 增加 null 字段、许可语义、接地顺序三节；Stage B 规则重写 |
| `server/httpHandler.mjs` | health 返回 `model` / `thinking` / `data_class_counts`；`meta.version` → `v0.3-Data1` |
| `.env.example` | 模型名更新，新增 thinking / effort / max output / allowed origin |
| `js/pages/advisor.js` | Fact Hydration 二次校验、未核验字段渲染、REAL/DEMO 分别徽标、grounding 展示 |

## Tests

| 断言 | 覆盖 |
| --- | --- |
| `A-17b` | 推荐事实由 Repository hydrate |
| `A-18` | 幻觉资源 → `INVALID_MODEL_OUTPUT` |
| `A-19` | 模型报错 fee，展示仍为 Repository 值 |
| `A-19b` / `A-19c` | `path_ref` 数字/字符串均可，学习路径不被静默丢弃 |
| `A-20` / `A-20b` | Prompt injection 被当作 DATA，无副作用 |
| `A-21` | 无匹配目标 → `NO_MATCHING_RESOURCE` |
| `R-03b` ~ `R-03m` | 真实资源的完整水合链 |
| `R-04` / `R-04b` / `R-04c` | 混合推荐披露与 `verified_recommendations` 计数 |
| `S-01` / `S-01b` / `S-01c` | 幻觉 ID 混合时剔除并记录 |
| `S-02` | 仅幻觉 ID → 拒绝回答 |
| `T-01` ~ `T-05d` | 未核验字段不得被编造；指令含约束 |
| `M-00` ~ `M-03` | 公网页面处于 REAL LLM 模式且同时声明数据构成 |
| `Sx-05` | DOM 层费用/时长等于 CourseMap 数据（未核验字段如实标注） |

## Result

- 五段管线全部落地，每一段都有对应测试。
- 幻觉防线在两个层级生效：
  1. 服务端：不存在的 `resource_id` 被剔除；若剔除后无有效推荐 → 拒绝整个回答；
  2. 前端：`renderAiRec()` 中对 `hydrate()` 返回 `null` 的推荐**直接不渲染**（第二道防线）。
- 未核验字段在服务端、prompt、前端三处一致处理；模型"编数字"被代码覆盖。
- 真实资源优先排序生效但不独占首位。
- `grounding` 元信息使「证据约束」可被前端展示、可被测试断言。

## Known Limitations

- **模型可能不选真实资源**：检索层已把真实资源在同难度层内置前，但 Stage B 由模型决定最终排序。
  因此"本次推荐是否包含真实资源"**不是确定性结果**。公网 E2E 的 `V-01` 断言跨场景聚合（≥1 条真实推荐），
  而非要求每个场景都有 —— 这是对模型行为的诚实建模，不是放宽标准。
- **两阶段调用 = 两次计费**：Stage A + Stage B 各一次 LLM 调用（Stage B 可能还有工具轮次）。
  延迟与成本都高于单次调用；`maxOutputTokens` 与 thinking 模式已做约束（见模块 Q）。
- `unknownFieldsOf` 的字段清单是硬编码的 5+2 项。新增事实字段时必须同步更新，
  否则会出现「字段为 null 但未被告知模型」的静默缺口。
- 前端 `renderAiRec` 对幻觉推荐"不渲染"，意味着**不会告诉用户"AI 引用了不存在的资源"**。
  这是静默降级（服务端已拒绝整个回答的情形除外）。更严格的做法是显式提示。
- 学习路径（`learning_path`）的 `ai_generated_schedule` 属于模型生成内容，与 `evidence_backed.steps` 严格分层显示；但两者在同一张卡片上，视觉区隔依赖样式而非结构。
