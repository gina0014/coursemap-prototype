/**
 * CourseMap AI Backend — Vercel Serverless Function (health)
 * ----------------------------------------------------------------------------
 * GET /api/ai/health
 *
 * 为什么需要这个文件：
 *   server/httpHandler.mjs 是平台无关入口，同时处理
 *     GET  /api/ai/health
 *     POST /api/ai/advisor
 *   本地 dev-server 由我们自己按 pathname 分派，因此两个路由都能工作。
 *   但 **Vercel 是按文件系统路由的**：没有 api/ai/health.js，
 *   生产环境 GET /api/ai/health 会直接 404 —— 前端 probeBackend() 会永远
 *   判定「后端不可用」并降级，AI Beta 引擎在公网将无法启用。
 *
 *   本文件保证「本地路由集合 == 生产路由集合」。若未来在 httpHandler 中新增
 *   路由，必须同步新增对应 api/**\/*.js 文件（tests/ai/routing.test.mjs 会拦截）。
 *
 * 环境变量（在部署平台配置为 Secret，绝不写入仓库）：
 *   DEEPSEEK_API_KEY   必填（生产）
 *   DEEPSEEK_MODEL     可选（默认 deepseek-chat）
 *   ALLOWED_ORIGIN     可选（逗号分隔 origin allowlist）
 */

export { handleAIRequest as default } from '../../server/httpHandler.mjs';
