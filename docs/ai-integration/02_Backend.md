# 02 Backend — CourseMap AI Backend

## Objective
为 AI 学习顾问提供安全的服务端运行时：密钥托管、限流、校验、编排。
没有它，LLM 只能以「前端直连 + 前端持密钥」的不安全方式接入（禁止）。

## Before
无后端。`js/ai-advisor.js` 为纯前端规则原型，LLM Adapter 仅为接口位。

## Implementation
```
server/
  config.mjs              唯一 env 读取点（DEEPSEEK_API_KEY/MODEL、ALLOWED_ORIGIN、限额）
  errors.mjs              ApiError + 统一错误码 + toSafeError（绝不泄内部信息）
  httpHandler.mjs         平台无关 HTTP handler（envelope / CORS / 路由）
  dev-server.mjs          本地 Node http 服务器（复用生产 handler）
  repo/CourseMapRepository.mjs      JsonCourseMapRepository（11 张表、检索 API、评分聚合）
  retriever/StructuredRetriever.mjs 候选证据集（结构化过滤 + 紧凑表示）
  llm/{LLMAdapter,DeepSeekAdapter,MockLLMAdapter}.mjs
  orchestrator/{AIOrchestrator,intentSchema}.mjs
  tools/{toolSchemas,toolExecutor}.mjs
  context/ConversationStore.mjs     session 级结构化约束
  security/security.mjs             输入校验 + RateLimiter
  cost/usageLog.mjs                 usage 结构化日志
api/ai/advisor.js        Vercel Serverless 入口（includeFiles: data/**）
```

## API
- `POST /api/ai/advisor` — `{ message, conversation_id?, context? }`
- `GET /api/ai/health` — `{ status, llm_configured, adapter }`（不泄内部信息）
- envelope：成功 `{ success:true, data, meta }`；失败 `{ success:false, error:{code,message} }`

## Tests
- 集成测试（tests/ai/integration.test.mjs）：health / malformed / 超长 / 404 /
  OPTIONS / CORS / 限流 / 错误 envelope 无敏感词 → 10/10 PASS。
- dev server 与生产 handler 共用同一代码路径。

## Result
PASS。

## Known Limitations
- Rate limit / 会话存储为单实例内存实现；多实例部署需换 Redis/KV（接口已收敛在两个类中）。
