/* ============================================================================
   CourseMap — pages/favorites.js
   ----------------------------------------------------------------------------
   P-07 Learning Wishlist（本地收藏）。localStorage = Local Prototype，
   不声称账号同步。
   ========================================================================== */

import { initPage } from './base.js';
import {
  renderInto, L, resourceCardGrid, stateEmpty, bindFavoriteToggles,
} from '../components.js';
import { esc } from '../utils.js';
import { resourceSummary } from '../derive.js';
import { loadFavorites, loadSavedGoals, storageAvailable } from '../storage.js';

initPage({
  active: 'favorites',
  async onReady(ctx, helpers) {
    const mount = document.querySelector('[data-page]');

    if (!storageAvailable) {
      mount.innerHTML = `<div class="state">
        <div class="state__title">浏览器不支持本地存储</div>
        <div class="state__desc">收藏功能需要 localStorage。当前环境无法保存收藏。</div>
      </div>`;
      return;
    }

    const favorites = loadFavorites();
    const savedGoals = loadSavedGoals();

    const summaries = favorites
      .map((item) => ctx.indexes.resourceById.get(item.resource_id))
      .filter((r) => r && r.status === 'published')
      .map((r) => resourceSummary(ctx, r))
      .filter(Boolean);

    const goalChips = savedGoals.map((item) => {
      const goal = ctx.indexes.goalById.get(item.goal_id);
      if (!goal) return '';
      return `<a class="chip" href="${esc(L.search({ goal: goal.goal_id }))}">${esc(goal.name)}</a>`;
    }).filter(Boolean).join('');

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>收藏</span>
      </nav>
      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">我的学习收藏</h1>
        </div>
      </div>
      <div class="notice">
        <div class="notice__title">Local Prototype · 本地收藏</div>
        收藏仅保存在当前浏览器（localStorage），<strong>没有账号、没有云同步</strong>。
        清除浏览器数据会丢失收藏。
      </div>

      ${savedGoals.length ? `
      <section class="detail-section">
        <h2 class="section-title">收藏的学习目标（${savedGoals.length}）</h2>
        <div class="cluster">${goalChips}</div>
      </section>` : ''}

      <section class="detail-section">
        <h2 class="section-title">收藏的学习资源（${summaries.length}）</h2>
        ${summaries.length
    ? resourceCardGrid(summaries)
    : stateEmpty({
      title: '还没有收藏',
      desc: '在搜索结果或资源详情页点击「收藏」，把资源加入学习清单。',
      extraHtml: '<div class="state__actions"><a class="btn btn--primary" href="javascript:history.back()">返回</a></div>',
    })}
      </section>
    `;

    bindFavoriteToggles(ctx, () => helpers.refreshChrome());
  },
});
