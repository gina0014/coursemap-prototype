/* ============================================================================
   CourseMap — scripts/verify/deepseek_shadow.mjs
   ----------------------------------------------------------------------------
   本地 DeepSeek 影子服务（test double）。

   目的：
     让「orchestrator → CourseMapRepository → StructuredRetriever → ToolExecutor
     → Fact Hydration → LearningDecisionResponse」整条**真实管线**在零成本、
     离线、可复现的条件下端到端跑通，从而验证：
       1) scripts/verify/live_public_verify.mjs 自身的正确性（断言/解析/证据落盘）；
       2) Fact Hydration 的「模型说谎、仓库为准」行为（影子故意返回错误 fee/rating）；
       3) 幻觉 resource_id 剔除；
       4) Prompt Injection 不改变策略。

   它不是 MockLLMAdapter：MockLLMAdapter 绕过 HTTP 与 DeepSeek 协议，
   本影子走完整 HTTP + OpenAI 兼容协议（POST /chat/completions），
   因此能覆盖 DeepSeekAdapter 的解析、工具调用循环与错误映射路径。

   注意：本文件是**测试替身**，绝不用于生产；生产必须使用真实 DeepSeek API。

   用法：
     node scripts/verify/deepseek_shadow.mjs [port]     # 默认 9799
   配合后端：
     DEEPSEEK_API_KEY=shadow DEEPSEEK_BASE_URL=http://127.0.0.1:9799 \
       node server/dev-server.mjs 8788
   ========================================================================== */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number.parseInt(process.argv[2] ?? process.env.SHADOW_PORT ?? '9799', 10);
const TOP_K = 4;

/* Stage B 的提示词里不含原始用户消息，这里保留最近一次 Stage A 的原文，
   用于模拟「模型在两阶段间保持上下文」。仅测试替身需要。 */
let LAST_USER_TEXT = '';

function load(name) {
  try { return JSON.parse(readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8')); } catch { return []; }
}
const rowsOf = (d) => (Array.isArray(d) ? d : (d.rows || []));

const RESOURCES = rowsOf(load('resources')).filter((r) => r.status === 'published');
const GOALS = rowsOf(load('learning-goals'));
const PATHS = rowsOf(load('learning-paths'));

/* ---- 从用户消息推断目标（模拟模型意图抽取）---- */
function inferGoal(text) {
  const t = String(text || '');
  if (/深海热液|喷口|地球化学耦合/.test(t)) return '深海热液喷口微生物代谢通路建模'; // 数据集不存在的目标 → NO_MATCHING_RESOURCE
  if (/单细胞|scRNA|RNA-seq/i.test(t)) return '单细胞 RNA-seq 入门';
  if (/数据分析|pandas/i.test(t)) return 'Python 数据分析';
  if (/文献/.test(t)) return '文献检索';
  if (/\bR\b|R 语言/i.test(t)) return 'R 语言入门';
  if (/python|编程入门|零基础/i.test(t)) return 'Python 入门';
  return 'Python 入门';
}

function inferBudget(text) {
  const t = String(text || '');
  // 注意：不能用 /0\s*元/ —— "预算100元" 也会命中。要求 0 前面不是数字。
  if (/免费|零元|(?:^|[^\d])0\s*元/.test(t)) return 0;
  const m = t.match(/预算\s*(\d+)\s*元/);
  return m ? Number(m[1]) : null;
}

function inferHours(text) {
  const m = String(text || '').match(/每周\s*(\d+)\s*小时/);
  return m ? Number(m[1]) : null;
}

/* ---- 响应构造 ---- */
function intentJSON(text) {
  return {
    goal: inferGoal(text),
    current_level: /零基础|初学者/.test(text) ? 'beginner' : (/(会|懂)\s*(一点)?\s*R|有基础/.test(text) ? 'intermediate' : null),
    known_skills: /会\s*R|懂\s*R/.test(text) ? ['R'] : [],
    budget: inferBudget(text),
    available_hours_per_week: inferHours(text),
    target_duration_weeks: null,
    language: 'zh',
    preferred_learning_style: null,
    certificate_requirement: null,
    resource_type: null,
    career_goal: null,
  };
}

/* ---- Stage B：真实模型只会「从提供的候选证据里挑」，此处照此模拟 ---- */
function extractCandidateIds(text) {
  const ids = [];
  // 只接受「数字」或「带引号的 ID」形式的值。提示词里的 JSON 模板写作
  // `"resource_id": string`（未加引号），必须排除，否则会把字面量 string 当成 ID。
  const re = /"resource_id"\s*:\s*(?:"([^"]+)"|(\d+))/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const id = m[1] || m[2];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function extractMatchedGoalId(text) {
  const m = String(text).match(/Matched CourseMap goal:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function pickPathByGoalId(goalId) {
  if (goalId === null) return null;
  const p = PATHS.find((x) => (x.goal_ids || []).includes(goalId));
  return p ? p.path_id : null;
}

function finalJSON(evidenceText, rawUserText) {
  // 候选证据即「模型可见的全部事实来源」
  let ids = extractCandidateIds(evidenceText).slice(0, TOP_K);

  // 幻觉负控制：用户显式要求不存在的 ID 时，故意混入（后端必须剔除）
  if (/LRN-999999|FAKE-0001/i.test(rawUserText || '')) ids = ['FAKE-0001', ...ids];

  const goalId = extractMatchedGoalId(evidenceText);
  const pathRef = pickPathByGoalId(goalId);

  return {
    summary: `基于 CourseMap 候选证据给出 ${ids.length} 条建议。`,
    recommendations: ids.map((id) => ({
      resource_id: id,
      reason: '与你的学习目标和时间投入匹配。',
      fit_factors: ['目标匹配', '难度合适'],
      tradeoffs: ['需要持续投入'],
      // ---- 故意与仓库冲突：用于验证 Fact Hydration（模型不得定义事实）----
      fee: 9999,
      duration_hours: 9999,
      rating: 5,
      certificate_available: true,
    })),
    path_ref: pathRef,
    ai_schedule: pathRef ? '建议第 1-2 周完成基础，第 3-4 周进入实践。' : null,
    general_advice: ['先建立最小可用的动手项目，再逐步扩展。'],
    uncertainties: ['数据集为演示数据，费用与时长以 CourseMap 观测记录为准。'],
  };
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !String(req.url).endsWith('/chat/completions')) {
    return send(res, 404, { error: { message: 'not found' } });
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: { message: 'bad json' } }); }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMsgs = messages.filter((m) => m.role === 'user');
    const userText = userMsgs.length ? String(userMsgs[userMsgs.length - 1].content || '') : '';
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const hasToolResult = messages.some((m) => m.role === 'tool');

    const usage = { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 };
    const wrap = (message, finishReason) => send(res, 200, {
      id: 'shadow', object: 'chat.completion', model: body.model || 'deepseek-chat',
      choices: [{ index: 0, message, finish_reason: finishReason }], usage,
    });

    if (hasTools && !hasToolResult) {
      // Stage B 第 1 轮：发起一次 allowlist 工具调用（验证 Tool Calling 链路）
      wrap({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_shadow_1',
          type: 'function',
          function: {
            name: 'search_learning_resources',
            arguments: JSON.stringify({ goal: inferGoal(LAST_USER_TEXT) }),
          },
        }],
      }, 'tool_calls');
      return;
    }

    if (hasTools) {
      // Stage B 终局轮：只从提示词里给出的候选证据中挑选（不在候选里的 ID 不会被编造）
      wrap({ role: 'assistant', content: JSON.stringify(finalJSON(userText, LAST_USER_TEXT)) }, 'stop');
      return;
    }

    // Stage A：意图抽取（此时的 user 消息就是原始用户消息）
    LAST_USER_TEXT = userText;
    wrap({ role: 'assistant', content: JSON.stringify(intentJSON(userText)) }, 'stop');
  });
});

server.listen(PORT, () => {
  console.log(`[deepseek-shadow] listening on http://127.0.0.1:${PORT} (resources=${RESOURCES.length}, goals=${GOALS.length})`);
});
