# 07 — Data Validation（模块 H）

## Objective

把「真实数据不得靠猜」从一句口号变成**可执行的机器规则**，并且让每一条规则在违规时有明确的严重级别与处置后果。

## Decision

**三级严重级别**

| 级别 | 含义 | 后果 |
| --- | --- | --- |
| `BLOCKER` | 违反则数据**不得发布** | 校验失败，退出码非 0，CI 拦截 |
| `ERROR` | 结构或语义错误，必须修 | 校验失败，退出码非 0，CI 拦截 |
| `WARN` | 数据不完整但可发布 | 记录并计数，不拦截 |

**v0.2 新增规则（真实数据专项）**

| ID | 级别 | 规则 |
| --- | --- | --- |
| VR-C11 | BLOCKER | REAL 资源缺少官方 URL |
| VR-C12 | BLOCKER | 许可状态不明确的来源被表示为开放许可（`unknown` 却声明 `commercial_use=true` / `public_domain=true`） |
| VR-C13 | BLOCKER | REAL 资源的 `fee` 是猜的值（非 `null` 但无来源在 `source_verified_fields` 中声明 `fee`） |
| VR-C14 | BLOCKER | REAL 资源的 `certificate_available` 是猜的值 |
| VR-C15 | BLOCKER | REAL 资源的 `rating` / `rating_count` 是猜的值 |
| VR-C16 | BLOCKER | REAL 资源的 `duration_hours` / `weekly_workload_hours` 是猜的值 |
| VR-E10 | ERROR | REAL 资源缺少 `observed_at` |
| VR-E11 | ERROR | 来源关系无效（与 `resource-source` 不一致，或引用不存在的 `source_id`） |
| VR-E12 | ERROR | REAL 资源绑定的 Source 缺少许可元数据（`license` / `license_url` / `observed_at` / `verification_status` 任一缺失） |
| VR-E13 | ERROR | REAL 资源缺少 `verification_status` |
| VR-W06 | WARN | REAL 资源缺少描述（允许为空，但前端必须显示「官方描述未核验」） |

v0.1 全部规则继续生效（`supersedes` 字段显式声明继承关系）。

**核心判定机制：`source_verified_fields`**

规则 C13–C16 的实现方式是本模块的关键设计：

```
对每条 REAL 资源 r：
  取 r 的所有绑定来源，收集它们声明的 source_verified_fields 并集 V
  对每个「事实字段」f ∈ {fee, certificate_available, rating, rating_count,
                          duration_hours, weekly_workload_hours}：
    if r[f] !== null and f ∉ V  →  BLOCKER
```

含义：**一个事实字段只要能取到值，就必须能指出"是哪个来源声明了它"。**
这个机制在第一次运行时就抓到了 4 个真实 BLOCKER（OpenStax 的 `fee` 未列入核验清单），
证明它不是形式化的规则 —— 它确实在拦真实的错误。

**`final_principle`（写入规则文件本身，供人与机器共同引用）**

```
free access != open license
open license != public domain
real LLM    != real data
LLM knowledge != CourseMap evidence
```

## Implementation

**规则真源**：`data/schema/validation-rules-v0.2.json`
**执行器**：`scripts/validate/validate_data.py`

执行器新增 REAL 规则块（插在 VR-C10 之后）：

```python
verified_fields_by_res = {}     # resource_id -> 声明了哪些字段
source_by_id           = {}     # source_id -> source 行
UNKNOWN_LICENSE_TOKENS = {'', 'unknown', 'n/a', 'none', None}

for r in resources:
    if r.get("data_class") != "real":
        continue
    # VR-C11  official_url 必须存在且为 http(s)
    # VR-C12  许可 unknown 时不得声明 commercial_use / public_domain
    # VR-C13..C16  事实字段非 null 必须在 source_verified_fields 中
    # VR-E10  observed_at 必须存在且为 ISO 日期
    # VR-E11  resource.source_ids 与 resource-source 关系必须一致
    # VR-E12  绑定 Source 必须同时具备 license / license_url / observed_at / verification_status
    # VR-E13  verification_status 必须存在
```

输出格式（便于人工与 CI 双读）：

```
CourseMap data validation (Data-1 · rules v0.2)
  resources: 48 demo + 40 real = 88
  sources:   2 demo + 40 real = 42
  real resources without Source: 0
  BLOCKER: 0  ERROR: 0  WARN: 149
PASS
```

`PASS` 仅在 `BLOCKER == 0 and ERROR == 0` 时输出，退出码 0；否则列出全部违规并退出码 1。

## Files

| 文件 | 变化 |
| --- | --- |
| `data/schema/validation-rules-v0.2.json` | **新增**（supersedes v0.1） |
| `scripts/validate/validate_data.py` | 新增 REAL 规则块；输出增加 demo/real 分解与 `real resources without Source` 计数 |
| `js/pages/resource.js` | 落实 VR-W06：真实资源缺描述时显示「官方描述未核验」而不是留白 |
| `.github/workflows/live-verify.yml` | `offline-gates` job 强制执行校验 |

## Tests

**校验器本身**：`python scripts/validate/validate_data.py` → `PASS`（BLOCKER 0 / ERROR 0）

**校验器的"反例测试"（真实发生）**

| 触发 | 期望 | 实际 |
| --- | --- | --- |
| OpenStax `fee=0` 但 `source_verified_fields` 不含 `fee` | VR-C13 BLOCKER × 4 | ✅ 命中 4 条 |
| 关系行缺 `data_class` 导致幂等失效 | 关系数增长 | ✅ 由 `keepDemo` 修复后稳定 88 |

> 「校验器能抓到错误」比「校验器通过」更重要。本轮的做法是：先让校验器报错，确认错误是真实的，再修数据而不是修规则。

**下游测试对规则结果的依赖**

| 断言 | 覆盖 |
| --- | --- |
| `R-00c` | ID 区间分离（对应 VR-C05 的延伸） |
| `T-00` / `T-01` | 未知字段为 `null`（对应 VR-C16 的正向验证） |
| `U-04c` | 无真实来源被误标公有领域/可商用（对应 VR-C12） |
| `runtime.test.mjs` T-21e | 每条真实资源至少 1 个带 http `official_url` 的来源（对应 VR-C11） |
| `runtime.test.mjs` T-21f | 每条真实资源有 ISO `observed_at`（对应 VR-E10） |
| `runtime.test.mjs` T-21g | 每条真实资源 `verification_status ≠ unverified`（对应 VR-E13） |
| `runtime.test.mjs` T-21k | 许可布尔值显式为 `true`/`false` |
| `runtime.test.mjs` T-21l | NonCommercial 未被标为商用/公有领域（对应 VR-C12） |

即：**同一条数据治理约束同时被"Python 校验器"和"Node 运行时测试"两道独立实现检查**。
任何一道失效，另一道仍会拦下。

## Result

- v0.2 规则文件上线，新增 11 条真实数据规则，覆盖来源、许可、观测时间、关系一致性、猜测字段五个维度。
- 校验器输出 `BLOCKER: 0  ERROR: 0  WARN: 149  PASS`。
- `real resources without Source: 0`。
- 校验器在接入过程中真实拦下 4 个 BLOCKER，已修复数据（而非放宽规则）。
- 149 条 WARN 全部为「字段缺失但有诚实呈现」的可接受项（时长、周投入、证书、描述、前置技能），
  且每条都有对应的前端措辞（`—` / 「官方描述未核验」/「CourseMap 当前未核验该字段」）。

## Known Limitations

- **WARN 数量偏大（149 条）**：真实 OER 的元数据天然稀疏，149 条 WARN 中大部分集中在
  `duration_hours` / `weekly_workload_hours` / `certificate_available`。这不是可修复项，
  而是「只保存官方披露字段」策略的必然代价。WARN 阈值尚未按领域设定，因此噪声较大。
- **校验器是"白名单式"的**：它只能发现"声明了但无来源"的字段，无法发现"官方其实有披露、但 CourseMap 漏写了"的字段（漏报）。
- 规则实现是 Python 单文件、命令式 `if` 序列；规则数量增长后建议改为「规则文件驱动 + 通用断言引擎」，
  否则每加一条规则都要改执行器代码。
- 未实现跨数据集版本比对（例如"上一轮 40 条真实来源的许可是否被提供方修订"）。这属于后续的数据治理能力。
