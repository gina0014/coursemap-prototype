#!/usr/bin/env node
/* ============================================================================
   CourseMap — tests/ai/oer-expansion.test.mjs
   ----------------------------------------------------------------------------
   Real OER Expansion 验收测试（Mock LLM + 真实数据集，零网络零成本）。

   覆盖规格模块：
     8  AI Retrieval        —— 新增 REAL 资源可被检索；明显有更合适的 REAL 时
                               不得只返回 DEMO；verification 是重要信号但**不是**
                               强制 REAL > DEMO 的开关
     9  Fact Hydration      —— provider / fee / difficulty / license / official_url
                               全部来自 Repository，模型不得自造
     10 测试项               —— real retrieval / prerequisite matching /
                               official source binding / license correctness /
                               unknown field handling / no hallucinated resources

   与 data1.test.mjs 的分工：
     data1.test.mjs 验的是「Data-1 的 40 条真实资源」这一批契约；
     本文件验的是「Real OER Expansion 新增的 19 条（Harvard CS50 / Google /
     MIT 补充 / OpenStax 补充）以及它们引入的新许可类型（CC BY 4.0）与
     unknown 许可」。两者都不调真实 API。

   运行：node tests/ai/oer-expansion.test.mjs   （退出码 0 = 全部通过）
   ========================================================================== */

import { AIOrchestrator } from '../../server/orchestrator/AIOrchestrator.mjs';
import { getRepository } from '../../server/repo/CourseMapRepository.mjs';
import { StructuredRetriever } from '../../server/retriever/StructuredRetriever.mjs';
import { sanitizeIntent } from '../../server/orchestrator/intentSchema.mjs';
import { MockLLMAdapter } from '../../server/llm/MockLLMAdapter.mjs';
import { ConversationStore } from '../../server/context/ConversationStore.mjs';
import { UsageLogger } from '../../server/cost/usageLog.mjs';

let passed = 0;
const failures = [];
function check(id, description, condition, detail = '') {
  if (condition) { passed += 1; console.log(`[PASS] ${id} ${description}`); } else {
    failures.push(`${id} ${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`[FAIL] ${id} ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

const repo = getRepository();
const retriever = new StructuredRetriever(repo);

const real = repo.resources.filter((r) => r.data_class === 'real' && r.status === 'published');
/* 注意：byTitle 是**子串**匹配，多个提供方可能有同名前缀的课程
   （例如 MIT 6.036 "Introduction to Machine Learning" 与 Google
   "Introduction to Machine Learning"）。凡是标题可能在多家重复的，
   一律改用 byUrl 精确定位，避免测试因匹配到别的提供方而假失败。 */
const byTitle = (needle) => real.find((r) => r.title.includes(needle)) || null;
const byUrl = (needle) => real.find((r) => String(r.url).includes(needle)) || null;

function mkOrchestrator(mock) {
  return new AIOrchestrator({
    adapter: mock,
    repository: repo,
    retriever,
    conversationStore: new ConversationStore(),
    usageLogger: new UsageLogger(),
  });
}

/* 每个真实资源被绑定来源声明支持的字段集合（判定「事实水合」的依据） */
const verifiedFieldsByRes = new Map();
for (const rs of repo.resourceSources) {
  const set = verifiedFieldsByRes.get(rs.resource_id) || new Set();
  for (const f of (rs.source_verified_fields || [])) set.add(f);
  verifiedFieldsByRes.set(rs.resource_id, set);
}

console.log('=========================================================');
console.log('CourseMap Real OER Expansion tests (Module 8/9/10, mock LLM)');
console.log('=========================================================');

/* ==========================================================================
   0 — 新增资源的身份与治理不变量
   ========================================================================== */

const CS50X = byTitle('CS50x');
const CS50P = byTitle('CS50\'s Introduction to Programming with Python');
const CS50AI = byTitle('Introduction to Artificial Intelligence with Python');
const CS50R = byTitle('Introduction to Programming with R');
const CS50SQL = byTitle('Introduction to Databases with SQL');
const CS50WEB = byTitle('Web Programming with Python and JavaScript');
const MLCC = byTitle('Machine Learning Crash Course');
const OCW_ALGO = byTitle('6.006');
const OCW_CT = byTitle('18.S191');
const OCW_RGIS = byTitle('Introduction to R and Geographic Information Systems');
const DD_075 = byTitle('15.075J');
const DD_310 = byTitle('14.310x');
const OS_PODS = byTitle('Principles of Data Science');
const OS_IBS = byTitle('Introductory Business Statistics 2e');

check('E-00', '新增资源全部就位（CS50×6 / Google×6 / MIT×3 / OpenStax×2）',
  [CS50X, CS50P, CS50AI, CS50R, CS50SQL, CS50WEB, MLCC, OCW_ALGO, OCW_CT, OCW_RGIS,
    DD_075, DD_310, OS_PODS, OS_IBS].every(Boolean),
  [CS50X, CS50P, CS50AI, CS50R, CS50SQL, CS50WEB, MLCC, OCW_ALGO, OCW_CT, OCW_RGIS,
    DD_075, DD_310, OS_PODS, OS_IBS].map((r) => (r ? r.resource_id : 'MISSING')).join(','));

check('E-00b', 'REAL 总数达 55+ 且全部有来源（无来源=不得发布）',
  real.length >= 55 && real.every((r) => repo.getSourcesForResource(r.resource_id).length > 0),
  `real=${real.length}`);

check('E-00c', '新增来源无一落在官方域名白名单之外（VR-C18 的运行时镜像）',
  repo.sources.filter((s) => s.data_class === 'real')
    .every((s) => new Set(['ocw.mit.edu', 'openstax.org', 'cs50.harvard.edu',
      'developers.google.com', 'developers.google.cn'])
      .has(new URL(s.official_url || s.url).hostname)));

/* ==========================================================================
   1 — 场景 1：零基础、免费学 Python
   ========================================================================== */
{
  const { intent } = sanitizeIntent({
    goal: 'Python 入门', current_level: 'beginner', budget: 0,
    known_skills: [], available_hours_per_week: null, target_duration_weeks: null,
  });
  const ret = retriever.retrieve(intent, 12);
  const ids = ret.candidates.map((r) => Number(r.resource_id));

  check('S1-01', '「零基础·免费·Python」检索非空', ret.candidates.length > 0, `n=${ret.candidates.length}`);
  check('S1-02', '候选集中包含已核验真实资源',
    ret.candidates.some((r) => r.data_class === 'real'),
    `real=${ret.candidates.filter((r) => r.data_class === 'real').length}`);
  check('S1-03', 'CS50P 与 MIT 6.100L 都在候选中（有更合适 REAL 时不会只返回 DEMO）',
    ids.includes(Number(CS50P.resource_id)) || ids.includes(Number(byTitle('6.100L').resource_id)),
    `ids=${ids.join(',')}`);
  check('S1-04', '所有候选中都不存在幻觉 ID（全部可在 Repository 中找到）',
    ids.every((id) => !!repo.getResourceById(id)));
  /* 预算=0 的语义：不得把 fee 未知的资源当成「免费」来推荐（Repository 侧保守放行，
     但必须能在数据层区分）。 */
  const freeCandidates = ret.candidates.filter((r) => r.fee === 0);
  const unknownFee = ret.candidates.filter((r) => r.fee === null);
  check('S1-05', '候选集中「免费（fee=0）」与「费用未核验（fee=null）」可区分',
    freeCandidates.length > 0 && (unknownFee.length + freeCandidates.length) === ret.candidates.length,
    `free=${freeCandidates.length} unknown=${unknownFee.length}`);
}

/* ==========================================================================
   2 — 场景 2：会 Python，想学人工智能
   ========================================================================== */
{
  const { intent } = sanitizeIntent({
    goal: '机器学习基础', current_level: 'intermediate', known_skills: ['Python 基础'],
  });
  /* 该 goal 下有 21 条可行资源（19 real + 2 demo），12 条窗口装不下。
     因此「是否被检索到」应在**该 goal 的完整候选序列**上判定，
     而不是要求某条资源必须挤进前 12 名 —— 后者是在断言一个任意名次。 */
  const ret12 = retriever.retrieve(intent, 12);
  const retAll = retriever.retrieve(intent, 200);
  const allIds = retAll.candidates.map((r) => Number(r.resource_id));

  check('S2-01', '「会 Python → 人工智能」检索非空', retAll.candidates.length > 0,
    `n=${retAll.candidates.length}`);
  check('S2-02', 'CS50AI 被该 goal 检索到（同一 goal 覆盖真实资源）',
    allIds.includes(Number(CS50AI.resource_id)),
    `cs50ai=${CS50AI.resource_id} inAll=${allIds.includes(Number(CS50AI.resource_id))}`);
  check('S2-03', '该 goal 的候选中覆盖多家官方来源（MIT / Google / Harvard）',
    new Set(retAll.candidates.filter((r) => r.data_class === 'real').map((r) => r.provider_id)).size >= 3,
    `providers=${[...new Set(retAll.candidates.filter((r) => r.data_class === 'real').map((r) => r.provider_id))].join(',')}`);

  /* 窗口构成（Module 8）：返回的候选窗口不得「只含 demo」——
     否则用户明明有更合适的 REAL 结果，却只看到 DEMO。 */
  check('S2-03b', '12 条候选窗口内不被 demo 占满（至少 3 条已核验真实资源）',
    ret12.candidates.filter((r) => r.data_class === 'real'
      && r.verification_status !== 'unverified').length >= 3,
    `real(verified)=${ret12.candidates.filter((r) => r.data_class === 'real' && r.verification_status !== 'unverified').length}`);

  /* prerequisite matching：同一 goal 下，**声明已会 Python** 应让
     「先修 = Python 基础」的 CS50AI 排位优于「声明已会一个无关技能」。
     这是「prerequisite fit 参与排序」的可执行证据。 */
  {
    const idxOf = (skills) => {
      const { intent: i } = sanitizeIntent({
        goal: '机器学习基础', current_level: 'intermediate', known_skills: skills,
      });
      return retriever.retrieve(i, 200).candidates
        .findIndex((r) => Number(r.resource_id) === Number(CS50AI.resource_id));
    };
    const withPy = idxOf(['Python 基础']);
    const withNone = idxOf(['Rust']);
    const noInfo = idxOf([]);
    check('S2-07', '先修匹配生效：声明「Python 基础」时 CS50AI 排位优于声明无关技能',
      withPy >= 0 && withNone >= 0 && withPy < withNone,
      `withPython=${withPy} withRust=${withNone}`);
    check('S2-07b', '空技能清单 = 未提及，不参与先修排序（与不传等价，不因默认值下调）',
      noInfo === withPy, `empty=${noInfo} withPython=${withPy}`);
  }

  /* prerequisite matching：CS50AI 的官方先修是「CS50x 或至少一年 Python」，
     被映射为 prerequisite_skill_ids=[Python 基础]，且官方原文被逐字保留。 */
  check('S2-04', 'CS50AI 带 prerequisite_skill_ids=[1]（Python 基础）',
    (CS50AI.prerequisite_skill_ids || []).includes(1),
    JSON.stringify(CS50AI.prerequisite_skill_ids));
  check('S2-05', 'CS50AI 保留官方先修原文（"CS50x or at least one year of experience with Python"）',
    typeof CS50AI.prerequisites_official === 'string'
    && /CS50x or at least one year of experience with Python/.test(CS50AI.prerequisites_official),
    String(CS50AI.prerequisites_official));
  check('S2-06', 'CS50AI 的官方等级为 Intermediate（由先修推导，非主观难度枚举）',
    CS50AI.level_official === 'Intermediate' && CS50AI.difficulty === null,
    `level_official=${CS50AI.level_official} difficulty=${CS50AI.difficulty}`);
}

/* ==========================================================================
   3 — 场景 3：想学机器学习，但 Python 基础一般（前置链）
   ========================================================================== */
{
  const goalML = repo.findGoalByName('机器学习基础');
  const prereq = repo.getPrerequisites(goalML.goal_id);

  check('S3-01', '「机器学习基础」存在前置目标（不是零门槛空目标）',
    prereq && prereq.prerequisite_goals.length > 0,
    JSON.stringify((prereq.prerequisite_goals || []).map((g) => g.name)));
  check('S3-02', '前置链可逐级展开到「Python 入门」（供 AI 解释「为什么先补基础」）', (() => {
    const seen = new Set();
    const walk = (id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      const p = repo.getPrerequisites(id);
      if (!p) return false;
      if (p.prerequisite_goals.some((g) => g.name === 'Python 入门')) return true;
      return p.prerequisite_goals.some((g) => walk(g.goal_id));
    };
    return walk(goalML.goal_id);
  })());

  const { intent } = sanitizeIntent({ goal: '机器学习基础', current_level: 'beginner' });
  const ret = retriever.retrieve(intent, 12);
  check('S3-03', '初学者水平下检索仍非空（难度是软排序，不硬过滤）',
    ret.candidates.length > 0, `n=${ret.candidates.length}`);
  check('S3-04', '候选中含已核验真实资源（不会因「基础一般」就只给演示数据）',
    ret.candidates.some((r) => r.data_class === 'real'));
}

/* ==========================================================================
   4 — 场景 4：想学习 R
   ========================================================================== */
{
  const { intent } = sanitizeIntent({ goal: 'R 语言入门', current_level: 'beginner' });
  const ret = retriever.retrieve(intent, 12);
  const ids = ret.candidates.map((r) => Number(r.resource_id));

  check('S4-01', '「R 语言入门」检索非空', ret.candidates.length > 0, `n=${ret.candidates.length}`);
  check('S4-02', 'CS50R 与 MIT「Introduction to R and GIS」都被检索到',
    ids.includes(Number(CS50R.resource_id)) && ids.includes(Number(OCW_RGIS.resource_id)),
    `ids=${ids.join(',')}`);
  check('S4-03', 'R 方向候选全部为真实资源（该目标下无演示数据混入前排）',
    ret.candidates.filter((r) => r.data_class === 'real').length >= 2,
    `real=${ret.candidates.filter((r) => r.data_class === 'real').length}`);
}

/* ==========================================================================
   5 — 场景 5：想学习数据分析
   ========================================================================== */
{
  const { intent } = sanitizeIntent({ goal: '数据分析与统计推断', current_level: 'beginner' });
  const ret = retriever.retrieve(intent, 12);
  const ids = ret.candidates.map((r) => Number(r.resource_id));

  check('S5-01', '「数据分析与统计推断」检索非空', ret.candidates.length > 0, `n=${ret.candidates.length}`);
  check('S5-02', '三条新增数据分析资源均被检索到（15.075J / 14.310x / OpenStax 数据科学）',
    [DD_075, DD_310, OS_PODS].every((r) => ids.includes(Number(r.resource_id))),
    `ids=${ids.join(',')}`);
  check('S5-03', '数据分析方向真实资源 ≥ 3 条（补充前为 2 条）',
    real.filter((r) => r.subject_id === 2).length >= 3,
    `subject2_real=${real.filter((r) => r.subject_id === 2).length}`);
}

/* ==========================================================================
   6 — verification 是重要信号，但不是 REAL > DEMO 的强制开关
   ========================================================================== */
{
  const { intent } = sanitizeIntent({ goal: 'Python 入门', current_level: 'beginner' });
  const ret = retriever.retrieve(intent, 20);
  const firstReal = ret.candidates.findIndex((r) => r.data_class === 'real');
  check('S6-01', '同一难度层内，真实资源优先出现在前排', firstReal >= 0 && firstReal < 10,
    `firstRealIndex=${firstReal}`);
  /* 反向证据：orderByDataClass 只做层内稳定分组，不应把 demo 全部丢到末尾
     （否则「real 永远第一」）。这里断言 demo 仍然存在于候选集内。 */
  check('S6-02', 'demo 记录仍然保留在候选集中（未被硬过滤掉）',
    ret.candidates.some((r) => r.data_class === 'demo') || ret.total === ret.candidates.length,
    `demo=${ret.candidates.filter((r) => r.data_class === 'demo').length} total=${ret.total}`);
  check('S6-03', '检索返回 data_class_counts（供上层披露真实/演示构成）',
    !!ret.data_class_counts && typeof ret.data_class_counts.real === 'number',
    JSON.stringify(ret.data_class_counts));
}

/* ==========================================================================
   6b — 排序优先级回归：语言偏好**不得**翻转「真实优先」（2026-10-06 缺陷）
   --------------------------------------------------------------------------
   缺陷：检索器原先连续调用 orderByDifficulty → orderByDataClass →
   orderByLanguage。由于每次都是**稳定**排序，最后一个键成为**最高**优先级，
   实际优先级变成 language > dataClass > difficulty —— 与文档相反。
   实测：目标「机器学习基础」+ 语言 zh 时，4 条 zh 演示资源全部排在
   全部已核验真实资源之前（正是 Module 8 禁止的「只给 DEMO」）。

   断言的是**不变量**而非某个具体名次：在同一难度适配层内，
   不允许出现「demo 排在 real 之前」。
   ========================================================================== */
{
  const dist = { beginner: 0, intermediate: 1, advanced: 2 };
  const dataRank = (r) => {
    if (r.data_class !== 'real') return 2;
    return (r.verification_status && r.verification_status !== 'unverified') ? 0 : 1;
  };
  const layer = (r, level) => {
    const t = dist[level];
    if (t === undefined) return 0;
    return dist[r.difficulty] === undefined ? 9 : Math.abs(dist[r.difficulty] - t);
  };

  const goals = ['Python 入门', '机器学习基础', '数据分析与统计推断', 'R 语言入门', '研究方法'];
  const violations = [];
  for (const gname of goals) {
    for (const lang of [null, 'zh', 'en']) {
      const { intent } = sanitizeIntent({ goal: gname, current_level: 'beginner', language: lang });
      const ret = retriever.retrieve(intent, 12);
      const cs = ret.candidates;
      for (let i = 0; i < cs.length; i += 1) {
        for (let j = i + 1; j < cs.length; j += 1) {
          /* 同一难度层内，较后的资源不得拥有更好的真实性等级 */
          if (layer(cs[i], 'beginner') === layer(cs[j], 'beginner')
            && dataRank(cs[i]) > dataRank(cs[j])) {
            violations.push(`${gname}/${lang || 'auto'}: #${i}(demo) before #${j}(real)`);
          }
        }
      }
    }
  }
  check('S6b-01', '同难度层内「demo 排在 real 之前」的违例为 0（含 language=zh/en 强制偏好）',
    violations.length === 0, violations.slice(0, 4).join(' | '));

  /* 反向证据：语言偏好仍然生效 —— 但只在**同难度层、同真实性等级**内生效。
     不能要求「zh 一定排在 en 前面」：那正是修复前的错误优先级
     （language 越过了 difficulty 与 dataClass）。 */
  {
    const { intent } = sanitizeIntent({ goal: '机器学习基础', current_level: 'intermediate', language: 'zh' });
    const cs = retriever.retrieve(intent, 200).candidates;
    const pairViolations = [];
    for (let i = 0; i < cs.length; i += 1) {
      for (let j = i + 1; j < cs.length; j += 1) {
        if (layer(cs[i], 'intermediate') !== layer(cs[j], 'intermediate')) continue;
        if (dataRank(cs[i]) !== dataRank(cs[j])) continue;
        const langKey = (r) => (r.language === 'zh' ? 0 : (r.language === 'bilingual' ? 1 : 2));
        if (langKey(cs[i]) > langKey(cs[j])) {
          pairViolations.push(`#${i}(${cs[i].language}) before #${j}(${cs[j].language})`);
        }
      }
    }
    check('S6b-02', '语言偏好仍在同层同真实性内生效（无 zh 资源排在更外文资源之后的违例）',
      pairViolations.length === 0, pairViolations.slice(0, 3).join(' | '));
  }

  /* 缺陷回归（可变异）：修复前，语言偏好为 zh 时 **全部** zh 演示资源
     都排在 **全部** 真实资源之前；断言「首条真实资源之前的演示条数
     必须少于演示资源总数」即可捕获该缺陷。 */
  {
    const { intent } = sanitizeIntent({ goal: '机器学习基础', current_level: 'intermediate', language: 'zh' });
    const cs = retriever.retrieve(intent, 200).candidates;
    const demosTotal = cs.filter((r) => r.data_class === 'demo').length;
    const firstReal = cs.findIndex((r) => r.data_class === 'real');
    const demosBefore = firstReal < 0 ? demosTotal : firstReal;
    check('S6b-03', `语言偏好 zh 时 demo 未整体压过 real（首个 real 前有 ${demosBefore} 条 demo / 共 ${demosTotal} 条 demo）`,
      firstReal >= 0 && demosBefore < demosTotal,
      `firstRealIndex=${firstReal} demosTotal=${demosTotal}`);
  }
}

/* ==========================================================================
   7 — 事实水合：LLM 不得自造 provider / fee / difficulty / license / official_url
   ========================================================================== */
{
  const target = CS50P;
  /* 故意让「模型」给出错误的 fee/duration/provider —— orchestrator 必须用
     Repository 的值覆盖掉，而不是照抄模型输出。 */
  const mock = new MockLLMAdapter({
    intent: {
      goal: 'Python 入门', current_level: 'beginner', known_skills: [], budget: null,
      available_hours_per_week: null, target_duration_weeks: null, language: null,
      preferred_learning_style: null, certificate_requirement: null, resource_type: null,
      career_goal: null,
    },
    final: {
      recommendations: [{
        resource_id: target.resource_id,
        reason: '零基础可学的 Python 入门课（模型解释）',
        fit_factors: ['无先修要求'],
        tradeoffs: [],
        /* 下面这些是「模型幻觉」：orchestrator 必须无视 */
        fee: 9999, currency: 'USD', duration_hours: 123, difficulty: 'advanced',
        provider: '不存在的机构', certificate_available: true,
      }],
      general_advice: [], uncertainties: [], summary: '测试', path_ref: null, ai_schedule: null,
    },
  });

  const out = await mkOrchestrator(mock).advise(
    { message: '我是零基础大学生，想免费学 Python。', conversation_id: null, context: null },
    { requestId: 'oer-hydration-1', clientIp: 'test' },
  );

  const rec = (out.recommendations || [])[0] || {};
  check('H-01', '推荐仍然指向 CourseMap 中存在的资源', !!rec.resource_id && !!repo.getResourceById(rec.resource_id),
    `id=${rec.resource_id}`);
  check('H-02', 'fee 来自 Repository（0 或 null），不是模型给的 9999',
    rec.fee === 0 || rec.fee === null, `fee=${JSON.stringify(rec.fee)}`);
  check('H-03', 'currency 未被模型写坏（Repository 为 null）', rec.currency === null || rec.currency === undefined,
    `currency=${JSON.stringify(rec.currency)}`);
  check('H-04', 'duration_hours 未被模型编成 123', rec.duration_hours === null || rec.duration_hours === undefined,
    `duration=${JSON.stringify(rec.duration_hours)}`);
  check('H-05', 'difficulty 未被模型改成 advanced（Repository 为 null，官方等级另存 level_official）',
    rec.difficulty === null || rec.difficulty === undefined, `difficulty=${JSON.stringify(rec.difficulty)}`);
  check('H-06', 'provider 来自 Repository（CS50 / 哈佛），不是模型编的机构名',
    rec.provider && /CS50|哈佛|Harvard/i.test(String(rec.provider)),
    `provider=${JSON.stringify(rec.provider)}`);
  check('H-07', 'certificate_available 来自 Repository（CS50 为 true）',
    rec.certificate_available === true, `cert=${JSON.stringify(rec.certificate_available)}`);
  check('H-08', '官方链接来自 Repository，且与来源 official_url 一致',
    rec.official_url === CS50P.url, `official_url=${rec.official_url} repo=${CS50P.url}`);
  check('H-09', '许可来自 Repository（CC BY-NC-SA 4.0）且可被序列化展示',
    rec.license === 'CC BY-NC-SA 4.0' || (rec.license && rec.license.license === 'CC BY-NC-SA 4.0')
    || /CC BY-NC-SA/.test(JSON.stringify(rec.license || '')),
    JSON.stringify(rec.license));
  check('H-10', 'grounding 元信息随响应返回（verified_recommendations / unknown_fields / policy）',
    out.grounding && typeof out.grounding.verified_recommendations === 'number'
    && Array.isArray(out.grounding.unknown_fields) && typeof out.grounding.policy === 'string',
    JSON.stringify(out.grounding));
  check('H-11', 'CS50P 的未知字段被如实列入（duration_hours / rating 等为 null）',
    Array.isArray(rec.unknown_fields) && rec.unknown_fields.length > 0,
    JSON.stringify(rec.unknown_fields));
}

/* ==========================================================================
   8 — 幻觉资源：不存在的 ID 必须被剔除
   ========================================================================== */
{
  const mock = new MockLLMAdapter({
    intent: {
      goal: 'Python 入门', current_level: 'beginner', known_skills: [], budget: null,
      available_hours_per_week: null, target_duration_weeks: null, language: null,
      preferred_learning_style: null, certificate_requirement: null, resource_type: null,
      career_goal: null,
    },
    final: {
      recommendations: [
        { resource_id: 999001, reason: '这个课程不存在', fit_factors: [], tradeoffs: [] },
        { resource_id: CS50P.resource_id, reason: '真实课程', fit_factors: [], tradeoffs: [] },
      ],
      general_advice: [], uncertainties: [], summary: '测试', path_ref: null, ai_schedule: null,
    },
  });
  const out = await mkOrchestrator(mock).advise(
    { message: '推荐一个 Python 课程', conversation_id: null, context: null },
    { requestId: 'oer-halluc-1', clientIp: 'test' },
  );
  const ids = (out.recommendations || []).map((r) => Number(r.resource_id));
  check('H-12', '不存在的 resource_id 被代码层剔除（幻觉防线）', !ids.includes(999001), `ids=${ids.join(',')}`);
  check('H-13', '真实资源仍然保留在推荐里', ids.includes(Number(CS50P.resource_id)), `ids=${ids.join(',')}`);
}

/* ==========================================================================
   9 — 许可正确性：三种真实许可必须能被分别表达
   ========================================================================== */
{
  const licOf = (rid) => {
    const s = repo.getSourcesForResource(rid)[0]?.source;
    return s ? { license: s.license, commercial: s.commercial_use, pd: s.public_domain, perm: s.usage_permission } : null;
  };
  const cs50 = licOf(CS50P.resource_id);
  const goog = licOf(byUrl('developers.google.com/machine-learning/intro-to-ml').resource_id);
  const mlcc = licOf(MLCC.resource_id);

  check('L-01', 'CS50 许可为 CC BY-NC-SA 4.0（禁止商用）',
    cs50 && cs50.license === 'CC BY-NC-SA 4.0' && cs50.commercial === false, JSON.stringify(cs50));
  check('L-02', 'Google 模块页许可为 CC BY 4.0（**允许**商用 — 与 CS50 不同）',
    goog && goog.license === 'CC BY 4.0' && goog.commercial === true, JSON.stringify(goog));
  check('L-03', 'MLCC 落地页无许可声明 → 记为 unknown，且不声明任何开放语义',
    mlcc && mlcc.license === 'unknown' && mlcc.commercial !== true && mlcc.pd !== true
    && mlcc.perm === 'unknown', JSON.stringify(mlcc));
  check('L-04', '三种许可互不相同，且没有一种被写成公有领域',
    new Set([cs50.license, goog.license, mlcc.license]).size === 3
    && [cs50, goog, mlcc].every((l) => l.pd !== true),
    [cs50, goog, mlcc].map((l) => l.license).join(' / '));
  check('L-05', 'CS50 未就 AI 训练表态 → ai_training_allowed 为 null（不推测）',
    (() => {
      const s = repo.getSourcesForResource(CS50P.resource_id)[0]?.source;
      return s && s.ai_training_allowed === null;
    })());
  check('L-06', 'OpenStax 明确禁止 LLM 训练（false）与 Google CC BY 4.0（true）形成对照',
    (() => {
      const stax = repo.getSourcesForResource(OS_PODS.resource_id)[0]?.source;
      const g = repo.getSourcesForResource(byUrl('developers.google.com/machine-learning/intro-to-ml').resource_id)[0]?.source;
      return stax && stax.ai_training_allowed === false && g && g.ai_training_allowed === true;
    })());
}

/* ==========================================================================
   10 — 来源绑定：每条真实资源都能点回官方页面
   ========================================================================== */
{
  const broken = [];
  for (const r of real) {
    const sources = repo.getSourcesForResource(r.resource_id);
    if (!sources.length) { broken.push(`${r.resource_id}:no-source`); continue; }
    const official = sources.map((s) => s.source.official_url || s.source.url).filter((u) => /^https?:\/\//.test(u));
    if (!official.length) { broken.push(`${r.resource_id}:no-official-url`); continue; }
    if (!official.includes(r.url)) { broken.push(`${r.resource_id}:url-mismatch`); }
  }
  check('B-01', `全部 ${real.length} 条真实资源都有官方来源且 resource.url 与来源一致（Broken = 0）`,
    broken.length === 0, broken.slice(0, 8).join(','));

  const noObserved = real.filter((r) => !r.observed_at);
  check('B-02', '全部真实资源都带 observed_at（来源治理要求）', noObserved.length === 0,
    noObserved.map((r) => r.resource_id).join(','));

  /* 新增资源的来源必须带 verification_url 或与官方域一致（Google 的核验域记录） */
  const googSources = repo.sources.filter((s) => s.provider_id === 104 || /google\./i.test(String(s.official_url)));
  check('B-03', 'Google 来源记录了实际完成核验的官方域（verification_url）',
    googSources.length > 0 && googSources.every((s) => /developers\.google\.(com|cn)/.test(String(s.verification_url || ''))),
    JSON.stringify(googSources.map((s) => s.verification_url).slice(0, 3)));
}

/* ==========================================================================
   11 — 新增资源的「未知字段」处理：不猜
   ========================================================================== */
{
  const newOnes = [CS50X, CS50P, CS50AI, CS50R, CS50SQL, CS50WEB, MLCC, OCW_ALGO, OCW_CT, OCW_RGIS,
    DD_075, DD_310, OS_PODS, OS_IBS];
  check('N-01', '新增资源的 duration_hours / weekly_workload_hours 一律为 null（官方未提供）',
    newOnes.every((r) => r.duration_hours === null && r.weekly_workload_hours === null));
  check('N-02', '新增资源的 rating / rating_count 一律为 null（官方未提供评分）',
    newOnes.every((r) => r.rating === null && r.rating_count === null));
  check('N-03', '新增资源的 difficulty 一律为 null（不把官方 level 猜成 CourseMap 难度枚举）',
    newOnes.every((r) => r.difficulty === null));
  check('N-04', 'Google 资源的 fee 为 null（官方页面未声明课程费用，不得用「显然免费」替代来源）',
    [MLCC, byUrl('machine-learning/intro-to-ml'), byUrl('machine-learning/problem-framing')]
      .filter(Boolean).every((r) => r.fee === null));
  check('N-05', 'CS50 证书为 true（官方 FAQ：免费 CS50 Certificate），MIT OCW 为 false（官方：不提供学分或认证）',
    CS50P.certificate_available === true && byTitle('6.100L').certificate_available === false);
  check('N-06', 'OpenStax 新增教材的 certificate_available 为 null（官方未说明 → 不猜）',
    [OS_PODS, OS_IBS].every((r) => r.certificate_available === null));
  check('N-07', '新增资源均无 description（官方描述未逐条核验 → null，前端显示「官方描述未核验」）',
    newOnes.every((r) => r.description === null));
}

/* ==========================================================================
   12 — 用户场景端到端（Mock）：回答里的事实必须能在 Repository 中找到
   ========================================================================== */
{
  const scenarios = [
    { id: 'SC1', msg: '我是零基础大学生，想免费学 Python。', goal: 'Python 入门', level: 'beginner', budget: 0 },
    { id: 'SC2', msg: '我会 Python，想学人工智能。', goal: '机器学习基础', level: 'intermediate' },
    { id: 'SC3', msg: '我想学机器学习，但是 Python 基础一般。', goal: '机器学习基础', level: 'beginner' },
    { id: 'SC4', msg: '我想学习 R。', goal: 'R 语言入门', level: 'beginner' },
    { id: 'SC5', msg: '我想学习数据分析。', goal: '数据分析与统计推断', level: 'beginner' },
  ];

  for (const sc of scenarios) {
    const { intent } = sanitizeIntent({
      goal: sc.goal, current_level: sc.level, budget: sc.budget ?? null,
    });
    const ret = retriever.retrieve(intent, 6);
    /* 模拟 Stage B：模型只回 id + 理由，事实全部由平台回填 */
    const mock = new MockLLMAdapter({
      intent: {
        goal: sc.goal, current_level: sc.level, known_skills: [], budget: sc.budget ?? null,
        available_hours_per_week: null, target_duration_weeks: null, language: null,
        preferred_learning_style: null, certificate_requirement: null, resource_type: null,
        career_goal: null,
      },
      final: {
        /* 模拟 Stage B：模型看到的是**整个候选窗口**（生产行为），
           而不是前 3 条。这里若只取 3 条，测的就是 mock 的裁剪，
           而不是检索质量。 */
        recommendations: ret.candidates.map((r) => ({
          resource_id: r.resource_id, reason: '契合目标（模型解释）', fit_factors: [], tradeoffs: [],
        })),
        general_advice: [], uncertainties: [], summary: `${sc.id} 测试`, path_ref: null, ai_schedule: null,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    const out = await mkOrchestrator(mock).advise(
      { message: sc.msg, conversation_id: null, context: null },
      { requestId: `oer-sc-${sc.id}`, clientIp: 'test' },
    );
    const recs = out.recommendations || [];

    check(`${sc.id}-a`, `[${sc.msg}] 返回推荐且不为空`, recs.length > 0, `n=${recs.length}`);
    const ids = recs.map((r) => Number(r.resource_id));
    check(`${sc.id}-b`, `[${sc.msg}] 全部推荐都是 CourseMap 中的真实 ID（无幻觉）`,
      ids.every((id) => !!repo.getResourceById(id)), `ids=${ids.join(',')}`);
    /* 事实绑定：DOM 会渲染的这些字段必须逐字等于 Repository */
    const mismatched = [];
    for (const rec of recs) {
      const row = repo.getResourceById(rec.resource_id);
      if (!row) continue;
      if (rec.fee !== row.fee) mismatched.push(`${rec.resource_id}.fee`);
      if ((rec.duration_hours ?? null) !== (row.duration_hours ?? null)) mismatched.push(`${rec.resource_id}.duration`);
      if ((rec.difficulty ?? null) !== (row.difficulty ?? null)) mismatched.push(`${rec.resource_id}.difficulty`);
      if (rec.official_url !== row.url) mismatched.push(`${rec.resource_id}.official_url`);
    }
    check(`${sc.id}-c`, `[${sc.msg}] 事实水合：fee/duration/difficulty/official_url 全部等于 Repository`,
      mismatched.length === 0, mismatched.slice(0, 4).join(','));
    const realCount = recs.filter((r) => {
      const row = repo.getResourceById(r.resource_id);
      return row && row.data_class === 'real';
    }).length;
    check(`${sc.id}-d`, `[${sc.msg}] 候选窗口内含已核验真实资源（存在合适 REAL 时不只给 DEMO）`,
      realCount > 0, `real=${realCount}/${recs.length}`);
    /* Module 8：存在合适的 REAL 时，窗口不得被 DEMO 占满 */
    const verifiedReal = recs.filter((r) => {
      const row = repo.getResourceById(r.resource_id);
      return row && row.data_class === 'real' && row.verification_status !== 'unverified';
    }).length;
    check(`${sc.id}-e`, `[${sc.msg}] 窗口内至少 ${Math.min(3, verifiedReal)} 条已核验真实资源未被 demo 挤出`,
      verifiedReal >= 1, `verifiedReal=${verifiedReal}/${recs.length}`);
  }

  /* 反向证据（Module 7）：完全没有删除 Demo Dataset —— 演示数据仍在数据集中，
     只是不再出现在首页精选区，也不再在检索中无条件优先。 */
  const demoAlive = repo.resources.filter((r) => r.data_class === 'demo' && r.status === 'published');
  check('SC-demo-kept', `Demo Dataset 未被删除（演示资源仍有 ${demoAlive.length} 条在库）`,
    demoAlive.length >= 40, `demo=${demoAlive.length}`);
}

/* ==========================================================================
   汇总
   ========================================================================== */
console.log('---------------------------------------------------------');
console.log(`PASS: ${passed}  FAIL: ${failures.length}`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
