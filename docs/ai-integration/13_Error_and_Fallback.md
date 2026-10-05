# 13 Error Handling & Fallback（Graceful Degradation）

## 错误族 → 用户看到什么
| 场景 | code | 用户消息（要点） |
| --- | --- | --- |
| message 为空 / 非法 JSON | BAD_REQUEST | 明确指出问题 |
| message 超长 | MESSAGE_TOO_LONG | 「消息过长（最多 600 字），请精简」 |
| Origin 不在白名单 | ORIGIN_NOT_ALLOWED | 403 |
| 超频 | RATE_LIMITED | 「请求过于频繁，请一分钟后再试」 |
| DeepSeek 401/403/5xx/网络 | AI_UNAVAILABLE / AI_UPSTREAM_ERROR | 「AI 服务暂不可用…仍可使用搜索/对比」 |
| 超时 | AI_TIMEOUT | 「AI 响应超时，请稍后重试」 |
| 空响应 / JSON 损坏 / finish_reason=length / 工具轮超限 | INVALID_MODEL_OUTPUT | 「AI 返回未通过数据校验，请重试」 |
| 目标未收录 | NO_MATCHING_RESOURCE | 「数据集中没有匹配资源，可用『找课程』浏览」 |
| Key 未配置 | NOT_CONFIGURED | 「AI 服务尚未配置…仍可使用课程搜索、对比与学习路径」（不伪造接入） |
| 未知异常 | INTERNAL | 「服务内部错误」——**永不透出原始 message**（可能含内部信息） |

硬规则：不白屏、不无限 Loading、无 stack trace、无内部环境信息（I-09 验证错误体无敏感词）。

## Fallback（规格 §31）
- 前端：AI 失败 → 显示降级 notice + **自动给出规则引擎结果**；
  核心功能（Search / Filter / Comparison / Learning Path / Resource Detail）零 AI 依赖。
- 后端：key 未配置时 advisor 路由返回 NOT_CONFIGURED（503）；
  health 仍 200（status ok / llm_configured:false），便于探活。
- 数据不可用：Repository 空态 → 503（不静默给空推荐）。

## Tests
A-12/A-12b（错误映射）、A-13、A-21、A-22、I-02..I-10（HTTP 级）、冒烟 16/16。

## Result
PASS。
