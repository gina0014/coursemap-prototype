# 06 — License Semantics（模块 G / U）

## Objective

让用户（和 AI）明确区分四件**看起来相同、法律上完全不同**的事：

```
免费访问  ≠  开放许可  ≠  公有领域  ≠  允许商用
Free       ≠  Open license ≠ Public domain ≠ Commercial use allowed
```

一个只写「免费」的界面，会让用户以为可以任意使用；一个把 CC BY-NC-SA 显示成「开放许可」的界面，
会让用户以为可以商用。两者都是实质性的误导。

## Decision

**1. 许可必须显示为字符串原文，而不是被归类成「开放/受限」。**

UI 显示 `CC BY-NC-SA 4.0`，并链接到 `license_url` 全文。
「免费」是费用属性，「许可」是使用权限属性，二者在 UI 上必须出现在**不同位置**。

**2. 布尔语义必须显式呈现，未知不猜。**

| 字段 | 含义 | 提示语 |
| --- | --- | --- |
| `commercial_use` | 是否允许商用 | `允许商用` / `禁止商用` |
| `public_domain` | 是否公有领域 | `公有领域` / `非公有领域` |
| `adaptation_allowed` | 是否允许改编 | `允许改编` / `禁止改编` |
| `attribution_required` | 是否必须署名 | `必须署名` / `无需署名` |
| `share_alike` | 衍生是否需同许可 | `衍生需同许可` / `无同许可要求` |
| `ai_training_allowed` | 是否允许 AI 训练 | `允许 AI 训练` / `禁止 AI 训练（含 LLM 摄取）` |

值域为 `true` / `false` / `null`；`null` 渲染为「`<字段> 未知`」，**不得回退为任一极**。

**3. 固定语义提示常驻。**
只要展示了许可，就必须同时展示这句话：

> 「免费访问」不等于「开放许可」，也不等于「公有领域」，更不等于「允许商用」。

**4. 数据层禁令（对应校验规则）**

| 规则 | 后果 |
| --- | --- |
| VR-C12 | 未知许可被展示/标记为开放许可 → **BLOCKER** |
| VR-E12 | 真实来源缺少许可元数据 → ERROR |

## Implementation

### 展示层

`js/labels.js` 新增：

```js
export const LICENSE_FLAG = {
  commercial_use:      { true: '允许商用',   false: '禁止商用' },
  public_domain:       { true: '公有领域',   false: '非公有领域' },
  adaptation_allowed:  { true: '允许改编',   false: '禁止改编' },
  attribution_required:{ true: '必须署名',   false: '无需署名' },
  share_alike:         { true: '衍生需同许可', false: '无同许可要求' },
  ai_training_allowed: { true: '允许 AI 训练', false: '禁止 AI 训练（含 LLM 摄取）' },
};
export const LICENSE_SEMANTICS_NOTE = '「免费访问」不等于「开放许可」，也不等于「公有领域」，更不等于「允许商用」。';
```

`js/components.js`：

```js
licenseFlagText(field, value)  // true/false/null → {text, ok}；null → '未知'，不推测
licenseBadge(source)           // 徽标 + title 提示；无 license → 「许可 Unknown」
licensePanel(source)           // 许可全文链接 + 语义提示 + 布尔标志条
```

`licensePanel()` 的分支逻辑：

```js
source.public_domain === true
  ? '该来源为公有领域作品，不受版权限制。'
  : LICENSE_SEMANTICS_NOTE          // 非公有领域 → 常驻警示
```

### AI 层

`server/prompts/learning-advisor-v1.mjs` 的 `SYSTEM_PROMPT_V1` 增加许可语义章节，并要求：

```
- Report any license EXACTLY as given in the evidence; never upgrade a NonCommercial or
  unknown license into "public domain" or "commercial use allowed".
```

即模型无权"升级"许可。

### 真实数据中的许可分布

| 提供方 | 许可 | `commercial_use` | `public_domain` | `ai_training_allowed` |
| --- | --- | --- | --- | --- |
| MIT OpenCourseWare（36 条来源） | `CC BY-NC-SA 4.0` | `false` | `false` | `true`（官方另列「Permitted Use of AI Training」，附条件） |
| OpenStax（4 条来源） | `CC BY-NC-SA 4.0` | `false` | `false` | `false`（官方明确禁止 LLM 摄取） |

**两个提供方许可字符串相同、AI 训练权限相反** —— 这正是「同一许可名 + 不同附加条款」的真实案例，
也是为什么不能靠许可名做归类推断。

## Files

| 文件 | 变化 |
| --- | --- |
| `js/labels.js` | `LICENSE_FLAG` / `LICENSE_SEMANTICS_NOTE` / `SOURCE_VERIFICATION.source_verified` |
| `js/components.js` | `licenseBadge` / `licensePanel` / `licenseFlagText` |
| `js/pages/resource.js` | 溯源区块「官方许可」指标 |
| `js/pages/advisor.js` | 推荐卡「许可」行 |
| `css/components.css` | `.license-panel` / `.license-flags` / `.license-flag--yes|no|unknown` |
| `server/prompts/learning-advisor-v1.mjs` | 许可语义指令 |
| `data/schema/validation-rules-v0.2.json` | VR-C12 / VR-E12 |

## Tests

| 断言 | 位置 | 覆盖 |
| --- | --- | --- |
| `U-01` | `data1.test.mjs` | OCW 许可字符串精确匹配 |
| `U-01b` / `U-01c` | `data1.test.mjs` | 明确非公有领域、明确禁止商用 |
| `U-01d` | `data1.test.mjs` | 署名 + 相同方式共享为 true |
| `U-03` | `data1.test.mjs` | 同一许可名下 AI 训练权限被正确区分 |
| `U-04c` | `data1.test.mjs` | 无真实来源被误标公有领域/可商用 |
| `U-05b` / `U-05c` | `data1.test.mjs` | `licenseSummaryFor` 返回布尔语义且 `public_domain=false` |
| `U-06` | `data1.test.mjs` | SYSTEM_PROMPT 声明 Free ≠ Open ≠ Public Domain ≠ Commercial |
| `T-05d` | `data1.test.mjs` | Stage B 指令禁止把 NC 升级为 PD/商用 |
| `Sx-09` | `public_e2e.mjs` | DOM 许可文本 == Source 许可；且未误显示公有领域/允许商用 |
| `V-03` | `public_e2e.mjs` | 公网真实来源许可语义正确 |
| VR-C12 / VR-E12 | 校验器 | 数据层强制 |

## Result

- 许可以字符串原文 + 布尔语义 + 常驻语义提示三层呈现。
- 40 条真实来源的 `public_domain` 全为 `false`、`commercial_use` 全为 `false`，且已在 UI 上与「免费」明确分开。
- AI 被指令约束为「原样报告许可」，且测试断言该约束确实进入 prompt。
- 校验器对「未知许可当作开放许可」有 BLOCKER 级拦截能力。

## Known Limitations

- **法律意见的边界**：以上呈现是**事实陈述**（官方页面写了什么），不是法律结论。CC BY-NC-SA 的「非商业」在不同司法辖区的解释存在差异，CourseMap 不作判定。
- 许可全文由第三方（`creativecommons.org`）托管，未做本地镜像。
- `ai_training_allowed` 是 CourseMap 对官方条款的**观测归纳**，不是官方字段。OpenStax 的禁止声明明确；MIT OCW 的许可则来自官方单独的 AI Training 条款页面 —— 这类「条款分散在多个页面」的情况需要人工持续复检。
- 演示来源（`editorial_demo` / `product_doc`）本身没有许可字段，UI 显示「许可 Unknown」。这是正确的，但在视觉上可能与「真实资源许可未核验」难以区分。
