# Before / After — AI-1 DeepSeek Integration

| 维度 | Before（v0.1） | After（v0.2-AI-Beta） |
| --- | --- | --- |
| Architecture | 纯前端静态站 | 前端 + AI Backend（Serverless，密钥服务端托管） |
| Intent Understanding | 规则正则解析（关键词/金额/时间模式） | DeepSeek 自然语言理解 + JSON 输出 + schema 校验（未知=null） |
| Retrieval | 前端规则检索（search.js） | 服务端 Repository + StructuredRetriever + 6 个 Tool（模型可按需深挖） |
| Recommendation | 规则打分排序 | 模型在证据集上选择/排序/解释 + CODE-ENFORCED 幻觉防线 |
| Evidence | 前端规则生成的 why/source refs | Evidence IDs 绑定 + 服务端 Fact Hydration + 前端二次水合 + source_refs |
| Conversation | 无（单轮） | session 级结构化约束多轮（改预算不重述目标） |
| Security | 前端无 secret（也未接 LLM） | Key 服务端 only、CORS allowlist、server 限流、注入探针、输出校验 |
| Failure Handling | 不适用 | 全错误族映射 + 规则引擎优雅降级（核心功能零 AI 依赖） |
| Deployment | GitHub Pages 单层 | GitHub Pages（已上线 v0.2）+ Backend（READY，待授权部署） |
| Testing | 75 核心断言 + 16 冒烟 | + 58 AI 单元 + 10 HTTP 集成 + Live 门控套件 |
| Disclosure | Prototype · Not LLM-powered | REAL LLM（Beta）+ DEMO DATA 同时明示；降级时回退标注 |
