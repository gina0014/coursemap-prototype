# 05 Retrieval — CourseMapRepository / StructuredRetriever

## Objective
意图解析后必须查询 CourseMap 自己的数据（规格 §14-15）；
**禁止**直接让模型凭参数知识推荐课程。

## CourseMapRepository API（规格 §14 全项）
searchResources / getResourceById / getResourcesByGoal / findGoalByName（含别名）/
filterByBudget / filterByDifficulty / filterByDuration（weeks×hours 上限）/
filterByLanguage / getProvider / getLearningPath / getPrerequisites /
getSourcesForResource / getRatingSummary（服务端聚合评分）。

- 数据与前端共用同一份 `data/*.json`（前后端事实一致）。
- 只读；Repository 抽象（ADR：未来 PostgresCourseMapRepository，业务层不感知 JSON 细节）。
- ID 规范化：所有 ById 索引以 String 为键（数据集 ID 为整数、模型输出为字符串，
  统一键型避免「6 ≠ '6'」级 bug）。

## StructuredRetriever
- `retrieve(intent, limit=12)`：goal 匹配 → 预算/难度/时长/语言/证书过滤 → 候选集。
- `toCompactCandidates()`：候选的紧凑表示（控制 prompt 尺寸，max 12 条）。
- Retriever 接口预留 VectorRetriever / HybridRetriever（ADR-006：本轮 RAG=DEFERRED）。

## Evidence IDs
候选与工具结果都携带 `resource_id`；最终推荐必须绑定之（见 07 文档）。

## Tests
A-01/A-02/A-03/A-05/A-08；数值/字符串 ID 双兼容。

## Result
PASS。
