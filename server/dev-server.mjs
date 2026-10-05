/* ============================================================================
   CourseMap AI Backend — dev-server.mjs
   ----------------------------------------------------------------------------
   本地开发 / 回归测试用 HTTP 服务器（复用与生产完全相同的 handler）。
   用法：node server/dev-server.mjs [port]
   ========================================================================== */

import { createServer } from 'node:http';
import { handleAIRequest } from './httpHandler.mjs';

const PORT = Number.parseInt(process.argv[2] ?? process.env.PORT ?? '8788', 10);

const server = createServer((req, res) => {
  handleAIRequest(req, res).catch((err) => {
    // handler 内部已兜底；这里是最后防线
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL', message: '服务内部错误。' } }));
    console.error('[dev-server] fatal:', err && err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[coursemap-ai] dev server listening on http://127.0.0.1:${PORT}`);
  console.log('[coursemap-ai] routes: POST /api/ai/advisor, GET /api/ai/health');
});
