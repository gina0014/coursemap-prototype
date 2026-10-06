/* ============================================================================
   CourseMap — pages/compare.js
   ----------------------------------------------------------------------------
   P-05 同一 Learning Goal 下的跨资源对比（核心功能）。
   动态计算：最低/最高费用、费用差、最短/最长时长、最高评分、资源数。
   缺失值显示 — 而不是 0；禁止 hardcode。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, compareTable, compareCards, badgeDemo, pageDataBadges, stateEmpty } from '../components.js';
import { parseQuery, esc, intOrNull, money, rating1 } from '../utils.js';
import { goalComparison } from '../derive.js';
import { loadPrefs, savePrefs } from '../storage.js';

initPage({
  active: 'search',
  async onReady(ctx) {
    const params = parseQuery();
    const goalId = intOrNull(params.goal);
    const mount = document.querySelector('[data-page]');
    const comparison = goalId !== null ? goalComparison(ctx, goalId) : null;

    if (!comparison || !comparison.goal) {
      renderInto(mount, stateEmpty({ title: '请先选择一个学习目标', desc: '对比按学习目标进行：先搜索或从首页进入某个目标，再比较该目标下的资源。' }));
      return;
    }

    const { goal, rows, resourceCount, providerCount, feeStats, durationStats, ratingStats } = comparison;
    const prefs = loadPrefs();
    const view = params.view || (prefs.view === 'cards' ? 'cards' : 'table');

    const goalChain = [];
    {
      const seen = new Set([goal.goal_id]);
      const visit = (id) => {
        const g = ctx.indexes.goalById.get(id);
        if (!g) return;
        for (const pid of g.prerequisite_goal_ids || []) {
          if (seen.has(pid)) continue;
          seen.add(pid);
          visit(pid);
          goalChain.push(g);
        }
      };
      visit(goal.goal_id);
    }

    const statCard = (label, valueHtml, hint = '') => `
      <div class="cmp-stat" title="${esc(hint)}">
        <div class="cmp-stat__label">${esc(label)}</div>
        <div class="cmp-stat__value">${valueHtml}</div>
      </div>`;

    const fmtFee = (v) => (typeof v === 'number' ? (v === 0 ? '免费' : `¥${esc(money(v))}`) : '—');
    const fmtHours = (v) => (typeof v === 'number' ? `${esc(String(v))} 小时` : '—');

    const feeText = feeStats.available
      ? (feeStats.min === 0 ? '免费起' : `¥${esc(money(feeStats.min))} 起`)
      : '—';
    const spreadText = feeStats.spread !== null ? `¥${esc(money(feeStats.spread))}` : '—';

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> ›
        <a href="${esc(L.search({ goal: goal.goal_id }))}">${esc(goal.name)}</a> ›
        <span>跨资源对比</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">「${esc(goal.name)}」怎么选？</h1>
          <div class="detail-head__badges">
            ${pageDataBadges(ctx)}
            <span class="badge badge--ghost">${esc(resourceCount)} 个资源 · ${esc(String(providerCount))} 个提供方</span>
          </div>
        </div>
        <div class="cluster">
          <a class="btn btn--ghost btn--sm" href="${esc(L.search({ goal: goal.goal_id }))}">回列表筛选</a>
        </div>
      </div>

      <p class="detail-lead">${esc(goal.description)}</p>
      ${goalChain.length ? `<p class="cmp-dim">前置目标：${goalChain.map((g) => esc(g.name)).join(' → ')}</p>` : ''}

      <section class="cmp-summary" data-compare-summary>
        ${statCard('资源数', `<span data-compare-count>${resourceCount}</span>`)}
        ${statCard('最低费用', `<span data-compare-min>${fmtFee(feeStats.min)}</span>`, feeStats.available ? '运行时由已知费用计算；费用未知的资源不参与最小值' : '该目标下没有已知费用')}
        ${statCard('最高费用', `<span data-compare-max>${fmtFee(feeStats.max)}</span>`)}
        ${statCard('费用差', `<span data-compare-spread>${spreadText}</span>`, 'max − min，缺失费用不参与计算')}
        ${statCard('最短时长', fmtHours(durationStats.min), durationStats.available ? '时长未知的资源不参与计算' : '')}
        ${statCard('最长时长', fmtHours(durationStats.max))}
        ${statCard('最高评分', ratingStats.max !== null ? `★ ${esc(rating1(ratingStats.max))}` : '—', '评分样本量见各列标注')}
      </section>

      <div class="cluster" style="margin:16px 0;">
        <a class="btn btn--ghost btn--sm ${view === 'table' ? 'is-active' : ''}" href="#" data-cmp-view="table" aria-pressed="${view === 'table'}">表格视图</a>
        <a class="btn btn--ghost btn--sm ${view === 'cards' ? 'is-active' : ''}" href="#" data-cmp-view="cards" aria-pressed="${view === 'cards'}">卡片视图</a>
      </div>

      <div data-compare-body>
        ${rows.length === 0
    ? stateEmpty({ title: '该目标下暂无已发布资源' })
    : (view === 'cards' ? compareCards(rows) : compareTable(rows, { feeStats, durationStats, ratingStats }))}
      </div>

      <div class="notice" style="margin-top:20px;">
        <div class="notice__title">对比口径</div>
        费用取最新观测；费用/时长未知的资源以 — 呈现，<strong>不参与</strong>最大最小值计算，也不会被当成 0。
        评分样本不足的资源保留显示，但会标注 Limited data。
      </div>
    `;

    mount.querySelectorAll('[data-cmp-view]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        savePrefs({ view: link.dataset.cmpView });
        const url = new URL(location.href);
        url.searchParams.set('view', link.dataset.cmpView);
        location.href = url.toString();
      });
    });
  },
});
