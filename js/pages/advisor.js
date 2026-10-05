/* ============================================================================
   CourseMap — pages/advisor.js
   ----------------------------------------------------------------------------
   P-09 AI Learning Advisor Preview（MoT #6）。
   当前实现 = Prototype Decision Assistant（Rule-based，非 LLM）：
     自然语言 → 规则解析 LearningDecisionRequest → 调用 CourseMap 结构化数据
     → LearningDecisionResponse（推荐 + 解释 + 证据 + 不确定性）。
   UI 必须明确标注 Prototype / Not LLM-powered。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, badgeDifficulty, AI_DISCLAIMER } from '../components.js';
import { esc, money, rating1 } from '../utils.js';
import { parseDecisionRequest, buildDecisionResponse, createLlmAdapter } from '../ai-advisor.js';

initPage({
  active: 'advisor',
  async onReady(ctx) {
    const mount = document.querySelector('[data-page]');
    const adapter = createLlmAdapter();

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>AI 学习顾问</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">AI 学习顾问 <span class="badge badge--experimental">Beta / Preview</span></h1>
        </div>
      </div>

      <div class="notice" data-coursemap-ai-disclosure>
        <div class="notice__title">Prototype Decision Assistant · Not LLM-powered</div>
        ${esc(AI_DISCLAIMER)}
        当前版本<strong>没有接入任何大语言模型</strong>：约束解析由规则完成，
        推荐由 CourseMap 结构化数据的规则检索完成。结果可解释、可回溯，但<strong>不构成教育效果承诺</strong>。
        未来 LLM 架构见 <a href="https://github.com/gina0014/coursemap-prototype" rel="noopener nofollow">docs/product/11_AI_Architecture.md</a>。
      </div>

      <form class="card" data-advisor-form>
        <div class="card__body">
          <label class="field__label" for="advisor-input">用一句话描述你的学习需求</label>
          <textarea class="control" id="advisor-input" data-advisor-input rows="3"
            placeholder="例如：我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。"></textarea>
          <div class="cluster" style="margin-top:8px;">
            <button type="submit" class="btn btn--primary">获取学习建议</button>
          </div>
          <div class="cluster" style="margin-top:8px;">
            <span class="cmp-dim">试试示例：</span>
            <button type="button" class="chip" data-advisor-example="我是零基础大学生，每周5小时，预算200元，三个月想学会Python数据分析。">Python 数据分析</button>
            <button type="button" class="chip" data-advisor-example="我学过Python，每周10小时，想入门机器学习，最好有证书。">机器学习</button>
            <button type="button" class="chip" data-advisor-example="我需要免费学习文献检索，每周3小时。">文献检索</button>
          </div>
        </div>
      </form>

      <section data-advisor-result style="margin-top:24px;"></section>
    `;

    const input = mount.querySelector('[data-advisor-input]');
    mount.querySelectorAll('[data-advisor-example]').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.advisorExample;
      });
    });

    mount.querySelector('[data-advisor-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const resultNode = mount.querySelector('[data-advisor-result]');
      const text = input.value.trim();
      if (!text) return;

      const { request, parseNotes, confidence } = parseDecisionRequest(text);
      const response = buildDecisionResponse(ctx, request);

      const adapterState = adapter.available
        ? 'LLM adapter active'
        : `LLM adapter: ${esc(adapter.reason)}（降级为规则引擎）`;

      const fmtCost = (est) => {
        if (!est) return '—';
        const min = est.min === 0 ? '免费' : `¥${esc(money(est.min))}`;
        const max = est.max === 0 ? '免费' : `¥${esc(money(est.max))}`;
        return `${min} ~ ${max}${est.unknown_count ? `（${est.unknown_count} 个费用未知未计入）` : ''}`;
      };
      const fmtDuration = (est) => (!est ? '—'
        : `${esc(String(est.min))} ~ ${esc(String(est.max))} 小时${est.unknown_count ? `（${est.unknown_count} 个时长未知未计入）` : ''}`);

      resultNode.innerHTML = `
        <div class="card" data-coursemap-ai-response>
          <div class="card__head">
            <div class="card__title">决策建议（engine: ${esc(response.engine)} · 解析置信度: ${esc(confidence)}）</div>
            <div>${badgeDemo(true, { compact: true })}</div>
          </div>
          <div class="card__body">
            <div class="ai-grid">
              <div>
                <h3 class="sub-title">解析出的约束（LearningDecisionRequest）</h3>
                <ul class="kv-list">
                  <li><span>学习目标</span><strong>${esc(response.interpreted_goal ? response.interpreted_goal.name : '未解析到')}</strong></li>
                  <li><span>当前基础</span><strong>${esc(request.current_level || '未解析到')}</strong></li>
                  <li><span>预算</span><strong>${request.budget === null ? '未解析到' : (request.budget === 0 ? '免费' : `≤ ¥${esc(String(request.budget))}`)}</strong></li>
                  <li><span>每周时间</span><strong>${request.available_hours_per_week === null ? '未解析到' : `≤ ${esc(String(request.available_hours_per_week))} 小时`}</strong></li>
                  <li><span>目标周期</span><strong>${esc(request.target_duration || '未解析到')}</strong></li>
                  <li><span>证书要求</span><strong>${request.certificate_requirement ? '是' : '否/未提及'}</strong></li>
                </ul>
              </div>
              <div>
                <h3 class="sub-title">解析说明（逐条可解释）</h3>
                <ul class="parse-notes">${parseNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
              </div>
            </div>

            <h3 class="sub-title">推荐资源（${response.recommended_resources.length}）</h3>
            <div class="grid grid--cards">
              ${response.recommended_resources.map((rec, i) => `
                <div class="card" data-coursemap-ai-rec="${rec.resource_id}">
                  <div class="card__head">
                    <div class="card__title"><a href="${esc(L.resource(rec.resource_id))}">${esc(rec.title)}</a></div>
                    <div>${badgeDemo(rec.data_class === 'demo', { compact: true })}</div>
                  </div>
                  <div class="card__body">
                    <div class="cmp-card__row"><span class="cmp-card__label">提供方</span><span>${esc(rec.provider || '—')}</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">费用</span><span>${rec.fee === null || rec.fee === undefined ? '—' : (rec.fee === 0 ? '免费' : `¥${esc(String(rec.fee))}`)}</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">总时长</span><span>${rec.duration_hours ?? '—'} 小时</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">每周投入</span><span>${rec.weekly_workload_hours ?? '—'} 小时</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">难度</span><span>${badgeDifficulty(rec.difficulty)}</span></div>
                    <div class="cmp-card__row"><span class="cmp-card__label">评分</span><span>${rec.rating === null ? '暂无评价' : `★ ${esc(rating1(rec.rating))}（${rec.rating_count} 条）`}</span></div>
                    <div class="cmp-dim" style="margin-top:6px;">为什么推荐：${esc(response.evidence[i] ? response.evidence[i].why : '')}</div>
                  </div>
                </div>`).join('') || '<p class="cmp-dim">没有命中任何资源（数据集规模有限）。</p>'}
            </div>

            <div class="ai-grid" style="margin-top:16px;">
              <div>
                <h3 class="sub-title">估算</h3>
                <ul class="kv-list">
                  <li><span>估算费用区间</span><strong>${fmtCost(response.estimated_cost)}</strong></li>
                  <li><span>估算总时长</span><strong>${fmtDuration(response.estimated_duration)}</strong></li>
                  <li><span>推荐路径</span><strong>${response.recommended_path ? `<a href="${esc(L.path(response.recommended_path.path_id))}">${esc(response.recommended_path.name)}</a>` : '—'}</strong></li>
                </ul>
              </div>
              <div>
                <h3 class="sub-title">不确定性（Uncertainty）</h3>
                <ul class="parse-notes">${response.uncertainty.map((u) => `<li>${esc(u)}</li>`).join('') || '<li>无</li>'}</ul>
              </div>
            </div>

            <h3 class="sub-title" style="margin-top:16px;">推理摘要</h3>
            <p>${esc(response.reasoning_summary)}</p>

            <details class="disclosure" style="margin-top:12px;">
              <summary>证据与来源（Evidence / Source refs）</summary>
              <div class="disclosure__body">
                <ul class="parse-notes">${response.evidence.map((e) => `<li>[资源 ${e.resource_id}] ${esc(e.title)} · ${esc(e.why)} · 数据类别 ${esc(e.data_class)} · 核验 ${esc(e.verification_status)}</li>`).join('')}</ul>
                <ul class="parse-notes">${response.source_refs.map((s) => `<li>[来源 ${s.source_id}] ${esc(s.title)} · ${esc(s.source_type)} · ${s.url ? esc(s.url) : '无外链（演示来源）'}</li>`).join('')}</ul>
                <p class="cmp-dim">${esc(adapterState)}</p>
              </div>
            </details>

            <div class="notice notice--demo" style="margin-top:16px;">
              <div class="notice__title">AI Recommendation Disclaimer</div>
              AI / 规则推荐 <strong>≠</strong> 保证的学习成果。所有推荐基于演示数据（DEMO），
              教育效果取决于个人投入与实践。请自行核对资源官方信息后再做决定。
            </div>
          </div>
        </div>
      `;
    });
  },
});
