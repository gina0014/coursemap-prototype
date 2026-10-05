# 18 Future RAG — 当前范围与预留（规格 §39-40）

## 决策：RAG = DEFERRED
理由（ADR-006）：当前数据规模小（48 资源 / 结构化字段完备），
Structured Retrieval 已经 100% 覆盖检索需求；引入向量库是为命名而命名，
违反「不为 AI 强行迁移」原则。

## 触发条件（满足其一再评估）
- 资源附带大量长文本：syllabus / 详细 description / learning outcomes；
- 评价文本积累到语义检索有真实召回价值；
- 资源数增长到结构化过滤召回不足。

## 已预留的接口位
- `Retriever` 接口：AIOrchestrator 仅依赖 `retrieve(intent, limit)` 语义。
- `StructuredRetriever` 为第一实现；未来 `VectorRetriever`（description/syllabus/
  outcomes/review text 嵌入）与 `HybridRetriever`（结构化 + 向量召回 → Evidence Set）
  可在不改 Orchestrator / Tools / UI 的情况下插入。
- 混合检索目标流：Hybrid Retrieval → Evidence Set → LLM（引用 Evidence IDs）。

## 未做的事（明确）
- 未安装任何 Vector DB；未生成任何 embedding；未写任何向量检索代码。
