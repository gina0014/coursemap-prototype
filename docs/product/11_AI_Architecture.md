# 11 · AI 架构（AI Architecture）

## 定位

AI 学习顾问不是「教育 Chatbot」，而是 **Learning Decision Agent**：

```
Natural Language
  → Constraint Extraction（约束抽取）
  → CourseMap Retrieval（结构化检索）
  → Resource Ranking（排序）
  → Learning Path（路径建议）
  → Explanation（解释）
  → Evidence（证据）
```

分层原则：**LLM = 交互与推理层；CourseMap Data = 证据层；
Learning Graph = 知识层；Learner Outcome = 反馈层**。
AI 永远不是 Source of Truth。

## 数据契约

### LearningDecisionRequest

`goal` / `current_level` / `known_skills` / `budget` /
`available_hours_per_week` / `target_duration` / `language` /
`preferred_learning_style` / `certificate_requirement` / `resource_type` /
`career_goal`

### LearningDecisionResponse

`interpreted_goal` / `constraints` / `recommended_resources` /
`recommended_path` / `estimated_cost` / `estimated_duration` /
`reasoning_summary` / `evidence` / `source_refs` / `verification_status` /
`uncertainty` / `alternative_options`

实现：`js/ai-advisor.js`（契约 + 解析器 + 检索 + 响应组装）。

## 当前实现（v0.1）

- **Rule-based Prototype Decision Assistant · Not LLM-powered**（UI 显著标注）。
- 结构化解析器抽取：goal（名称/别名匹配）、budget（¥N 元 / 预算 N）、
  available_hours_per_week（每周 N 小时）、current_level（零基础/入门…）、
  certificate_requirement。
- 检索排序（透明规则，无黑盒）：目标命中 → 难度匹配 → 预算 → 每周负荷 →
  评分（含样本量门槛）→ 证书。
- 结果含：解析笔记（用户可核对解析是否正确）、推理摘要、每条推荐的证据
  （费用观测 / 评价样本 / 来源）、不确定性说明、放松后的备选方案。
- **AI 推荐免责声明**：AI 学习推荐 ≠ 保证的学习成果。

## LLM Adapter 接口位

`createLlmAdapter()` 返回统一的决策接口。未来接入 LLM 时：

- LLM 只负责意图解析与解释生成；检索与排序仍走 CourseMap 结构化数据。
- API Key 由**后端代理**持有，前端永不出现 secret（本轮无后端，故不接入）。
- 无 LLM 时优雅降级为当前规则模式（已实现，adapter 检测环境并降级）。

## 未来 RAG 预留（本轮不安装 Vector DB）

- Structured Retrieval：fee / duration / difficulty / language / certificate / skills。
- Vector Retrieval（未来）：description / syllabus / learning outcomes / review text。
- Hybrid Retrieval → Evidence Set → LLM（解释层）。

## AI 信任与治理

所有推荐必须可回答：Why this resource? What evidence? Which source?
When updated? Verified or not? How many reviews? What uncertainty?
—— 无来源推荐是被禁止的设计。
隐私上遵循数据最小化：v0.1 不收集任何敏感个人信息，请求不留存。
