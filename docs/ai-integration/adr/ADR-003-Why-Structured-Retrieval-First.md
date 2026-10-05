# ADR-003 Why Structured Retrieval First

## 决策
候选资源由 CourseMap 代码（StructuredRetriever）先检索，再交给模型在证据上推理；
「直接问模型推荐课程」被禁止。

## 理由
1. 事实正确性：fee/rating/provider 等只能来自数据层；模型参数知识不可信且会过时。
2. 可控成本：候选 ≤12 条紧凑表示 vs 全库注入。
3. 可解释性：每条推荐可回溯到 resource_id → source_refs。
4. 规模现实：48 条资源 + 完备结构化字段，结构化检索已覆盖 100% 需求（见 ADR-006）。
