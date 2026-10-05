# 07 Recommendation Engine（两阶段编排 + 防幻觉）

## Data Flow
```
intent
→ StructuredRetriever.retrieve（候选 ≤12，含 compact 事实）
→ [DeepSeek chatWithTools + 6 工具] → final JSON
→ JSON.parse（宽容去 fence）→ shape 校验
→ CODE-ENFORCED：resource_id 逐一查 Repository；
   不存在 → rejected（绝不显示）；全部被拒且无路径 → INVALID_MODEL_OUTPUT
→ Fact Hydration：title/provider/fee/duration/workload/difficulty/
   language/mode/certificate/rating(聚合)/verification/data_class/url/source_refs
   全部由 Repository 重取——模型回传的这些字段一律不信任
→ LearningDecisionResponse（规格 §21 全字段）
```

## 两层答案（规格 §20）
- **A. Evidence-backed Recommendation**：recommendations[]（事实字段 hydrated，
  reason/fit_factors/tradeoffs 为模型解释，截断保留）。
- **B. General Learning Advice**：general_advice[]（模型推理，明确标注来源为 AI）。
UI 分区渲染，绝不混排。

## 防幻觉与防冲突（代码强制，非 prompt 恳求）
- 幻觉资源测试（A-18：`XYZ-神课`）→ `INVALID_MODEL_OUTPUT`，不渲染。
- 事实冲突测试（A-19：模型回传 fake_fee=9999）→ 展示层 fee = Repository 值。
- 前端二次防线：advisor.js 用返回的 resource_id 到本地数据 hydrate，
  本地不存在的 ID 直接不渲染。

## 无匹配语义（规格 §30/43）
检索 total=0 → `NO_MATCHING_RESOURCE`（404，友好文案 + 引导用「找课程」）；
不编造「近似课程」。

## Tests
A-17（端到端）、A-18、A-19、A-21、A-23（响应 schema 全字段）；L-01/L-02（Live）。

## Result
PASS。
