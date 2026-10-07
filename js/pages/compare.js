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

      ${startPointHtml(rows, goal)}

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

/* ----------------------------------------------------------------------------
   UI V0.2：起点建议（Start point）
   ----------------------------------------------------------------------------
   纪律：这是**由 CourseMap 数据推导**的建议（fee / duration / difficulty /
   data_class / 官方来源），不是 LLM 生成的推荐语。任何数值都必须在表格里
   能找到对应单元格，缺失值一律不参与。
   -------------------------------------------------------------------------- */
function startPointHtml(rows, goal) {
  if (!rows || rows.length < 2) return '';

  const feeOf = (s) => (s.fee && typeof s.fee.fee === 'number' ? s.fee.fee : null);
  const durOf = (s) => (typeof s.resource.duration_hours === 'number' ? s.resource.duration_hours : null);
  const rated = (s) => (typeof s.rating.overall === 'number' ? s.rating.overall : null);

  /* 排序键（全部为"已有事实"，缺失值排在最后，绝不用 0 冒充）：
     1) 已核验真实资源优先  2) 费用低者优先  3) 时长短者优先  4) 评分高者优先 */
  const score = (s) => [
    s.isDemo ? 1 : 0,
    feeOf(s) === null ? Number.POSITIVE_INFINITY : feeOf(s),
    durOf(s) === null ? Number.POSITIVE_INFINITY : durOf(s),
    rated(s) === null ? -1 : -rated(s),
  ];

  const sorted = rows.slice().sort((a, b) => {
    const ka = score(a);
    const kb = score(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return String(a.resource.resource_id).localeCompare(String(b.resource.resource_id));
  });

  const pick = sorted[0];
  const others = rows.filter((s) => s.resource.resource_id !== pick.resource.resource_id);

  const reasons = [];
  if (!pick.isDemo) reasons.push('在本次对比中它是<b>已核验真实资源</b>（带官方来源与许可记录，可回到官方页面核对）。');
  if (typeof pick.resource.difficulty === 'string') {
    reasons.push(`难度标注为 <b>${pick.resource.difficulty === 'beginner' ? '入门' : (pick.resource.difficulty === 'intermediate' ? '有基础' : '进阶')}</b>，与"先入门再进阶"的默认顺序一致。`);
  }
  if (feeOf(pick) !== null) {
    reasons.push(feeOf(pick) === 0 ? '当前观测费用为 <b>免费</b>。' : `当前观测费用 <b>¥${money(feeOf(pick))}</b>${others.some((s) => feeOf(s) !== null && feeOf(s) > feeOf(pick)) ? '，低于本次对比中的其他已知费用。' : '。'}`);
  } else {
    reasons.push('费用在 CourseMap 中<b>尚未核验</b>，选择前请先到官方页面确认。');
  }
  if (durOf(pick) !== null) reasons.push(`总时长 <b>${durOf(pick)} 小时</b>，适合先跑完一遍再决定是否深入。`);
  if (rated(pick) !== null) reasons.push(`学习者评分 <b>★ ${rating1(rated(pick))}</b>（${pick.rating.count} 条评价${pick.rating.sampleState === 'sufficient' ? '' : '，样本不足'}）。`);

  const altLinks = others.length
    ? `<div class="cluster" style="margin-top:10px;">${others.map((s) => `<a class="tag tag--link" href="${esc(L.resource(s.resource.resource_id))}">备选：${esc(s.resource.title)}</a>`).join('')}</div>`
    : '';

  return `
      <section class="start-point" data-compare-start-point>
        <div class="start-point__head">
          <span class="start-point__title">起点建议</span>
          <span class="badge badge--ghost">由 CourseMap 数据推导 · 非 LLM 生成</span>
        </div>
        <div class="start-point__body">
          <p>如果目标是「<strong>${esc(goal.name)}</strong>」，建议的起点是
            <a href="${esc(L.resource(pick.resource.resource_id))}"><strong>${esc(pick.resource.title)}</strong></a>${pick.provider ? `（${esc(pick.provider.name)}）` : ''}。</p>
          <ul class="start-point__why">${reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
          ${altLinks}
          <p class="cmp-dim" style="margin-top:12px;font-size:var(--cm-fs-xs);">
            推导规则：已核验真实资源优先 → 已知费用低者优先 → 已知时长短者优先 → 已知评分高者优先；缺失值不参与排序，也不会被当作 0。
          </p>
          <div class="cluster" style="margin-top:12px;">
            <a class="btn btn--ghost btn--sm" href="${esc(L.advisor())}?q=${encodeURIComponent(`我想学「${goal.name}」，请帮我判断从哪个资源开始最合适`)}">
              <span class="ai-sparkle" aria-hidden="true">✦</span> 让 AI 顾问解释为什么 →
            </a>
          </div>
        </div>
      </section>`;
}
