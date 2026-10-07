/* ============================================================================
   CourseMap — pages/search.js
   ----------------------------------------------------------------------------
   P-03 找课程。搜索 / 筛选 / 排序 / 分页，全部 URL query parameter 驱动
   （可分享、可回退）。MoT #2：搜索「Python 入门」返回的是 Learning Resources。
   ========================================================================== */

import { initPage } from './base.js';
import {
  renderInto, L, resourceCardGrid, stateEmpty, badgeDifficulty,
} from '../components.js';
import { parseQuery, buildQuery, updateQuery } from '../utils.js';
import { normalizeQuery, searchResources, suggestRelaxations } from '../search.js';
import { SEARCH, asset } from '../config.js';
import { RESOURCE_TYPE, DIFFICULTY, LEARNING_MODE, LANGUAGE, SORT_LABELS, labelOf } from '../labels.js';

function optionHtml(value, label, selected) {
  return `<option value="${value}"${selected ? ' selected' : ''}>${label}</option>`;
}

initPage({
  active: 'search',
  async onReady(ctx) {
    const mount = document.querySelector('[data-page]') || document.body;
    if (mount !== document.body) mount.innerHTML = '';
    const params = parseQuery();
    const query = normalizeQuery(params);

    /* ---------- 筛选面板 ---------- */
    const filterPanel = document.querySelector('[data-filters]');
    if (filterPanel) {
      const goalOptions = ctx.goals
        .map((g) => optionHtml(g.goal_id, g.name, query.goal === g.goal_id)).join('');
      const subjectOptions = ctx.subjects
        .map((s) => optionHtml(s.subject_id, s.name, query.subject === s.subject_id)).join('');
      const providerOptions = ctx.providers
        .map((p) => optionHtml(p.provider_id, p.name, query.provider === p.provider_id)).join('');
      const modeOptions = Object.entries(LEARNING_MODE)
        .map(([k, v]) => optionHtml(k, v, query.mode === k)).join('');
      const difficultyOptions = Object.entries(DIFFICULTY)
        .map(([k, v]) => optionHtml(k, v.label, query.difficulty === k)).join('');
      const languageOptions = Object.entries(LANGUAGE)
        .map(([k, v]) => optionHtml(k, v, query.language === k)).join('');
      const sortOptions = SEARCH.sorts
        .map((k) => optionHtml(k, labelOf(SORT_LABELS, k), query.sort === k)).join('');

      filterPanel.innerHTML = `
        <div class="filter-bar">
        <div class="results-head" style="margin-bottom:8px;">
          <div>
            <div class="results-head__summary" style="font-size:var(--cm-fs-md);">Filters</div>
            <div class="results-head__meta">筛选条件会写入 URL，可直接分享</div>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-filter-drawer-close hidden>收起</button>
        </div>
        <details class="filter-group" open>
          <summary>学习目标</summary>
          <select class="control" data-filter="goal">
            ${optionHtml('all', '全部目标', query.goal === null)}${goalOptions}
          </select>
        </details>
        <details class="filter-group" open>
          <summary>学科</summary>
          <select class="control" data-filter="subject">
            ${optionHtml('all', '全部学科', query.subject === null)}${subjectOptions}
          </select>
        </details>
        <details class="filter-group">
          <summary>难度</summary>
          <select class="control" data-filter="difficulty">
            ${optionHtml('all', '全部难度', query.difficulty === null)}${difficultyOptions}
          </select>
        </details>
        <details class="filter-group">
          <summary>预算（费用未知不命中）</summary>
          <select class="control" data-filter="budget">
            ${optionHtml('all', '不限', query.budget === null)}
            ${optionHtml('0', '仅免费', query.budget === 0)}
            ${SEARCH.budgetPresets.map((p) => optionHtml(p, `¥${p} 以内`, query.budget === p)).join('')}
          </select>
        </details>
        <details class="filter-group">
          <summary>语言</summary>
          <select class="control" data-filter="language">
            ${optionHtml('all', '全部语言', query.language === null)}${languageOptions}
          </select>
        </details>
        <details class="filter-group">
          <summary>总时长上限（小时）</summary>
          <select class="control" data-filter="dur">
            ${optionHtml('all', '不限', query.durationMax === null)}
            ${[10, 20, 30, 50].map((v) => optionHtml(v, `≤ ${v} 小时`, query.durationMax === v)).join('')}
          </select>
        </details>
        <details class="filter-group">
          <summary>每周投入上限（小时）</summary>
          <select class="control" data-filter="wl">
            ${optionHtml('all', '不限', query.workloadMax === null)}
            ${[2, 4, 6, 8].map((v) => optionHtml(v, `≤ ${v} 小时/周`, query.workloadMax === v)).join('')}
          </select>
        </details>
        <details class="filter-group">
          <summary>证书</summary>
          <select class="control" data-filter="cert">
            ${optionHtml('all', '不限', query.cert === null)}
            ${optionHtml('1', '提供证书', query.cert === true)}
            ${optionHtml('0', '无证书', query.cert === false)}
          </select>
        </details>
        <details class="filter-group">
          <summary>学习模式</summary>
          <select class="control" data-filter="mode">
            ${optionHtml('all', '全部模式', query.mode === null)}${modeOptions}
          </select>
        </details>
        <details class="filter-group">
          <summary>提供方</summary>
          <select class="control" data-filter="provider">
            ${optionHtml('all', '全部提供方', query.provider === null)}${providerOptions}
          </select>
        </details>
        <details class="filter-group">
          <summary>核验状态</summary>
          <select class="control" data-filter="verification">
            ${optionHtml('all', '全部', query.verification === null)}
            ${optionHtml('verified', '仅核验过的费用', query.verification === 'verified')}
          </select>
        </details>
        <div class="cluster" style="margin-top:12px;">
          <button type="button" class="btn btn--ghost btn--sm" data-filter-reset>重置筛选</button>
        </div>
        </div>`;

      /* 移动端筛选抽屉（≤768px 时 .search-side 变为抽屉） */
      const drawerToggle = document.querySelector('[data-filter-drawer-toggle]');
      const backdrop = document.querySelector('[data-filter-drawer-backdrop]');
      const closeBtn = filterPanel.querySelector('[data-filter-drawer-close]');
      const setDrawer = (open) => {
        filterPanel.classList.toggle('is-open', open);
        if (backdrop) {
          backdrop.hidden = !open;
          backdrop.classList.toggle('is-open', open);
        }
        drawerToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (closeBtn) closeBtn.hidden = !open;
      };
      drawerToggle?.addEventListener('click', () => setDrawer(!filterPanel.classList.contains('is-open')));
      backdrop?.addEventListener('click', () => setDrawer(false));
      closeBtn?.addEventListener('click', () => setDrawer(false));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setDrawer(false);
      });
      /* 应用筛选后（页面跳转前）先收起抽屉，避免移动端遮住结果 */
      filterPanel.addEventListener('change', () => setDrawer(false));

      const applyFilters = () => {
        const next = { q: params.q || '' };
        for (const input of filterPanel.querySelectorAll('[data-filter]')) {
          const value = input.value;
          if (value && value !== 'all') next[input.dataset.filter] = value;
        }
        location.href = buildQuery(asset('pages/search.html'), next);
      };
      filterPanel.addEventListener('change', applyFilters);
      filterPanel.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
        location.href = buildQuery(asset('pages/search.html'), params.q ? { q: params.q } : {});
      });
    }

    /* ---------- 顶部搜索框 ---------- */
    const searchForm = document.querySelector('[data-search-form]');
    if (searchForm) {
      const qInput = searchForm.querySelector('[data-field="q"]');
      if (qInput) qInput.value = query.q;
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const next = { ...params, q: qInput ? qInput.value : '' };
        location.href = buildQuery(asset('pages/search.html'), next);
      });
    }

    const sortSelect = document.querySelector('[data-sort]');
    if (sortSelect) {
      sortSelect.innerHTML = SEARCH.sorts
        .map((k) => optionHtml(k, labelOf(SORT_LABELS, k), query.sort === k)).join('');
      sortSelect.addEventListener('change', () => {
        location.href = buildQuery(asset('pages/search.html'), { ...params, sort: sortSelect.value, page: '1' });
      });
    }

    /* ---------- 结果渲染 ---------- */
    const result = searchResources(ctx, query);
    const resultsNode = document.querySelector('[data-results]');

    if (result.matchedGoals.length) {
      const goalBar = document.querySelector('[data-goal-bar]');
      if (goalBar) {
        goalBar.innerHTML = `<div class="notice">
          <div class="notice__title">相关学习目标</div>
          ${result.matchedGoals.slice(0, 3).map((m) => `
            <a class="btn btn--ghost btn--sm" href="${L.compare(m.goal.goal_id)}">${m.goal.name}（${m.resourceCount} 个资源·跨提供方对比 →）</a>
          `).join(' ')}
        </div>`;
      }
    }

    if (!result.total) {
      const relaxations = suggestRelaxations(ctx, query).map((item) => ({
        ...item,
        href: buildQuery(asset('pages/search.html'), { ...params, ...cleanPatch(item.patch) }),
      }));
      renderInto(resultsNode, stateEmpty({ relaxations }));
      return;
    }

    const modeLabel = result.mode === 'keyword'
      ? `关键词「${query.q}」`
      : (result.mode === 'goal' ? '学习目标筛选' : '浏览全部');
    const header = document.querySelector('[data-result-header]');
    if (header) {
      const realCount = result.rows.filter((s) => !s.isDemo).length;
      const demoCount = result.rows.length - realCount;
      header.innerHTML = `<div class="results-head">
          <div>
            <div class="results-head__summary">${esc(modeLabel)}：<span class="num">${result.total}</span> 个学习资源</div>
            <div class="results-head__meta">本页 ${result.rows.length} 条 · 已核验真实 ${realCount} 条 · 演示 ${demoCount} 条 · 搜索单位是学习资源（不是平台）</div>
          </div>
          <div class="results-head__meta">费用、评分缺失的资源以 — 呈现，不会伪装成 0。</div>
        </div>`;
    }

    renderInto(resultsNode, resourceCardGrid(result.rows, { showGoalLinks: true }));

    /* 分页 */
    const pager = document.querySelector('[data-pager]');
    if (pager && result.pageCount > 1) {
      const pageLink = (p, label) => `<a class="btn btn--ghost btn--sm" href="${buildQuery(asset('pages/search.html'), { ...params, page: String(p) })}">${label}</a>`;
      pager.innerHTML = [
        result.page > 1 ? pageLink(result.page - 1, '上一页') : '',
        `<span class="cmp-dim">第 ${result.page} / ${result.pageCount} 页</span>`,
        result.page < result.pageCount ? pageLink(result.page + 1, '下一页') : '',
      ].join(' ');
    }

    /* URL 同步（不产生历史记录） */
    const syncParams = {};
    if (query.q) syncParams.q = query.q;
    for (const key of ['goal', 'subject', 'difficulty', 'budget', 'language', 'dur', 'wl', 'cert', 'mode', 'provider', 'verification', 'free', 'sort', 'page']) {
      const value = params[key];
      if (value !== undefined && value !== '' && value !== 'all') syncParams[key] = value;
    }
    updateQuery(syncParams, { replace: true });
  },
});

/* ---------- 工具 ---------- */

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function cleanPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined && v !== 'all') out[k] = v;
  }
  return out;
}
