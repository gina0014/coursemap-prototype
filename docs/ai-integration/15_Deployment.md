# 15 Deployment

## 现状（本轮实际完成）
- **Frontend**：GitHub Pages 不变（https://gina0014.github.io/coursemap-prototype/）。
  前端 v0.2 已推送部署；`AI.aiBackendBase` 默认为空 → advisor 页为降级模式
  （规则原型 + 明示），部署后端后仅需注入后端 base URL 即可切换 Beta。
- **Backend**：代码与配置已全部就绪（Vercel 单函数，`api/ai/advisor.js` +
  `vercel.json` includeFiles data/**），**尚未部署**——部署平台需要用户账号授权，
  且需要 DeepSeek Key 才有意义。停在授权边界（规格 §0）。

## 上线 Backend 的唯一人工步骤（WAITING FOR DEEPSEEK_API_KEY）
1. **提供 DeepSeek API Key**（platform.deepseek.com → API Keys）。
2. 在 Vercel（或任意支持 Node Serverless 的平台）用 GitHub 账号导入
   `coursemap-prototype` 仓库（Framework Preset: Other 即可）。
3. 配置 Environment Variables（Production）：
   - `DEEPSEEK_API_KEY=<你的 Key>`（Secret）
   - `DEEPSEEK_MODEL=deepseek-chat`（可选，默认即此）
   - `ALLOWED_ORIGIN=https://gina0014.github.io`（逗号分隔可加本地 dev origin）
4. 部署后将得到的后端域名（如 `https://<project>.vercel.app`）填入
   `js/config.js` 的 `AI.aiBackendBase`，push 前端。
5. 运行 `npm run test:ai-live` + 公网 E2E（16_Public_E2E 的 7 个 Case）。

## CORS / 安全头
- ALLOWED_ORIGIN 白名单（禁 `*`）；nosniff / Referrer-Policy / no-store 已配置
  （handler + vercel.json）。
- 前端跨域调用后端：后端返回的 `Access-Control-Allow-Origin` 必须精确等于前端 origin。

## Result
ENGINEERING READY · DEPLOYMENT PENDING USER AUTHORIZATION + API KEY。
