# UI-UPGRADE-REPORT.md — CourseMap UI/UX Visual Upgrade（V0.2）

日期：2026-10-07 · 基线：commit `85e9129` · 范围：仅 UI / UX / 视觉 / 交互打磨

**版本标记**：Product `CourseMap-v0.2-AI-Beta`（未变）· UI Release `UI V0.2 · Visual Upgrade`
（UI commit `95513e6`；版本口径见 README「版本口径」）

**发布状态**：`LOCAL UI UPGRADE COMPLETE · REMOTE DEPLOYMENT PENDING`
（领先 `origin/master` 32 个 commit，公网仍为升级前版本）

**结论先行：13 个实施步骤全部完成。8 个测试套件 395/395 PASS、浏览器冒烟 18/18 PASS（0 真实 console error、0 异常、0 失败请求）、核心业务逻辑零改动。**

---

## 1. Changed Files（42 文件，+888 / −233，不含报告）

### 新增
| 文件 | 说明 |
| --- | --- |
| `css/upgrade.css` | 升级层（≈1250 行），最后加载、只覆盖视觉，不改 data-* 契约 |
| `docs/ui-upgrade/UI-UPGRADE-PLAN.md` | Step 2 产物：升级计划与契约清单 |
| `docs/ui-upgrade/UI-UPGRADE-REPORT.md` | 本报告 |

### 修改
- **Design tokens**：`css/variables.css`（色板转 Slate 系 + Trust Blue/Violet，令牌名不变，语义色取值不变）
- **全局组件 / 数据渲染**：`js/components.js`（导航、页脚、卡片元信息修复）
- **配置**：`js/config.js`（产品文案英文副标；新增 `STORAGE_KEYS.pathProgress`）、`js/storage.js`（新增路径阶段进度 API）
- **页面逻辑**：`js/pages/home.js` / `search.js` / `resource.js` / `compare.js` / `advisor.js` / `path.js`
- **HTML**：`index.html`（Hero 重建）、`pages/search.html`（筛选抽屉 + aria-live）、其余 11 个页面接入 `upgrade.css`
- **证据**：`docs/evidence/screenshots/01–18`（18 张截图全部重新生成）、`docs/evidence/browser-smoke.json`

## 2. Design System

单一真源仍在 `css/variables.css`（本次只调取值、增令牌，名称稳定）：

- **Color**：Primary `#2563EB` / Primary Dark `#1D4ED8` / AI Accent `#7C3AED` / BG `#F8FAFC` / Surface `#FFF` / Text `#0F172A`·`#64748B` / Border `#E2E8F0` / Success `#16A34A` / Warning `#F59E0B`。无大面积渐变、无玻璃拟态、无霓虹；蓝紫渐变仅限 AI Advisor / AI badge / hero accent。
- **Typography**：Inter → system-ui 栈；Hero 52px / H1 36px / H2 28px / H3 16–18px / Body 15px / Meta 13–14px；正文 line-height 1.6。
- **DATA ≠ AI REASONING**：AI 视觉语言（紫 sparkle、`badge--ai`、极淡渐变、AI thinking 动效）只出现在 Advisor / 起点建议 / AI 路径；普通课程数据一律中性色，DEMO/REAL/核验语义徽标全部保留且未弱化。
- **动效**：150–250ms 三档 token（`--cm-t-fast/base/slow`），`prefers-reduced-motion` 下全部归零。

## 3. Components Changed（按页面）

1. **Navigation**：sticky + 半透明白底 + 细底边 + active 指示条；右侧 Search / 收藏 / GitHub / Get Started CTA。
2. **Home**：badge + 双语 headline + 中央 AI Goal Input（"What do you want to learn?"）+ Popular goals chips + Trusted sources 行（仅列数据集中已核验的 4 个真实提供方）+ 原四条件检索入口降级为次级区块。
3. **Discover**：左筛选栏（目标/学科/难度/费用/语言/时长/类型/核验状态）sticky；Sort by 条；结果头部 live region；等高卡片（Provider/名称/两行描述/tags/metadata/View/Compare）；移动端筛选转抽屉（backdrop + Esc/点击关闭）。
4. **Course Detail**：决策面板右侧 sticky（Provider/Level/Duration/Language/Cost/Certificate/Last verified）+ Why CourseMap recommends + Suitable for + Source & Verification 核验卡；CTA 区保留诚实披露（演示数据不给伪造外链）。
5. **Compare**：顶部统计卡行 + 可横向滚动对比表（best 值高亮）+ 底部「起点建议」AI 面板，与数据表视觉强分离。
6. **AI Advisor**：结构化输入（Goal/Current level/Time/Target duration/Budget/Language）+ 自然语言补充；AI thinking 状态；输出分段（约束解析/推荐/序列/建议/不确定性/证据）。
7. **Learning Path（重构幅度最大）**：顶部统计（Stage 数/核心资源/可选资源/核心资源时长合计，全部可核验计数）；保留 SVG 步骤链总览；新增**垂直 roadmap 时间线**——每阶段 Stage 序号圆点 + 标题 + 技能/目标 tag + 时长估算 + 阶段目标（引用数据 `step.description`，不虚构 milestone）+ 核心资源卡 + 可选资源 disclosure + **Not started / In progress / Completed** 状态控件（localStorage 持久化，可一键清除）。

### 顺手修复的既有缺陷
- 资源卡提供方链接被整体转义成可见 HTML（`resource-card__where` 对已构建的锚点重复 `esc()`）——旧截图可证为存量缺陷，本次修复。
- `.badge--primary`（核心/可选徽标）此前被引用但从未定义样式，已补齐。

## 4. Responsive Test（1440 / 1024 / 768 / 390）

| 断点 | 行为 |
| --- | --- |
| 1440 | 3 列卡片、双栏 detail/search 布局、sticky 侧栏 |
| ≤1180 | 卡片 2 列；detail 右栏收窄 |
| ≤1024 | 侧栏转单列流式（为抽屉做准备） |
| ≤768 | Discover 筛选 → 抽屉；Compare 表 `min-width:720px` 横向滚动；Learning Path 单列时间线 + 状态按钮全宽 |
| ≤430 | 按钮/输入/chip 命中区 44px；品牌副名隐藏 |

验证方式：冒烟目标 `18_Home_Mobile_Featured`（390×844 视口）断言无横向溢出（`scrollWidth - innerWidth ≤ 2`）→ **OK**；12 张精选卡与官方外链在移动端完整 → **OK**。

## 5. Accessibility Test

- 焦点：全局 `:focus-visible` 2px 高对比蓝环 + offset；skip-link 保留并重样式。
- 命中区：主按钮 44px、控件 44px、导航链接 44px；`btn--sm`/徽标 40px（> WCAG 2.5.8 AA 最低 24px，密集元信息行不做 44px）。
- 对比度：正文 `#0F172A`/白 ≈ 17:1；次要 `#64748B`/白 ≈ 4.7:1；发现并修复 `status-pill`（muted on surface-3 ≈ 4.3:1）改用 `text-soft`。语义徽标颜色均非唯一信息载体（全部带文字）。
- 语义/ARIA：header/nav/main/footer/面包屑/`aria-current`；搜索结果头部新增 `aria-live="polite"`；Advisor 状态区原有 `aria-live`；阶段状态控件为 `role="group"` + `aria-pressed`；键盘可全程操作（button/a/select/summary 原生语义）。
- 动效：`prefers-reduced-motion: reduce` 时所有 transition/animation 归零。

## 6. Regression Result

| 项 | 结果 |
| --- | --- |
| `tests/runtime.test.mjs`（运行时/数据/路由） | 86 PASS / 0 FAIL |
| `tests/ai/unit.test.mjs` | 81 PASS / 0 FAIL |
| `tests/ai/routing.test.mjs` | 10 PASS / 0 FAIL |
| `tests/ai/integration.test.mjs` | 10 PASS / 0 FAIL |
| `tests/ai/data1.test.mjs` | 72 PASS / 0 FAIL |
| `tests/ai/model-output.test.mjs` | 33 PASS / 0 FAIL |
| `tests/ai/oer-expansion.test.mjs` | 88 PASS / 0 FAIL |
| `tests/ui/featured-oer.test.mjs` | 15 PASS / 0 FAIL |
| **合计** | **395 PASS / 0 FAIL** |
| 浏览器冒烟（CDP，13 页面 18 目标） | **18/18 PASS**，0 未处理异常，0 失败请求 |
| console error | 仅 Advisor 页探测生产后端的 CORS 噪声（白名单已登记，本地环境豁免） |
| 禁项核查 | 未删数据、未改 schema/course ID/API contract、未 mock AI、未删 fallback；Compare/Search/Learning Path/DeepSeek integration 全部可用（冒烟 + 套件双证） |

截图证据已随本次升级全部重新生成：`docs/evidence/screenshots/01–18`（`12_Advisor_Prototype.png` 为旧阶段遗留，未被当前目标引用，未改动）。

## 7. Known Issues / 后续建议

1. **「≈ N 周」为推导估算**：数据集无计划周数字段，阶段周数仅当资源同时标注时长与每周投入时按 `时长 ÷ 每周投入` 向上取整并显式标注"估算"；未标注字段不计入、不按 0 处理（诚实性约束优先于规格书的示例文案）。
2. **Learning Path 进度只存本机**（`coursemap.pathProgress.v1`）：与本地评价同一诚实性口径——不进数据集、不同步、不影响他人；无账号体系前不做云端进度。
3. **首页 Hero 为中英混排**：主标题保留中文（冒烟契约 `今天想学什么` 等），英文标语作为副行；如需纯英文 Hero 需同步更新冒烟目标文案断言。
4. **`12_Advisor_Prototype.png` 为历史遗留文件**，建议后续阶段确认无引用后清理。
5. 生产环境（GitHub Pages + Vercel）未在本机直接验证（开发机无法访问 `*.vercel.app`），按既有纪律由 GitHub Actions `live-verify.yml` 在推送后执行。
