# 16 Public E2E（规格 §48）

## 执行方式（已落地，非纸面清单）

- **真实浏览器 E2E**：`scripts/verify/public_e2e.mjs`
  （通过 Chrome DevTools Protocol 直连真实 Chrome，不依赖 puppeteer/Playwright）
  - 打开公网 `https://gina0014.github.io/coursemap-prototype/`
  - 断言 `js/config.js` 已指向生产后端、且不含任何 secret
  - 等待生产后端 `/api/ai/health` 就绪且 `llm_configured=true`
  - 逐个提交 3 个用户场景，断言：结果卡引擎 = `deepseek-beta`、
    无降级提示、推荐卡全部接地（resource_id 存在于 CourseMap）、
    **DOM 层事实绑定**（费用/时长 = CourseMap 数据）、DEMO 标识保留
  - 断言后端不可用时仍保留 Graceful Fallback（规则引擎 + 明确降级提示）
  - 断言控制台错误 = 0 / 未捕获异常 = 0 / 关键资源加载失败 = 0
- **后端 E2E**：`scripts/verify/live_public_verify.mjs`（64 项断言，见 14 文档）。
- **CI**：`.github/workflows/live-verify.yml`（GitHub Actions 可直连 Vercel）。

## 3 个用户场景（最终验收）

| # | 输入 | 预期 |
| --- | --- | --- |
| 1 | 「我是零基础大学生，想学 Python。」 | 目标 → `Python 入门`；level=beginner；推荐接地 |
| 2 | 「预算100元，每周5小时，想学数据分析。」 | 目标 → `Python 数据分析`；budget=100 硬过滤生效 |
| 3 | 「我会R，想入门单细胞分析。」 | 目标 → `单细胞 RNA-seq 入门`；known_skills=[R]；走先修路径 |

## 结果

### 首轮真实生产运行（commit 51d9537，**修复前**）

- 后端 E2E **未执行**（`backend-verify` 依赖 `public-e2e` 成功，E2E 失败即跳过）。
- 浏览器 E2E：**Total 35 · PASS 25 · FAIL 10**，`VERDICT: FAIL`。
  - S1/S2/S3 全部退化为 `NO_MATCHING_RESOURCE` → 前端回退规则引擎
    （S1-01 / S1-04 / S1-05、S2-*、S3-*、E-90 失败）。
  - 根因：**目标名匹配过于脆弱** —— 真实 DeepSeek 不会逐字复用规范目标名，
    而是改写成自然措辞（`Python 编程入门` / `Python数据分析` / `单细胞分析`）。
    详见 00 文档 M19 与 19 文档。

### 修复后（本地等价验证，测试替身走完整真实管线）

- 浏览器 E2E：**Total 37 · PASS 37 · FAIL 0**，`VERDICT: PASS`
  （新增 E-04 / E-04b：等待并断言生产后端就绪且已读到密钥）。
- 后端 E2E：**Total 64 · PASS 64 · FAIL 0**，`VERDICT: PASS`。

### 生产再验证

**PENDING** —— 需修复提交推送至 master、Vercel 完成 redeploy 后由 CI 出证据
（`30_*` / `31_*`）。**不预写 PASS**。
