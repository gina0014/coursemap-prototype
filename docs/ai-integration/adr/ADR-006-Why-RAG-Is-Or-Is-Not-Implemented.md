# ADR-006 Why RAG Is Not Implemented（DEFERRED）

## 决策
本轮不部署 Vector DB、不生成 embedding；RAG = DEFERRED，仅预留 Retriever 接口。

## 理由
1. 数据现实：48 条资源、结构化字段完备，Structured Retrieval 全覆盖；
   无足够长文本（syllabus/评价正文）支撑语义检索价值。
2. 成本与复杂度：向量库引入 embedding 成本、基础设施与一致性负担，当前为零收益。
3. 迁移路径已铺好：Orchestrator 只依赖 Retriever 接口，VectorRetriever /
   HybridRetriever 可后插（18_Future_RAG.md 列出触发条件）。
