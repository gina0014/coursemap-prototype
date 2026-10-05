# ADR-001 Why Backend Is Required

## 决策
引入独立 Serverless Backend 作为 DeepSeek 唯一调用方；禁止 Browser → DeepSeek 直连。

## 理由
1. API Key 不能进入前端 bundle / Git / HTML——GitHub Pages 是纯静态托管，无服务端，
   任何「前端直连」方案都必须把 Key 交给浏览器（可被任意用户提取）。
2. 限流、输入校验、工具白名单、幻觉防线必须在不可信客户端之外执行。
3. 未来替换模型/平台不影响前端契约（统一 envelope）。

## 附注
- Streaming（SSE）第一版不做：结构化推荐必须整体校验后展示；
  Vercel Function 流式 + 分层校验的复杂度收益比差（记录于 10_Frontend_AI_Advisor.md）。
