/* ============================================================================
   CourseMap — pages/paths.js
   ----------------------------------------------------------------------------
   P-02a Learning Path Overview。旧「地理地图」的教育领域重构：
   不做课程地理地图，做目标 → 前置 → 技能 → 资源 的路径总览。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, pageDataBadges } from '../components.js';
import { esc } from '../utils.js';

initPage({
  active: 'paths',
  async onReady(ctx) {
    const mount = document.querySelector('[data-page]');

    const pathCards = ctx.paths.map((path) => {
      const steps = (ctx.indexes.stepsByPath.get(path.path_id) || [])
        .slice().sort((a, b) => a.step_order - b.step_order);
      const goals = (path.goal_ids || []).map((id) => ctx.indexes.goalById.get(id)).filter(Boolean);
      const resourceCount = new Set(steps.flatMap((s) => [...(s.core_resource_ids || []), ...(s.optional_resource_ids || [])])).size;
      return `<a class="path-card" href="${esc(L.path(path.path_id))}" data-coursemap-path-card>
          <div class="path-card__head">
            <span class="path-card__name">${esc(path.name)}</span>
            ${badgeDemo(path.data_class === 'demo', { compact: true })}
          </div>
          <div class="path-card__desc">${esc(path.description)}</div>
          <div class="path-card__meta">
            <span>适合：${esc(path.target_audience)}</span>
            <span>${steps.length} 步 · ${resourceCount} 个资源</span>
          </div>
          <div class="path-card__goals">${goals.map((g) => `<span class="tag">${esc(g.name)}</span>`).join('')}</div>
        </a>`;
    }).join('');

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>学习路径</span>
      </nav>
      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">学习路径</h1>
          <div class="detail-head__badges">${pageDataBadges(ctx)}</div>
        </div>
      </div>
      <p class="detail-lead">
        路径把「先学什么、后学什么」展开成目标 → 技能 → 资源的顺序结构。
        每一步只推荐数据集中登记过的资源，缺失的信息以 — 呈现。
      </p>
      <div class="grid grid--cards">${pathCards}</div>
    `;
  },
});
