# ADR-004 Why CourseMap Is Source of Truth

## 决策
CourseMap 结构化数据是资源身份/费用/时长/评分/证书/核验/来源的唯一事实来源；
LLM = Interaction + Reasoning Layer，只解释证据、不定义证据。

## 代码级强制（不是 prompt 恳求）
1. 幻觉防线：recommendations[*].resource_id 必须存在于 Repository，否则剔除/拒绝（A-18）。
2. Fact Hydration：展示事实全部由 Repository 重取，模型回传的同名字段被丢弃（A-19）。
3. 前端二次防线：本地数据查不到的 ID 不渲染。
4. 评分由服务端聚合（getRatingSummary），前端由 derive 聚合——同一规则两个实现。
