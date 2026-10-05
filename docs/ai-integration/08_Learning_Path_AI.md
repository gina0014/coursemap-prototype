# 08 Learning Path（AI 与 Learning Graph 的关系）

## Objective（规格 §24 / AI-MoT #6）
AI 可以基于 Learning Graph 选择并解释路径，但必须区分：

| 层 | 来源 | 标注 |
| --- | --- | --- |
| `evidence_backed` | CourseMap Learning Graph（path + steps + 每步核心资源，含 fee/data_class） | "steps 为 CourseMap Learning Graph 事实" |
| `ai_generated_schedule` | 模型生成的周计划（如 Week 1–2 Python Basics…） | "AI 规划建议，仅供参考，非 CourseMap 数据" |

## 实现
- Stage B final JSON 的 `path_ref` → `Repository.getLearningPath()` 重建完整证据结构
  （步骤有序、每步绑定 skill/goal/core_resources）。
- `path_ref` 不存在或非法 → learning_path=null（不硬造）。
- `ai_generated_schedule` 仅保留文本（截断 800 字符），UI 用独立 notice 块呈现。
- LLM **不得**修改 Graph 事实关系：响应中的步骤/资源全部来自 Repository，
  模型只决定「选哪条路径」与「如何解释」。

## Tests
A-08（路径检索/排序/资源绑定）；AI-MoT #6 由 UI 结构保证（两个视觉分区）。

## Result
PASS。
