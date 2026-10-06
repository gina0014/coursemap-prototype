# 17 · 生产缺陷修复记录（Production Defect Remediation）

> 本文记录 **CI 生产验证证据首次揭示的真实线上失败**，以及针对它们的代码级修复。
> 输入证据：`docs/ai-integration/evidence/30_live_public_verification.txt`
> （提交 `3627854`，由 GitHub Actions `live-verify / backend-verify` 产出）
>
> 结论先行：**48 项检查 PASS 41 / FAIL 7**。7 条失败中没有一条是「模型不会答」，
> 全部是**平台侧把可恢复的情况处理成了硬失败**，或**验证器自身写错**。

---

## 0. 为什么这一轮必须做

上一轮（Data-1）在本机跑出了「全绿」，但本机**无法访问 `*.vercel.app`**，
那 2 条生产门禁只能标 `BLOCKED`。用户完成 push 后，CI 立刻把真实结果写回仓库：

```
Total 48  PASS 41  FAIL 7  WARN 0
VERDICT: FAIL
```

这件事本身就是方法论上的一个正面证据：
**「本机全绿」与「线上正确」是两件事；只有把生产验证做成产物，差异才会显形。**

---

## 1. 失败清单与归类

| 检查 | 现象 | 归类 |
| --- | --- | --- |
| `V-04b` | `build=(none) expect=9c5e37ddf0c2` | **验证器缺陷**：读错了 JSON 路径 |
| `S2-00` | `502 INVALID_MODEL_OUTPUT` | **产品缺陷**：模型输出解析过脆 |
| `M-00` | `502`（同上） | 同 S2-00 |
| `M-01` | `400` | S2-00 的**级联**（第 1 轮失败 → 会话未落库 → 第 2 轮无目标） |
| `I-01` | `502 INVALID_MODEL_OUTPUT` | 同 S2-00（对抗性输入更易触发） |
| `H-02` | `status=400 leaked=false` | **验证器过严** + **服务端语义错误** |
| `V-08` | `statuses=200,502,200` | 上述 502 的聚合反映 |
| （health） | `model: "deepseek-chat"` | **平台配置遗留**退役模型名 |

---

## 2. DEFECT-D1（严重）· 模型输出解析过脆 → 502 INVALID_MODEL_OUTPUT

### 现象
`S2-00` / `M-00` / `I-01` 三条独立请求都返回
`{"success":false,"error":{"code":"INVALID_MODEL_OUTPUT","message":"AI 返回格式异常，请重试。"}}`。

### 根因
修复前的实现（`DeepSeekAdapter.chatJSON` + `AIOrchestrator` Stage B 各一份，逻辑重复）：

```
text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'').trim() → JSON.parse(...)
```

它只在模型**完全听话**时成立。真实模型会：

1. 在 JSON 前后加解释（`这是推荐结果：{...}`）→ `JSON.parse` 直接失败；
2. 输出 markdown 围栏但**围栏未闭合**（被 `max_tokens` 截断）→ 剥离正则匹配不到；
3. 最后一个元素后留**尾逗号**（`{"a":1,}`）→ `JSON.parse` 失败；
4. 字符串值里含右花括号或「逗号+右花括号」→ 天真的前后缀剥离会**切错位置**。

更糟的是旧重试策略：解析失败后**原样重发同一条请求**。
对确定性错误（截断、格式偏好）原样重发只是白花一次配额，再失败一次。

### 修复
新增 `server/llm/jsonUtil.mjs`（纯函数、零依赖、可穷举测试）：

- `extractJsonObject(text)` 四级提取：
  整体解析 → 去围栏（含未闭合尾栏）→ **字符串感知**的平衡括号扫描
  （正确处理 `"` 与 `\` 转义，因此 `{"note":"包含 } 的字符串"}` 不会被切错）
  → 首尾括号宽切兜底（应对截断）。
- `removeTrailingCommas()` 只在**字符串之外**删尾逗号
  （纯正则会把字符串里的 `,}` 一起改掉 —— 那正是要避免的）。
- **修不回来就返回 `null`**。它不补字段、不改数值、不把 `null` 变 `0`。
  缺字段由上层 schema 校验拒绝。**绝不返回一个「看起来像 JSON」的编造对象。**

`DeepSeekAdapter` 侧的两点行为修正：

- `chatJSON` 第 2 次尝试**改变请求**：追加 `JSON_REPAIR_HINT`（挂在最后一条
  user 消息末尾，避免出现两条连续 user 消息被上游拒绝）+ 提高 token 预算
  到 `DEEPSEEK_MAX_OUTPUT_TOKENS_RETRY`（默认 4000）。
- `chatWithTools` 新增 `expectJson`：终局轮解析失败时追加**一轮收口重问**，
  且该轮**不再提供 tools**（`forceClose`）——强制模型输出文本 JSON，
  而不是又发起一次工具调用把重试机会浪费掉。
- 失败详情改为携带诊断线索（`finishReason` / `empty` / `truncated` / `chars`），
  且**不含密钥**。

### 证据
`tests/ai/model-output.test.mjs`（33 条断言，替换 `globalThis.fetch` 注入脚本化响应，
真实走适配器代码路径但零网络、零密钥）：

- `J-22` `finish_reason=length` 但 JSON 可解析 → **成功**（旧实现 502）
- `J-23/J-24/J-25` 首次不可解析 → 重试成功；且断言第 2 次请求**确实变了**
  （含修复指令、token 预算未降低）
- `J-27/J-28` 两次都失败 → 抛 `INVALID_MODEL_OUTPUT` 且 `status=502`
  （**诚实的失败，不伪造成功**），详情含诊断线索且不含密钥
- `J-29` 带围栏 JSON 直接解析，**不产生额外轮次**（不无谓增加成本）
- `J-30/J-31/J-32` 收口重问：成功、保持角色交替、已去掉 tools

---

## 3. DEFECT-D2（严重）· 平台遗留退役模型名

### 现象
生产 health 公开回报 `"model":"deepseek-chat"` —— 该名称已于
**2026-07-24 15:59 UTC 永久停用**（见 `13_DeepSeek_Model_Audit.md`）。
而同一份证据里 advisor 响应回报 `model=deepseek-flash`（上游实际服务名）。

### 根因
两件事叠加：

1. 代码默认值在上一轮已从 `deepseek-chat` 修正为 `deepseek-v4-flash`；
2. 但 **Vercel 平台上仍留着 AI-1 阶段设置的 `DEEPSEEK_MODEL=deepseek-chat`**。
   环境变量优先级高于默认值 → 代码里的默认值修正**没有生效**。

而且此前的可观测性不足以发现它：health 只公布了**一个** `model` 字段，
无法区分「代码默认值」与「平台变量覆写」。生产验证里那行
`adapter=deepseek model=deepseek-flash` 来自响应体（上游回传的服务模型），
与 health 的配置值是两个不同的东西，读起来还会互相矛盾。

> 本机验证天然发现不了这一条：本机没有 Vercel 的环境变量。
> **配置类缺陷只存在于「平台上的那份配置」里。**

### 修复
`server/config.mjs` 引入 **Deprecation Map**（代码里必须「写死」退役名，
但目的不是使用它们，而是**识别**它们）：

```js
export const RETIRED_DEEPSEEK_MODELS = Object.freeze({
  'deepseek-chat':     'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-flash',
});
```

- 命中退役名 → 用映射后的**当前模型**发起调用（避免打到已下线模型）；
- 同时把「配置值 ≠ 生效值」暴露出去：health 新增
  `configured_model`（平台写了什么）与 `model_deprecated`（是否发生映射）。
  `model_deprecated=true` 即明确告诉运维：**该改的是平台变量，不是代码**；
- **不静默改写成看似正常的配置** —— 那只会把问题藏起来。

生产验证侧新增两条闸门并修好一条：

- `V-04b`（**修验证器缺陷**）：`build` 位于响应的 **meta**，旧代码读的是 `data.build`
  → 恒为 `(none)` → **每一次生产验证都假失败**。这类「闸门自身写错于是永远 FAIL」
  和「永远 PASS」一样危险：会训练人忽略它。
- `V-04c`（新增）：health 的 `model` 必须落在官方当前模型表内。
- `V-04d`（新增）：`model_deprecated` 必须为 `false` ——
  不允许「靠上游静默别名兜底」被当成正常。

测试侧把原先的粗暴检查升级为精确契约（`tests/ai/data1.test.mjs` `I-06` 系列）：

| 断言 | 契约 |
| --- | --- |
| `I-06` | 退役/拼错模型名不得出现在**取值位置**（`envStr` fallback、`model:` 赋值、`=` 右侧、`.env` 的 `KEY=VALUE`） |
| `I-06b` | 退役名在 `config.mjs` 中**只允许**作为 Deprecation Map 的**键**出现 |
| `I-06c` | `.env.example` 的 `DEEPSEEK_MODEL` 是当前受支持模型 |
| `I-06d/e/f` | 映射表覆盖两个退役名，且迁移目标全部是当前受支持模型；默认常量本身不是退役名 |
| `I-06g` | `CONFIG` 同时暴露 `configuredModel` 与 `model` |

> **为什么不能继续用「全文件 grep 字面量」**：那会把「识别退役名的机制」和
> 「使用退役名的缺陷」一起判红，从而逼迫后来者**删掉那张表** —— 那才是真正危险的：
> 平台变量一旦遗留退役名，就再没有任何代码能发现它。

---

## 4. DEFECT-D3（中）· 「识别不出目标」被当成请求格式错误

### 现象
`H-02`（诱导不存在的 `resource_id`）返回 `status=400`，被记为 FAIL。
`M-01` 同样 `400`。

### 根因
服务端在「模型没抽出 `goal`」时抛 `BAD_REQUEST / 400`：

```js
if (!finalIntent.goal) throw new ApiError(ERROR_CODES.BAD_REQUEST, '未能从你的描述中识别学习目标…', 400);
```

请求本身**完全合法**（message 非空、长度合规、JSON 合法），只是内容映射不到任何
CourseMap 目标。把它报成 400 有两重危害：

1. 前端与 CI 会把 400 读成「客户端 bug」，掩盖真实的「没听懂」；
2. 与既有的 `NO_MATCHING_RESOURCE / 404`（`N-00`）语义冲突 —— 同一件事两种码。

`M-01` 的 400 还是 `M-00` 502 的**级联**：第 1 轮失败 → 约束未落库 →
第 2 轮「把预算改成 0 元」单独看没有目标 → 再次 400。

### 修复
统一为 **404 `NO_MATCHING_RESOURCE`**，并保留可执行的下一步提示
（换一种说法 / 去「找课程」）。这条修复让「系统其实正确地拒绝了」不再被记成失败。

`H-02` 的断言也一并修正：它检验的是**泄漏**，不是某个状态码。

```js
// 旧：200 ? !leaked : (404 || 502)      ← 把「正确拒绝」记成 FAIL
// 新：!leaked && status !== 500          ← 只保留真正的负向契约
```

### 证据
`tests/ai/unit.test.mjs` `A-21b/c/d`：
目标识别失败 → `NO_MATCHING_RESOURCE` + `status=404` + 含「找课程」提示 +
**明确断言不是 `BAD_REQUEST`**。

---

## 5. 修复后的离线复现

```
数据校验（rules v0.2 + VR-C18）
  resources: 48 demo + 59 real = 107
  sources:   2 demo + 59 real = 61
  real resources without Source: 0
  BLOCKER: 0  ERROR: 0  WARN: 212  → PASS

测试（8 个套件，全 Mock，零网络零成本）
  runtime 86 · ai-unit 81 · ai-routing 10 · ai-integration 10
  data1 72 · model-output 33 · oer-expansion 88 · featured-oer 15
  ──────────────────────────────────────────────
  合计 395 条断言，FAIL = 0

密钥扫描：files scanned 180 · git-history added-line findings 0 · SECRET LEAK = 0

最终门禁（Module Y）
  PASS 12 · FAIL 0 · BLOCKED 2（Y-06 真实 DeepSeek 调用、Y-13 公网 E2E）
  判决 PARTIAL —— 这两条只能在生产连通性下发声，需 CI 在**本次推送的 commit** 上重跑
```

---

## 6. 本轮修掉的「假信心」

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| `V-04b` 部署指纹 | 读错路径 → 每次都假失败 | 读 `meta.build`，真正校验部署一致性 |
| `H-02` 负控制 | 把「正确拒绝」判 FAIL | 只断言「不泄漏 + 不崩溃」 |
| `I-06` 模型名审计 | 全文件 grep → 逼人删掉识别机制 | 区分**取值位置**与**识别表** |
| health 模型可观测性 | 一个 `model` 字段，无法区分来源 | `model` + `configured_model` + `model_deprecated` |
| 解析失败详情 | 只有 `{stage:'B'}` | `finishReason` / `empty` / `truncated` / `chars`（不含密钥） |

**共同模式**：前四项都属于「闸门/断言本身写错」。
它们不会让系统崩溃，但会让**验证结果失去信息量** —— 要么永远红（被忽略），
要么永远绿（掩盖回归）。这与「靠 prompt 求模型别幻觉」是同一类错误的两种表现：
把本该由代码保证的事情，交给了一个不可靠的观察者。

---

## 7. 已知限制（不掩盖）

1. **Vercel 上的 `DEEPSEEK_MODEL` 仍需人工修正。** 代码已能自动映射并公开
   `model_deprecated=true`，但「依赖映射兜底」不是目标状态。
   用户应把平台变量一并改为 `deepseek-v4-flash`。
2. **本机无法执行生产验证。** `*.vercel.app` 在本机 DNS/SNI 不可达；
   `Y-06` / `Y-13` 只能由 GitHub Actions 在真实网络上执行。
3. **Stage B 的 4000 token 预算是经验值，不是官方上限。** 若候选集继续增长
   仍可能截断；届时需要的是「减少 Stage B 输出体积」（如分批推荐），
   而不是继续加预算 —— 这一点已写进配置注释。
4. **`V-04c/V-04d` 尚未在真实生产上跑过。** 它们随本次提交进入 CI，
   首次执行结果未知；只有拿到 `30_*` 新证据才算闭环。

---

## 8. 相关文件

| 文件 | 变更 |
| --- | --- |
| `server/llm/jsonUtil.mjs` | **新增**：稳健 JSON 提取 + 修复指令 |
| `server/llm/DeepSeekAdapter.mjs` | `chatJSON` 修复轮；`chatWithTools` 的 `expectJson`/`forceClose` |
| `server/llm/MockLLMAdapter.mjs` | 对齐 `expectJson` 接口 |
| `server/config.mjs` | Deprecation Map；`configuredModel` / `modelDeprecated` / `maxOutputTokensRetry` |
| `server/httpHandler.mjs` | health 增加 `configured_model` / `model_deprecated` |
| `server/orchestrator/AIOrchestrator.mjs` | 复用 `extractJsonObject`；`expectJson`；无目标 → 404 |
| `tests/ai/model-output.test.mjs` | **新增** 33 条断言 |
| `tests/ai/unit.test.mjs` | 新增 `A-21b/c/d` |
| `tests/ai/data1.test.mjs` | `I-06` 系列重写为 7 条精确契约 |
| `scripts/verify/live_public_verify.mjs` | 修 `V-04b`；新增 `V-04c/V-04d`；修 `H-02` |
| `.env.example` | 新增 `DEEPSEEK_MAX_OUTPUT_TOKENS_RETRY` 与平台变量告警说明 |
