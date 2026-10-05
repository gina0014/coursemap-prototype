# ADR-002 Why LLM Adapter

## 决策
AIOrchestrator 只依赖 `LLMAdapter` 接口（chatJSON / chatWithTools / isConfigured）；
DeepSeek / Mock / 未来 OpenAI / Gemini / 本地模型都是可插拔实现。

## 理由
1. 业务层（检索、工具、编排）零厂商耦合——换模型不重写 Retrieval/Graph/UI。
2. 测试需要确定性：MockLLMAdapter 让 CI 零成本、零网络、可脚本化注入
   故障/幻觉/冲突场景（14 文档）。
3. 成本与可用性风险隔离：适配器是唯一需要随上游 API 变化而修改的点。
