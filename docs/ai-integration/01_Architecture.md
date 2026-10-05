# 01 Architecture — CourseMap AI-1

## 目标架构（实际实现）

```
User
↓
CourseMap Frontend（GitHub Pages，不变）
↓  HTTPS（fetch /api/ai/*）
CourseMap AI Backend（Serverless Function，api/ai/advisor.js）
↓  CORS allowlist → 输入校验 → Rate Limit（server-side）
AIOrchestrator（server/orchestrator/AIOrchestrator.mjs）
├─ Stage A：Intent Extraction（DeepSeek JSON 输出 + intentSchema 清洗校验）
├─ StructuredRetriever → CourseMapRepository（data/*.json，Evidence Layer）
├─ Stage B：Tool Loop（6 个 allowlist 工具，参数 untrusted，server-side 校验）
├─ CODE-ENFORCED 幻觉防线（resource_id 必须存在于 Repository）
├─ Fact Hydration（fee/provider/duration/rating/certificate/source 全部重取）
↓
LearningDecisionResponse（统一 envelope）
↓
Frontend（二次 Fact Hydration 渲染 + 分层：证据推荐 vs AI 建议）
```

## 分层原则（未变）

| 层 | 角色 | 实现 |
| --- | --- | --- |
| LLM | Interaction + Reasoning Layer | DeepSeek（服务端适配器） |
| CourseMap Data | Evidence Layer | data/*.json + Repository |
| Learning Graph | Knowledge Layer | goals/skills/paths 关系 |
| Source Provenance | Trust Layer | sources / resource-source / verification |

## 关键决策

1. **禁止 Browser → DeepSeek 直连**（ADR-001）：Key 只在服务端。
2. **LLMAdapter 抽象**（ADR-002）：Orchestrator 不感知厂商。
3. **Structured Retrieval First**（ADR-003）：候选集由 CourseMap 代码检索，
   模型在证据上做选择/排序/解释；RAG=DEFERRED（ADR-006）。
4. **CourseMap = Source of Truth**（ADR-004）：模型可以解释证据，不能定义证据。
5. **Tool 参数 = untrusted**（ADR-005）：JSON Schema + 白名单 + 服务端二次校验。

## 前后端分离

- Frontend 继续 GitHub Pages（静态、零成本、CDN）。
- Backend = 单个 Serverless Function（简单 / HTTPS / 环境变量 Secret / CORS 可控），
  不引入容器编排与微服务（当前规模不需要，ADR-008）。
