/**
 * CourseMap AI Backend — Vercel Serverless Function
 * ----------------------------------------------------------------------------
 * POST /api/ai/advisor  → server/httpHandler.mjs
 * GET  /api/ai/health
 *
 * 环境变量（在 Vercel Dashboard 配置为 Secret，绝不写入仓库）：
 *   DEEPSEEK_API_KEY   必填（生产）
 *   DEEPSEEK_MODEL     可选（默认 deepseek-v4-flash —— 官方当前模型表，2026-10-06 核验）
 *   ALLOWED_ORIGIN     可选（逗号分隔 origin allowlist）
 */

export { handleAIRequest as default } from '../../server/httpHandler.mjs';
