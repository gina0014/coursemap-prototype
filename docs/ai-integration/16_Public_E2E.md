# 16 Public E2E（规格 §48）— 执行清单

## 已完成（本轮）
- 公网前端回归：GitHub Pages 部署 v0.2 前端后，浏览器冒烟
  `COURSEMAP_BASE=https://gina0014.github.io/coursemap-prototype` → **16/16 PASS**
  （Console 0 / Exceptions 0 / Failed Requests 0；advisor 页为降级模式断言通过）。
- 本地 HTTP 级：malformed request / 超长 / 限流 / CORS / 404 / 无 Key 降级 → 全 PASS。

## 待 Key + 后端部署后执行（7 个 Case）
| Case | 输入 | 预期 |
| --- | --- | --- |
| 1 | 「我是零基础大学生，想学 Python。」 | 提取 goal=Python 入门/beginner；推荐绑定真实 resource_id |
| 2 | 「预算100元，每周5小时，想学数据分析。」 | budget=100 过滤生效；推荐 fee ≤100 或免费 |
| 3 | 「我会R，想入门单细胞分析。」 | 命中单细胞路径；含先修说明 |
| 4 | 不存在的目标（如「驯养独角兽」） | NO_MATCHING_RESOURCE 语义，不编造 |
| 5 | （使 DeepSeek 不可用/错误 Key） | AI_UNAVAILABLE + 前端规则引擎降级，核心功能可用 |
| 6 | malformed request / 超长消息 | 4xx envelope，无内部信息 |
| 7 | 连续 >10 次请求 | RATE_LIMITED 429 |

执行方式：后端域名上线后，
`COURSEMAP_BASE=<pages> AI_BASE=<backend> node scripts/regression/public_e2e_ai.mjs`
（脚本待 Case 通过率 100% 后视为 PASS；当前不预写结果）。

## Result
本轮：前端公网回归 PASS；E2E Case 1-7 = PENDING（WAITING FOR KEY）。
