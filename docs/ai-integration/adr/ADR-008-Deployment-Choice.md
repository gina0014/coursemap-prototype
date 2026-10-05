# ADR-008 Deployment Choice

## 决策
Backend = Vercel Serverless Function（单函数，`api/ai/advisor.js`）；
Frontend 保持 GitHub Pages。

## 理由
1. 匹配规格 §5 优先级：简单 / 低成本 / HTTPS / Environment Secrets / CORS 可控。
2. 与 GitHub 仓库工作流零摩擦（同 repo、push 即部署）；
   `vercel.json` includeFiles 已解决 data/** 打包。
3. 明确排除 Kubernetes / 微服务 / 容器编排——当前规模（单函数、低 QPS）不需要。
4. 平台无关设计：handler 不依赖平台 API，本地 dev server 与任何 Node 容器皆可运行；
   若未来迁移 Cloudflare/自托管，只换入口文件。
5. 备选未选原因：Cloudflare Workers（冷启动更优但生态内文件打包与 Node 兼容层
   对 JSON 仓库读取需额外适配）；自建 VM（运维成本不成比例）。

## 授权边界
实际部署需要用户平台账号授权 + DeepSeek Key → 停在授权边界（15 文档）。
