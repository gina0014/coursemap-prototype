/* ============================================================================
   CourseMap — pages/advisor.js
   ----------------------------------------------------------------------------
   P-09 AI Learning Advisor（MoT #6 / AI-MoT #1–#7）。

   v0.2 双引擎设计：
     引擎 A（主）：AI Beta —— 调用 CourseMap AI Backend（DeepSeek 服务端代理）。
       - LearningDecisionRequest/Response 契约不变。
       - 事实二次校验：前端只用返回的 resource_id 到本地 CourseMap 数据
         （ctx / derive）重新取数渲染 —— Repository Facts > Model Facts。
       - 回答分层：「基于 CourseMap 数据」≠「AI 学习建议」。
     引擎 B（降级）：Rule-based Prototype —— 后端不可用 / 未配置 Key 时。
       - 明确显示优雅降级信息，核心搜索/对比/路径功能不依赖 AI。

   UI 必须持续表达：REAL LLM（或降级）+ DEMO DATA 两件事同时成立。
   ========================================================================== */

import { initPage } from './base.js';
import {
  renderInto, L, badgeDemo, badgeDataClass, badgeDifficulty, licenseBadge,
  officialResourceLink, AI_DISCLAIMER, labelOf, SOURCE_VERIFICATION,
} from '../components.js';
import { esc, money, rating1 } from '../utils.js';
import { parseDecisionRequest, buildDecisionResponse } from '../ai-advisor.js';
import { resourceSummary } from '../derive.js';
import { AI } from '../config.js';
import { askAdvisor, probeBackend, clearConversation } from '../ai-client.js';

/* Module O：CourseMap 未核验字段的统一文案。禁止模型/前端自行补数字。 */
const UNKNOWN_FIELD_LABELS = {
  difficulty: '难度',
  duration_hours: '总时长',
  weekly_workload_hours: '每周投入',
  certificate_available: '是否提供证书',
  rating: '学习评分',
  description: '课程描述',
  observed_at: '信息观测日期',
};
const UNVERIFIED_TEXT = 'CourseMap 当前未核验该字段';

initPage({
  active: 'advisor',
  async onReady(ctx) {
    const mount = document.querySelector('[data-page]');
    const backend = await probeBackend();
    const aiMode = backend.available && backend.llmConfigured;
    const backendConfigured = backend.configured;
    /* Module P：数据集真实/演示构成（运行时计算，禁止硬编码） */
    const dataStats = (ctx && ctx.stats && ctx.stats.totals && ctx.stats.totals.resources) || null;

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>AI 学习顾问</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">AI 学习顾问
            <span class="badge badge--experimental">${aiMode ? 'Beta · Real LLM' : 'Beta · 降级模式'}</span>
          </h1>
        </div>
        <button type="button" class="btn" data-advisor-clear title="清除本会话上下文（仅本地会话标识）">清空会话</button>
      </div>

      <div class="notice" data-coursemap-ai-disclosure>
        <div class="notice__title">${aiMode
          ? 'AI Learning Advisor Beta · Powered by DeepSeek（服务端代理，前端零密钥）'
          : (backendConfigured
            ? 'AI 学习顾问暂时不可用 · 降级为规则原型（Rule-based Prototype · Not LLM）'
            : 'AI 后端尚未接入部署 · 降级为规则原型（Rule-based Prototype · Not LLM）')}</div>
        ${esc(AI_DISCLAIMER)}
        ${aiMode
          ? '推荐以 CourseMap 结构化数据为<strong>证据层</strong>：具体课程价格、时长、证书等信息以 CourseMap 已核验数据及原始来源为准。'
          : '你仍可使用<a href="pages/search.html">课程搜索</a>与<a href="pages/compare.html">对比</a>功能；下方规则引擎的结果可解释、可回溯。'}
        ${aiMode && dataStats
    ? `<div style="margin-top:6px;">
            AI 是真的（DeepSeek，服务端代理），但<strong>「AI 是真实的」不等于「全部数据都是真实的」</strong>：
            当前数据集共 <strong class="num">${dataStats.total}</strong> 条学习资源，其中已核验真实 OER <strong class="num">${dataStats.real}</strong> 条、演示 DEMO <strong class="num">${dataStats.demo}</strong> 条。
            标有 REAL 徽标且带「查看官方资源」的是可溯源的真实资源；DEMO 条目仅用于演示，不代表真实存在的课程。
          </div>`
    : ''}
        <strong>AI 推荐不构成学习成果保证。</strong>
      </div>

      <form class="ai-panel" data-advisor-form aria-label="AI 学习顾问输入">
        <div class="ai-panel__head"><span class="ai-sparkle" aria-hidden="true">✦</span> Tell CourseMap your goal, background and constraints.</div>
        <p class="cmp-dim" style="margin-top:-6px;">我们会用 CourseMap 已核验的资源，为你组织一份学习策略。你可以先填结构化的条件，也可以直接用一句话描述。</p>

        <fieldset class="advisor-fieldset" style="margin-top:16px;">
          <legend class="advisor-legend">1 · 结构化条件（可留空）</legend>
          <div class="advisor-form-grid">
            <div class="field field--full">
              <label class="field__label" for="advisor-goal">学习目标 Goal</label>
              <input class="control" id="advisor-goal" data-advisor-field="goal" type="text"
                     placeholder="例如：Python 数据分析 / 机器学习 / 文献检索">
            </div>
            <div class="field">
              <label class="field__label" for="advisor-level">当前水平 Current level</label>
              <select class="control" id="advisor-level" data-advisor-field="level">
                <option value="">未指定</option>
                <option value="零基础 / 入门">零基础 / 入门</option>
                <option value="有一些基础">有一些基础</option>
                <option value="进阶">进阶</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="advisor-hours">每周可投入时间</label>
              <select class="control" id="advisor-hours" data-advisor-field="hours">
                <option value="">未指定</option>
                <option value="2">≤ 2 小时/周</option>
                <option value="5">约 5 小时/周</option>
                <option value="8">约 8 小时/周</option>
                <option value="12">12 小时以上/周</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="advisor-duration">目标周期 Target duration</label>
              <select class="control" id="advisor-duration" data-advisor-field="duration">
                <option value="">未指定</option>
                <option value="一个月">一个月</option>
                <option value="两个月">两个月</option>
                <option value="三个月">三个月</option>
                <option value="半年">半年</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="advisor-budget">预算 Budget</label>
              <select class="control" id="advisor-budget" data-advisor-field="budget">
                <option value="">未指定</option>
                <option value="免费">免费（0 元）</option>
                <option value="50">¥50 以内</option>
                <option value="200">¥200 以内</option>
                <option value="500">¥500 以内</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="advisor-language">偏好语言 Language</label>
              <select class="control" id="advisor-language" data-advisor-field="language">
                <option value="">不限</option>
                <option value="中文">中文</option>
                <option value="英文">英文</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset class="advisor-fieldset" style="margin-top:20px;">
          <legend class="advisor-legend">2 · 或者直接用一句话描述（Natural language）</legend>
          <label class="field__label" for="advisor-input">你的学习需求</label>
          <textarea class="control" id="advisor-input" data-advisor-input rows="3"
            placeholder="告诉 CourseMap 你想学什么、你的基础、预算和时间，例如：我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。"></textarea>
        </fieldset>

        <div class="advisor-actions">
          <button type="submit" class="btn btn--primary" data-advisor-submit>${aiMode ? 'Generate my learning path ✦' : '获取学习建议（规则引擎）'}</button>
          <span class="cmp-dim" style="font-size:var(--cm-fs-sm);">结构化条件会与自然语言合并后一起提交；两者都为空时不会发送请求。</span>
        </div>

        <div class="cluster" style="margin-top:12px;">
          <span class="cmp-dim">试试示例：</span>
          <button type="button" class="chip" data-advisor-example="我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。">Python 数据分析</button>
          <button type="button" class="chip" data-advisor-example="我会一点R，想入门单细胞RNA-seq，两个月，每周5小时。">单细胞分析</button>
          <button type="button" class="chip" data-advisor-example="我需要免费学习文献检索，每周3小时。">文献检索</button>
        </div>
        <p class="cmp-dim" style="margin-top:12px;">本会话为 session 级上下文（结构化约束保留，如改预算不必重述目标）；不建立长期用户画像，不收集敏感个人信息。</p>
      </form>

      <div data-advisor-status aria-live="polite" style="margin-top:16px;"></div>
      <section data-advisor-result style="margin-top:8px;"></section>
    `;

    const input = mount.querySelector('[data-advisor-input]');
    const statusNode = mount.querySelector('[data-advisor-status]');
    const resultNode = mount.querySelector('[data-advisor-result]');
    const submitBtn = mount.querySelector('[data-advisor-submit]');

    /* UI V0.2：结构化条件 → 自然语言。**API 契约不变**：仍然只有一个 text 参数。 */
    const readFields = () => {
      const get = (key) => (mount.querySelector(`[data-advisor-field="${key}"]`)?.value || '').trim();
      return {
        goal: get('goal'),
        level: get('level'),
        hours: get('hours'),
        duration: get('duration'),
        budget: get('budget'),
        language: get('language'),
      };
    };

    const composeText = () => {
      const f = readFields();
      const parts = [];
      if (f.goal) parts.push(`我想学习${f.goal}`);
      if (f.level) parts.push(`我目前${f.level}`);
      if (f.hours) parts.push(`每周可投入 ${f.hours} 小时`);
      if (f.duration) parts.push(`希望${f.duration}内完成`);
      if (f.budget) parts.push(`预算${f.budget}`);
      if (f.language) parts.push(`偏好${f.language}资源`);
      const structured = parts.join('，');
      const natural = input.value.trim();
      if (structured && natural) return `${structured}。补充说明：${natural}`;
      return structured || natural;
    };

    /* 从首页 Hero 的 AI 目标输入带入（?q=） */
    const prefill = new URLSearchParams(location.search).get('q');
    if (prefill) {
      const goalField = mount.querySelector('[data-advisor-field="goal"]');
      if (goalField) goalField.value = prefill;
    }

    mount.querySelectorAll('[data-advisor-example]').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.advisorExample;
        const goalField = mount.querySelector('[data-advisor-field="goal"]');
        if (goalField) goalField.value = '';
      });
    });
    mount.querySelector('[data-advisor-clear]').addEventListener('click', () => {
      clearConversation();
      statusNode.textContent = '会话已清空。';
      resultNode.innerHTML = '';
    });

    /* ---------- Fact hydration：展示事实一律从本地 CourseMap 数据取 ---------- */
    const hydrate = (resourceId) => {
      const row = ctx.resources.find((r) => String(r.resource_id) === String(resourceId));
      if (!row) return null;
      const relations = ctx.indexes.resourceSourcesByResource.get(row.resource_id) || [];
      const sources = relations
        .map((rel) => ctx.indexes.sourceById.get(rel.source_id))
        .filter(Boolean);
      const licensed = sources.find((s) => s.license) || null;
      const official = sources.find((s) => s.official_url || s.url) || licensed || null;
      return { row, summary: resourceSummary(ctx, row), sources, licensed, official };
    };

    const fmtFee = (fee) => (fee === null || fee === undefined ? '—'
      : (fee === 0 ? '免费' : `¥${esc(money(fee))}`));

    /* Module O：字段未知时输出「CourseMap 当前未核验该字段」，绝不给数值。 */
    const factValue = (row, field, knownHtml, unknownFields) => {
      const isUnknown = (unknownFields || []).includes(field)
        || row[field] === null || row[field] === undefined;
      if (isUnknown) {
        return `<span class="fact-unknown" data-coursemap-unknown-field="${esc(field)}">${UNVERIFIED_TEXT}</span>`;
      }
      return knownHtml;
    };

    const renderAiRec = (rec) => {
      const h = hydrate(rec.resource_id);
      if (!h) return ''; // 幻觉资源：前端 CODE 防线，直接不渲染
      const { row, summary, licensed, official } = h;
      const unknown = Array.isArray(rec.unknown_fields) ? rec.unknown_fields : [];
      const feeVal = summary.fee ? summary.fee.fee : null;
      const isDemo = row.data_class === 'demo';
      const verifiedRec = !isDemo && Boolean(official);
      const goalNames = (row.learning_goal_ids || [])
        .map((gid) => ctx.indexes.goalById.get(gid)?.name)
        .filter(Boolean);

      return `
        <div class="card" data-coursemap-ai-rec="${esc(String(rec.resource_id))}"
             data-coursemap-verified="${verifiedRec ? 'true' : 'false'}"
             data-coursemap-data-class="${esc(row.data_class || '')}">
          <div class="card__head">
            <div class="card__title"><a href="${esc(L.resource(rec.resource_id))}">${esc(row.title)}</a></div>
            <div>${badgeDataClass(isDemo, { compact: true })}</div>
          </div>
          <div class="card__body">
            <div class="cmp-card__row"><span class="cmp-card__label">推荐资源</span><span>${esc(row.title)}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">提供方</span><span>${esc(summary.provider ? summary.provider.name : '—')}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">为什么推荐</span><span>${esc(rec.reason || '—')}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">费用</span><span>${summary.fee ? fmtFee(feeVal) : `<span class="fact-unknown">${UNVERIFIED_TEXT}</span>`}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">难度</span><span>${factValue(row, 'difficulty', badgeDifficulty(row.difficulty), unknown)}${row.level_official ? ` <span class="cmp-dim">（官方层级：${esc(row.level_official)}）</span>` : ''}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">总时长</span><span>${factValue(row, 'duration_hours', `${esc(row.duration_hours)} 小时`, unknown)}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">每周投入</span><span>${factValue(row, 'weekly_workload_hours', `${esc(row.weekly_workload_hours)} 小时/周`, unknown)}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">是否提供证书</span><span>${factValue(row, 'certificate_available', row.certificate_available === true ? '提供' : '不提供', unknown)}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">学习评分</span><span>${factValue(row, 'rating', (summary.rating.overall === null ? '暂无评价' : `★ ${esc(rating1(summary.rating.overall))}（${summary.rating.count} 条）`), unknown)}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">对应学习目标</span><span>${goalNames.length ? esc(goalNames.join('、')) : '—'}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">核验情况</span><span>${esc(labelOf(SOURCE_VERIFICATION, row.verification_status, row.verification_status || '—'))}${verifiedRec ? ' · <strong>已核验推荐</strong>' : (isDemo ? ' · 演示数据' : ' · 无官方来源，不作为已核验推荐')}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">来源</span><span>${licensed ? esc(licensed.provider || licensed.title) : (official ? esc(official.provider || official.title) : '—')}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">许可</span><span>${licensed ? licenseBadge(licensed) : '<span class="cmp-dim">无</span>'}</span></div>
            <div class="cmp-card__row"><span class="cmp-card__label">观测日期</span><span>${factValue(row, 'observed_at', esc(official && (official.observed_at || official.retrieved_at)) || '—', unknown)}</span></div>
            ${(rec.fit_factors || []).length ? `<div class="cmp-dim">契合点：${esc(rec.fit_factors.join('；'))}</div>` : ''}
            ${(rec.tradeoffs || []).length ? `<div class="cmp-dim">取舍：${esc(rec.tradeoffs.join('；'))}</div>` : ''}
            ${official
    ? `<div class="source-item__actions" style="margin-top:8px;">${officialResourceLink(official, { label: '查看官方资源' })}</div>`
    : ''}
            ${unknown.length ? `<div class="cmp-dim" style="margin-top:6px;">未核验字段：${esc(unknown.map((f) => UNKNOWN_FIELD_LABELS[f] || f).join('、'))}（AI 未给出数值）</div>` : ''}
          </div>
        </div>`;
    };

    const renderEvidence = (data) => {
      const srcLines = (data.recommendations || []).flatMap((rec) => (rec.sources || []).map((s) => `
        <li>[来源 ${esc(s.source_id)}] ${esc(s.title)} · ${esc(s.source_type)} · 核验 ${esc(s.verification_status)}</li>`));
      return `
        <details class="disclosure" style="margin-top:12px;">
          <summary>证据与来源（Evidence / Source refs）</summary>
          <div class="disclosure__body">
            <ul class="parse-notes">${(data.evidence || []).map((e) => `
              <li>[资源 ${esc(String(e.resource_id))}] 数据类别 ${esc(e.data_class || '—')} · 核验 ${esc(e.verification_status || '—')} · 来源 ${esc((e.source_refs || []).join(', ') || '—')}</li>`).join('')}
            </ul>
            <ul class="parse-notes">${srcLines.join('')}</ul>
          </div>
        </details>`;
    };

    const renderAiResponse = (data, metaInfo) => {
      const recs = data.recommendations || [];
      const recDemo = recs.filter((r) => r.data_class === 'demo').length;
      const recReal = recs.length - recDemo;
      const counts = data.data_class_counts || null;
      return `
      <div class="card" data-coursemap-ai-response
           data-coursemap-real-recs="${recReal}" data-coursemap-demo-recs="${recDemo}">
        <div class="card__head">
          <div class="card__title"><span class="ai-sparkle" aria-hidden="true">✦</span> AI 决策建议（engine: deepseek-beta${metaInfo.model ? ` · model: ${esc(metaInfo.model)}` : ''}）</div>
          <div>${recDemo > 0 ? badgeDemo(true, { compact: true }) : ''}${recReal > 0 ? badgeDataClass(false, { compact: true }) : ''}</div>
        </div>
        <div class="card__body">
          <!-- 1 · Understanding your goal（模型理解 + 结构化约束） -->
          <section class="ai-section" data-advisor-block="understanding">
            <div class="ai-section__label"><span class="num-badge">1</span> Understanding your goal</div>
            ${data.summary ? `<p><strong>${esc(data.summary)}</strong></p>` : ''}
            <ul class="kv-list" style="margin-top:10px;">
              <li><span>解析到的学习目标</span><strong>${esc(data.interpreted_goal ? (data.interpreted_goal.name || '—') : '—')}${data.interpreted_goal && data.interpreted_goal.goal_id ? '' : '（CourseMap 未收录该目标）'}</strong></li>
              <li><span>估算总费用</span><strong>${data.estimated_cost === null || data.estimated_cost === undefined ? '—' : fmtFee(data.estimated_cost)}</strong></li>
              <li><span>估算总时长</span><strong>${data.estimated_duration ?? '—'} 小时</strong></li>
            </ul>
          </section>

          <!-- 2 · Skills you need（由推荐资源反推，事实来自 CourseMap 数据） -->
          <section class="ai-section" data-advisor-block="skills">
            <div class="ai-section__label"><span class="num-badge">2</span> Skills you need</div>
            ${(() => {
    const skillNames = [];
    for (const rec of recs) {
      const h = hydrate(rec.resource_id);
      if (!h) continue;
      for (const sid of (h.row.skill_ids || [])) {
        const skill = ctx.indexes.skillById.get(sid);
        if (skill && !skillNames.includes(skill.name)) skillNames.push(skill.name);
      }
    }
    return skillNames.length
      ? `<div class="cluster">${skillNames.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>
             <p class="cmp-dim" style="margin-top:8px;font-size:var(--cm-fs-xs);">这些技能标签来自本次推荐资源在 CourseMap 数据中登记的技能，不是模型自行编造的清单。</p>`
      : '<p class="cmp-dim">本次推荐资源未登记技能标签，因此没有可列出的技能清单。</p>';
  })()}
          </section>

          <!-- 3 · Recommended resources -->
          <section class="ai-section" data-advisor-block="recommended">
            <div class="ai-section__label"><span class="num-badge">3</span> Recommended resources（Evidence-backed，事实由 CourseMap 数据渲染）</div>
            <p class="cmp-dim">本次推荐 <strong class="num">${recs.length}</strong> 条：已核验真实 <strong class="num">${recReal}</strong> 条、演示 DEMO <strong class="num">${recDemo}</strong> 条。${counts ? `（数据集：真实 ${counts.real} / 演示 ${counts.demo}）` : ''}</p>
            <div class="grid grid--cards adv-res-list">
              ${recs.map(renderAiRec).join('') || '<p class="cmp-dim">本次没有给出资源推荐。</p>'}
            </div>
          </section>

          <!-- 4 · Learning sequence（CourseMap Learning Graph 的步骤 + AI 周计划） -->
          <section class="ai-section" data-advisor-block="sequence">
            <div class="ai-section__label"><span class="num-badge">4</span> Learning sequence</div>
            ${data.learning_path ? `
              <p class="cmp-dim"><a href="${esc(L.path(data.learning_path.evidence_backed.path_id))}"><strong>${esc(data.learning_path.evidence_backed.name)}</strong></a>
                —— 步骤来自 CourseMap Learning Graph（evidence-backed）；周计划为 AI 规划建议。</p>
              <ol class="adv-sequence" style="margin-top:10px;">${data.learning_path.evidence_backed.steps.map((s) => `
                <li><span>第 ${esc(String(s.step_order))} 步：${esc(s.title)}${s.skill ? `（技能：${esc(s.skill)}）` : ''} — 核心资源 ${(s.core_resources || []).map((c) => esc(c.title)).join('、') || '—'}</span></li>`).join('')}
              </ol>
              ${data.learning_path.ai_generated_schedule ? `
                <div class="notice notice--demo" style="margin-top:8px;">
                  <div class="notice__title">AI 生成的周计划（AI-generated planning，非 CourseMap 数据）</div>
                  ${esc(data.learning_path.ai_generated_schedule)}
                </div>` : ''}`
    : '<p class="cmp-dim">本次没有匹配到 CourseMap 中已有的学习路径；仍可直接使用下面的资源列表自学。</p>'}
          </section>

          <!-- 5 · Why this path（模型推理，与数据层分开） -->
          <section class="ai-section" data-advisor-block="why">
            <div class="ai-section__label"><span class="num-badge">5</span> Why this path</div>
            <div class="ai-grid">
              <div>
                <h3 class="sub-title">AI 学习建议（General advice，来自模型推理）</h3>
                <ul class="parse-notes">${(data.general_advice || []).map((a) => `<li>${esc(a)}</li>`).join('') || '<li>—</li>'}</ul>
              </div>
              <div>
                <h3 class="sub-title">不确定性与限制</h3>
                <ul class="parse-notes">${(data.uncertainties || []).map((u) => `<li>${esc(u)}</li>`).join('') || '<li>无</li>'}</ul>
              </div>
            </div>
          </section>

          <!-- 6 · Alternative path（可选替代：数据层已有的其他路径，不虚构） -->
          <section class="ai-section" data-advisor-block="alternative">
            <div class="ai-section__label"><span class="num-badge">6</span> Alternative path</div>
            ${(() => {
    const goalId = data.interpreted_goal ? data.interpreted_goal.goal_id : null;
    const currentPathId = data.learning_path ? data.learning_path.evidence_backed.path_id : null;
    const alts = goalId
      ? ctx.paths.filter((p) => (p.goal_ids || []).includes(goalId) && String(p.path_id) !== String(currentPathId))
      : [];
    const altLinks = alts.length
      ? `<div class="cluster">${alts.map((p) => `<a class="tag tag--link" href="${esc(L.path(p.path_id))}">${esc(p.name)} →</a>`).join('')}</div>`
      : '<p class="cmp-dim">CourseMap 当前数据集中，该目标下没有第二条已登记的路径。</p>';
    const compareLink = goalId
      ? `<p class="cmp-dim" style="margin-top:10px;"><a class="btn btn--ghost btn--sm" href="${esc(L.compare(goalId))}">把这些资源放在一起对比 →</a></p>`
      : '';
    return `${altLinks}${compareLink}`;
  })()}
          </section>

          ${renderEvidence(data)}

          <div class="notice notice--demo" style="margin-top:16px;">
            <div class="notice__title">AI Recommendation Disclaimer · REAL LLM ≠ ALL DATA REAL</div>
            AI 引擎是真的（DeepSeek，服务端代理）；<strong>但「AI 是真实的」不等于「全部数据都是真实的」</strong>。
            本次推荐中已核验真实资源 <strong class="num">${recReal}</strong> 条（带 REAL 徽标与「查看官方资源」，可回到官方页面核对），
            演示 DEMO 资源 <strong class="num">${recDemo}</strong> 条（仅用于演示，不代表真实存在的课程）。
            没有任何官方来源的记录，CourseMap 不会把它标为「已核验推荐」。AI 学习推荐 ≠ 保证的教育成果。
          </div>
          ${data.grounding ? `<div class="cmp-dim" style="margin-top:8px;" data-coursemap-grounding>
            证据约束（grounding）：${esc(data.grounding.policy)} 已核验推荐 ${esc(String(data.grounding.verified_recommendations))}/${esc(String(data.grounding.total_recommendations))}。${(data.grounding.unknown_fields || []).length ? `未核验字段：${esc(data.grounding.unknown_fields.join('、'))}。` : ''}
          </div>` : ''}
        </div>
      </div>`;
    };

    /* ---------- 规则引擎（降级 / 后备）渲染 ---------- */
    const renderFallback = (text) => {
      const { request, parseNotes, confidence } = parseDecisionRequest(text);
      const response = buildDecisionResponse(ctx, request);
      return `
        <div class="card" data-coursemap-ai-response>
          <div class="card__head">
            <div class="card__title">规则引擎建议（engine: ${esc(response.engine)} · 解析置信度: ${esc(confidence)}）</div>
            <div>${badgeDemo(true, { compact: true })}</div>
          </div>
          <div class="card__body">
          <section class="ai-section" data-advisor-block="understanding">
            <div class="ai-section__label"><span class="num-badge">1</span> Understanding your goal（规则解析，未调用模型）</div>
            <div class="ai-grid">
              <div>
                <h3 class="sub-title">解析出的约束（LearningDecisionRequest）</h3>
                <ul class="kv-list">
                  <li><span>学习目标</span><strong>${esc(response.interpreted_goal ? response.interpreted_goal.name : '未解析到')}</strong></li>
                  <li><span>当前基础</span><strong>${esc(request.current_level || '未解析到')}</strong></li>
                  <li><span>预算</span><strong>${request.budget === null ? '未解析到' : (request.budget === 0 ? '免费' : `≤ ¥${esc(String(request.budget))}`)}</strong></li>
                  <li><span>每周时间</span><strong>${request.available_hours_per_week === null ? '未解析到' : `≤ ${esc(String(request.available_hours_per_week))} 小时`}</strong></li>
                </ul>
              </div>
              <div>
                <h3 class="sub-title">解析说明（逐条可解释）</h3>
                <ul class="parse-notes">${parseNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
              </div>
            </div>
          </section>
          <section class="ai-section" data-advisor-block="recommended">
          <div class="ai-section__label"><span class="num-badge">3</span> Recommended resources（${response.recommended_resources.length}）</div>
            <div class="grid grid--cards">
              ${response.recommended_resources.map((rec, i) => `
                <div class="card" data-coursemap-ai-rec="${esc(String(rec.resource_id))}">
                  <div class="card__head">
                    <div class="card__title"><a href="${esc(L.resource(rec.resource_id))}">${esc(rec.title)}</a></div>
                    <div>${badgeDataClass(rec.data_class === 'demo', { compact: true })}</div>
                  </div>
                  <div class="card__body">
                    <div class="cmp-card__row"><span class="cmp-card__label">提供方</span><span>${esc(rec.provider || '—')}</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">费用</span><span>${fmtFee(rec.fee)}</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">难度</span><span>${badgeDifficulty(rec.difficulty)}</span></div>
                    <div class="cmp-dim" style="margin-top:6px;">为什么推荐：${esc(response.evidence[i] ? response.evidence[i].why : '')}</div>
                  </div>
                </div>`).join('') || '<p class="cmp-dim">没有命中任何资源（数据集规模有限）。</p>'}
            </div>
          </section>
          <section class="ai-section" data-advisor-block="why">
            <div class="ai-section__label"><span class="num-badge">5</span> Why this path · 不确定性</div>
            <ul class="parse-notes">${response.uncertainty.map((u) => `<li>${esc(u)}</li>`).join('') || '<li>无</li>'}</ul>
          </section>
            <div class="notice notice--demo" style="margin-top:16px;">
              <div class="notice__title">Rule-based Prototype Disclaimer · NOT AN LLM</div>
              规则引擎推荐 ≠ 保证的学习成果。本结果由可解释的规则解析产生，<strong>未调用任何大语言模型</strong>。
              标注 DEMO 的条目为演示数据，标注 REAL 的条目为带官方来源与许可记录的真实开放教育资源；请以官方页面为准。
            </div>
          </div>
        </div>`;
    };

    mount.querySelector('[data-advisor-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = composeText();
      if (!text) return;

      submitBtn.disabled = true;
      statusNode.innerHTML = `<div class="ai-thinking" role="status">
          <span class="ai-sparkle" aria-hidden="true">✦</span>
          <span>AI 正在思考…（意图解析 → CourseMap 检索 → 证据推理）</span>
          <span class="ai-thinking__dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>`;
      resultNode.innerHTML = '';

      if (aiMode) {
        const res = await askAdvisor(text);
        submitBtn.disabled = false;
        statusNode.innerHTML = '';
        if (res.ok) {
          resultNode.innerHTML = renderAiResponse(res.data, res.meta);
          return;
        }
        // 优雅降级：AI 失败不影响核心功能，并给出规则引擎后备结果
        statusNode.innerHTML = `
          <div class="notice" data-coursemap-ai-error>
            <div class="notice__title">AI 学习顾问暂时不可用（${esc(res.code)}）</div>
            ${esc(res.message || 'AI 学习顾问暂时不可用，你仍可使用课程搜索和比较功能。')}
            已切换为规则引擎结果：
          </div>`;
        resultNode.innerHTML = renderFallback(text);
        return;
      }

      // 后端不可用：直接规则引擎（保留 MoT #6 原型能力）
      submitBtn.disabled = false;
      statusNode.innerHTML = '';
      resultNode.innerHTML = renderFallback(text);
    });
  },
});
