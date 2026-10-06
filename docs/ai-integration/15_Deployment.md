# 15 Deployment

## 现状（本轮实际完成）

- **Frontend**：GitHub Pages 不变（https://gina0014.github.io/coursemap-prototype/）。
  `js/config.js` 的 `AI.aiBackendBase` 已指向生产后端（稳定 URL，非每次部署的
  hash 域名），前端已处于 **Beta · Real LLM** 模式。
- **Backend**：**已部署**于 Vercel（用户完成账号授权），稳定地址

  ```
  https://coursemap-prototype.vercel.app
  ```

  路由：`POST /api/ai/advisor`、`GET /api/ai/health`（**每个路由必须有对应文件**，
  Serverless 文件系统路由——见下方「Defect 1」）。`DEEPSEEK_API_KEY` 通过
  Vercel Environment Variables / Secret 注入，仅存在于服务端；仓库与前端零密钥。

## 目标架构（已实现）

```
GitHub Pages 前端
   │  (浏览器只与 CourseMap AI Backend 通信，绝不直连 DeepSeek)
   ▼
Vercel Serverless Function  ──►  CourseMap Retrieval (Repository + StructuredRetriever)
   │                                              │
   │  DEEPSEEK_API_KEY（服务端 env）               │  CourseMap 数据 = 唯一事实来源
   ▼                                              ▼
DeepSeek API  ──►  Grounded AI Response（Fact Hydration 由 Repository 重取）
```

## 环境变量（Vercel → Production）

| Key | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | **Secret**，仅服务端；前端与 Git 仓库零密钥 |
| `DEEPSEEK_MODEL` | 可选，默认 `deepseek-v4-flash`（官方当前模型表；`deepseek-chat` 已于 2026-07-24 15:59 UTC 停用） |
| `ALLOWED_ORIGIN` | 前端 origin 白名单（禁 `*`） |

## 部署指纹（本轮新增）

`GET /api/ai/health` 的 `meta.build` 返回部署指纹：

- Vercel **Git 部署**注入 `VERCEL_GIT_COMMIT_SHA`（取前 12 位）；
- Vercel **CLI 部署**注入 `VERCEL_DEPLOYMENT_ID`；
- 本地开发为 `local`。

**为什么必须有它**：push 到 master 会**并行**触发「Vercel 重新部署」与「验证流水线」。
若验证在 Vercel 尚未完成 redeploy 时开始，就会拿**旧代码**验**新修复**，
把正确答案误判为失败——首轮 CI 正是如此误判的（见 16 文档）。
`scripts/verify/wait_for_deploy.mjs` 会轮询 `meta.build` 直到新部署就绪才开始验证，
`live_public_verify.mjs` 的 **V-04b** 断言再把「验的是本次提交」写入证据。

## CORS / 安全头

- `ALLOWED_ORIGIN` 白名单（禁 `*`）；未授权 origin 的 POST 返回
  `403 ORIGIN_NOT_ALLOWED`，且不返回 `Access-Control-Allow-Origin`。
- `nosniff` / `Referrer-Policy` / `no-store` 已配置（handler + `vercel.json`）。
- 错误响应只给 `code` + 友好消息，绝不含 stack / secret / internal prompt。

## 验证方式

生产验证需要能直连 `*.vercel.app` 的网络；**开发机无法访问**（DNS 污染 + TLS 复位），
因此验证在 **GitHub Actions** 中执行，并把证据提交回仓库：

- `.github/workflows/live-verify.yml`
  - `public-e2e`：真实 Chrome 访问 GitHub Pages，跑 3 个用户场景；
  - `backend-verify`：直连 Vercel 后端跑 64 项断言（真实 DeepSeek）；
  - `publish-evidence`：把 `30_*` / `31_*` 证据提交回 master。
- 本地等价验证（测试替身，走完整真实管线）：
  `node scripts/verify/live_public_verify.mjs` + `node scripts/verify/public_e2e.mjs`。

## Result

**DEPLOYED（前端 + 后端）· 生产再验证 PENDING**。

- 后端已上线并读取到密钥（`llm_configured=true`、`adapter=deepseek`）。
- 首轮真实生产验证暴露 4 处缺陷；修复已提交（见 00/19 文档），
  生产再验证待修复推送后由 CI 出证据。
