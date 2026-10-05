# 10 Frontend AI Advisor（AI Beta 双引擎）

## Objective（规格 §27-29）
把 advisor 页升级为 Real AI Beta，同时保证失败体验与诚实披露。

## 双引擎
- **引擎 A（主）AI Beta**：`js/ai-client.js` → `POST {AI.aiBackendBase}/api/ai/advisor`。
  - 仅当 `AI.aiBackendBase` 已配置时探测 health（避免静态托管 404 噪音）；
  - 渲染前**前端二次 Fact Hydration**：仅以返回的 resource_id 到本地
    `ctx`（data-loader/derive）取 title/provider/fee/rating/verification 渲染；
    本地不存在的 ID 直接不渲染（幻觉资源第二道 CODE 防线）；
  - 回答分层：「基于 CourseMap 数据的推荐」与「AI 学习建议」分区；
  - 学习路径分区：Graph 步骤（evidence-backed）+ AI 周计划（独立 notice）；
  - 证据/来源可折叠查看；不确定性列出；DEMO 披露持续可见。
- **引擎 B（降级）Rule-based Prototype**：后端未配置/未授权/失败时自动切换，
  显示优雅降级信息（规格 §31 文案）+ 规则引擎结果（保留 MoT #6 能力）。

## UI 要素清单（规格 §27）
Input / placeholder / Send / Loading（aria-live 状态）→ Recommendations /
Learning Path / Evidence / Sources / Uncertainty / Error State / Retry（重新提交）/
Clear Conversation（清空会话）。Streaming：第一版 **non-streaming**（决策：
结构化推荐必须整体校验后展示，SSE 增加平台耦合与复杂度，收益低；记录于 ADR-001 附注）。

## 披露（规格 §28/60）
- 「AI 学习顾问可能产生错误；具体信息以 CourseMap 已核验数据及原始来源为准」固定展示。
- **REAL LLM + DEMO DATA 同时表达**：Beta 徽标与 disclaimer 并存，
  推荐卡持续带 DEMO 徽标；DeepSeek 接入不掩盖 Demo 数据本质。

## Tests
浏览器冒烟 16/16（含 advisor 降级模式断言）；Console/Exceptions/FailedRequests=0。

## Result
PASS。
