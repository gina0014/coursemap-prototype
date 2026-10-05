/* ============================================================================
   CourseMap — pages/provider.js
   ----------------------------------------------------------------------------
   P-06 Provider Detail。
   硬规则：Provider 级信息 ≠ Resource 级质量（不合成 Provider 评分）。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, badgeDifficulty, stateNotFound, metricBlock, sourceList, PROVIDER_TYPE, labelOf } from '../components.js';
import { parseQuery, esc, intOrNull } from '../utils.js';
import { providerView } from '../derive.js';

initPage({
  active: 'search',
  async onReady(ctx) {
    const params = parseQuery();
    const id = intOrNull(params.id);
    const view = id !== null ? providerView(ctx, id) : null;
    const mount = document.querySelector('[data-page]');

    if (!view) {
      renderInto(mount, stateNotFound({ title: '没有找到这个提供方' }));
      return;
    }
    const { provider, resources, subjects, goalsCovered } = view;

    const sourceEntries = (ctx.sources || [])
      .filter((s) => s.status === 'published')
      .map((source) => ({ source, relation: null, note: null }));

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>提供方</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">${esc(provider.name)}</h1>
          <div class="detail-head__badges">
            ${badgeDemo(provider.data_class === 'demo')}
            <span class="badge badge--ghost">${esc(labelOf(PROVIDER_TYPE, provider.provider_type))}</span>
          </div>
        </div>
      </div>

      <p class="detail-lead">${esc(provider.description || '描述暂缺。')}</p>

      <div class="notice" data-coursemap-provider-boundary>
        <div class="notice__title">Provider 级信息 ≠ Resource 级质量</div>
        本页只汇总该提供方在 CourseMap 数据集中登记的资源。提供方本身<strong>没有</strong>质量评分：
        质量判断只来自具体资源的学习者评价（样本量与来源在每个资源上单独标注）。
      </div>

      <section class="detail-section">
        <h2 class="section-title">覆盖范围</h2>
        <div class="metric-grid">
          ${metricBlock('登记资源数', String(resources.length))}
          ${metricBlock('覆盖学科', subjects.map((s) => esc(s.name)).join('、') || '—')}
          ${metricBlock('覆盖学习目标', goalsCovered.map((g) => esc(g.name)).join('、') || '—')}
        </div>
      </section>

      <section class="detail-section">
        <h2 class="section-title">可用学习资源</h2>
        <ul class="provider-resource-list">
          ${resources.map((s) => `<li class="provider-resource">
            <a href="${esc(L.resource(s.resource.resource_id))}">${esc(s.resource.title)}</a>
            ${badgeDemo(s.isDemo, { compact: true })}
            ${badgeDifficulty(s.resource.difficulty)}
            <span class="cmp-dim">${s.goals.map((g) => esc(g.name)).join(' · ')}</span>
          </li>`).join('') || '<li class="cmp-dim">暂无已发布资源。</li>'}
        </ul>
      </section>

      <section class="detail-section">
        <h2 class="section-title">来源与核验</h2>
        ${sourceList(sourceEntries)}
      </section>
    `;
  },
});
