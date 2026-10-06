/* ============================================================================
   CourseMap — pages/resource.js
   ----------------------------------------------------------------------------
   P-04 Learning Resource Detail。必须清楚回答 15 个学习决策问题：
   这是什么资源 / 谁提供 / 对应什么目标 / 适合什么基础 / 能学到什么 /
   有什么先修 / 多久 / 每周多少时间 / 多少钱 / 是否有证书 / 评价如何 /
   什么时候更新 / 是否核验 / 数据来自哪里 / 下一步学什么。
   ========================================================================== */

import { initPage } from './base.js';
import {
  renderInto, L, badgeDataClass, badgeDifficulty, badgeCertificate, badgeFeeVerification,
  badgeSampleState, badgeRatingProvenance, feeBlock, ratingBlock, metricBlock,
  sourceList, feeTimeline, stateNotFound, RESOURCE_TYPE, LEARNING_MODE, LANGUAGE,
  COMPLETION_STATUS, LEARNING_TAGS, labelOf, licenseBadge, officialResourceLink,
} from '../components.js';
import { parseQuery, esc, rating1, pct, dateOnly, intOrNull } from '../utils.js';
import {
  resourceSummary, ratingAggregate, currentFee, goalPrerequisiteChain,
  pathsCoveringGoal, skillPrerequisiteChain,
} from '../derive.js';
import { loadLocalReviews } from '../storage.js';

initPage({
  active: 'search',
  async onReady(ctx, helpers) {
    const params = parseQuery();
    const id = intOrNull(params.id);
    const resource = id !== null ? ctx.indexes.resourceById.get(id) : null;

    if (!resource || resource.status !== 'published') {
      renderInto(document.querySelector('[data-page]'), stateNotFound());
      return;
    }

    const summary = resourceSummary(ctx, resource);
    const rating = ratingAggregate(ctx, resource.resource_id);
    const fee = currentFee(ctx, resource.resource_id);
    const mount = document.querySelector('[data-page]');

    const goalChain = (resource.learning_goal_ids || []).flatMap((gid) => goalPrerequisiteChain(ctx, gid));
    const prereqSkills = (resource.prerequisite_skill_ids || []).map((sid) => ctx.indexes.skillById.get(sid)).filter(Boolean);

    /* 下一步：共享前置技能的更高难度资源 + 目标的 next_goals + 覆盖路径 */
    const nextGoals = (resource.learning_goal_ids || [])
      .flatMap((gid) => ctx.indexes.goalById.get(gid)?.next_goal_ids || [])
      .map((gid) => ctx.indexes.goalById.get(gid)).filter(Boolean);
    const coveringPaths = (resource.learning_goal_ids || []).flatMap((gid) => pathsCoveringGoal(ctx, gid));
    const pathSeen = new Set();
    const uniquePaths = coveringPaths.filter((p) => {
      if (pathSeen.has(p.path_id)) return false;
      pathSeen.add(p.path_id);
      return true;
    });

    /* 来源（provenance） */
    const sourceEntries = (ctx.indexes.resourceSourcesByResource.get(resource.resource_id) || [])
      .map((relation) => ({
        source: ctx.indexes.sourceById.get(relation.source_id),
        relation,
        note: relation.note,
      }))
      .filter((entry) => entry.source);

    /* Module F/N：官方来源与许可。真实资源必须能回到官方页面；无来源者不得声称已核验。 */
    const sourcedEntries = sourceEntries.filter((e) => e.source.official_url || e.source.url);
    const licensedEntry = sourceEntries.find((e) => e.source.license) || null;
    const officialSource = licensedEntry || sourcedEntries[0] || null;
    const isRealVerified = !summary.isDemo && Boolean(officialSource && (officialSource.source.official_url || officialSource.source.url));

    /* 本地评价（Local Prototype，与全局评分严格分离） */
    const localReviews = ctx.storageAvailable ? loadLocalReviews(resource.resource_id) : [];

    const localReviewHtml = localReviews.length ? `
      <div class="card" style="margin-top:16px;">
        <div class="card__head"><div class="card__title">你的本地评价（Local Prototype）</div></div>
        <div class="card__body">
          ${localReviews.map((r) => `<div class="timeline__item">
            <div class="timeline__date">${esc((r.submitted_at || '').slice(0, 10))}</div>
            <div>总评 ${'★'.repeat(r.overall_rating)}${'☆'.repeat(5 - r.overall_rating)} ·
              ${r.would_recommend ? '愿意推荐' : '不推荐'} ·
              ${esc(labelOf(COMPLETION_STATUS, r.completion_status))}
              ${r.comment ? `<div class="cmp-dim">${esc(r.comment)}</div>` : ''}
              <div class="cmp-dim" style="font-size:var(--cm-fs-xs);">仅保存在本浏览器，不进入数据集、不影响其他用户看到的评分。</div>
            </div>
          </div>`).join('')}
        </div>
      </div>` : '';

    const ageText = (() => {
      const days = typeof fee?.ageDays === 'number' ? fee.ageDays : null;
      return days === null ? '' : (days <= 0 ? '今日观测' : `${days} 天前观测`);
    })();

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> ›
        <a href="${esc(L.search({}))}">找课程</a> ›
        <span>${esc(resource.title)}</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">${esc(resource.title)}</h1>
          <div class="detail-head__badges">
            ${badgeDataClass(summary.isDemo)}
            ${badgeDifficulty(resource.difficulty)}
            ${badgeCertificate(resource.certificate_available)}
            <span class="badge badge--ghost">${esc(labelOf(RESOURCE_TYPE, resource.resource_type))}</span>
            <span class="badge badge--ghost">${esc(labelOf(LANGUAGE, resource.language))}</span>
            <span class="badge badge--ghost">${esc(labelOf(LEARNING_MODE, resource.learning_mode))}</span>
            ${resource.level_official ? `<span class="badge badge--ghost">官方层级：${esc(resource.level_official)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;display:grid;gap:6px;justify-items:end;">
          ${feeBlock(fee, { size: 'lg' })}
          ${badgeFeeVerification(fee)}
          ${fee && fee.needsRecheck ? '<span class="cmp-dim">观测较久，建议核对最新费用</span>' : ''}
        </div>
      </div>

      <p class="detail-lead">${resource.description
    ? esc(resource.description)
    : (isRealVerified
      ? '<span class="cmp-dim">官方描述未核验。CourseMap 只保存元数据与官方链接，不复制课程正文；请通过官方链接查看完整介绍。</span>'
      : '描述暂缺。')}</p>

      <section class="detail-section" data-coursemap-section="goals">
        <h2 class="section-title">对应什么学习目标？</h2>
        <div class="cluster">
          ${(summary.goals.length
    ? summary.goals.map((g) => `<a class="tag tag--link" href="${esc(L.search({ goal: g.goal_id }))}">${esc(g.name)}</a>`).join('')
    : '<span class="cmp-dim">未关联学习目标（数据问题）</span>')}
        </div>
        ${goalChain.length ? `<p class="cmp-dim" style="margin-top:8px;">建议先完成前置目标：${goalChain.map((g) => esc(g.name)).join(' → ')}</p>` : ''}
        ${(resource.skill_ids || []).length ? `<p class="cmp-dim" style="margin-top:4px;">训练技能：${summary.skills.map((s) => esc(s.name)).join('、')}</p>` : ''}
      </section>

      <section class="detail-section" data-coursemap-section="facts">
        <h2 class="section-title">核心事实</h2>
        <div class="metric-grid">
          ${metricBlock('提供方', summary.provider
    ? `<a href="${esc(L.provider(summary.provider.provider_id))}">${esc(summary.provider.name)}</a>`
    : '未知')}
          ${metricBlock('适合基础', esc(labelOf({ beginner: '入门', intermediate: '有基础', advanced: '进阶' }, resource.difficulty)))}
          ${metricBlock('总时长', typeof resource.duration_hours === 'number' ? `${resource.duration_hours} 小时` : '—')}
          ${metricBlock('每周投入', typeof resource.weekly_workload_hours === 'number' ? `${resource.weekly_workload_hours} 小时/周` : '—')}
          ${metricBlock('费用', fee ? (fee.fee === 0 ? '免费' : (typeof fee.fee === 'number' ? `¥${fee.fee}` : '—')) : '—')}
          ${metricBlock('证书', resource.certificate_available === true ? '提供' : (resource.certificate_available === false ? '不提供' : '—'))}
        </div>
        ${prereqSkills.length ? `<p class="cmp-dim" style="margin-top:8px;">先修技能：${prereqSkills.map((s) => esc(s.name)).join('、')}</p>` : '<p class="cmp-dim" style="margin-top:8px;">无先修要求（或未记录）。</p>'}
      </section>

      <section class="detail-section" data-coursemap-section="outcomes">
        <h2 class="section-title">能学到什么？</h2>
        ${(resource.learning_outcomes || []).length
    ? `<ul class="outcome-list">${(resource.learning_outcomes || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`
    : `<p class="cmp-dim">${isRealVerified
      ? '官方页面未提供结构化的「学习产出」字段，CourseMap 不代为撰写。请通过官方链接查看课程大纲。'
      : '暂无学习产出数据。'}</p>`}
      </section>

      <section class="detail-section" data-coursemap-section="rating">
        <h2 class="section-title">学习者如何评价？</h2>
        ${ratingBlock(rating, { showSample: true, showProvenance: true })}
        ${rating.count > 0 ? `
          <div class="metric-grid" style="margin-top:12px;">
            ${metricBlock('内容质量', rating1(rating.dimensions.contentQuality))}
            ${metricBlock('难度匹配', rating1(rating.dimensions.difficultyMatch))}
            ${metricBlock('实用价值', rating1(rating.dimensions.practicalValue))}
            ${metricBlock('工作量标注准确度', rating1(rating.dimensions.workloadAccuracy))}
            ${metricBlock('愿意推荐', rating.wouldRecommendPct === null ? '—' : pct(rating.wouldRecommendPct))}
          </div>` : ''}
        ${rating.count === 0 ? '<p class="cmp-dim" style="margin-top:8px;">暂无评价数据。我们不会用提供方评分代替资源评分。</p>' : ''}
        <div style="margin-top:12px;">
          <a class="btn btn--ghost btn--sm" href="${esc(L.review(resource.resource_id))}">写一条本地学习评价（Local Prototype）→</a>
        </div>
        ${localReviewHtml}
      </section>

      <section class="detail-section" data-coursemap-section="next">
        <h2 class="section-title">下一步可以学什么？</h2>
        ${nextGoals.length ? `<div class="cluster">${nextGoals.map((g) => `<a class="tag tag--link" href="${esc(L.search({ goal: g.goal_id }))}">${esc(g.name)} →</a>`).join('')}</div>` : '<p class="cmp-dim">当前数据集中没有为该目标登记后续目标。</p>'}
        ${uniquePaths.length ? `<div class="cluster" style="margin-top:8px;">覆盖该目标的路径：${uniquePaths.map((p) => `<a class="tag tag--link" href="${esc(L.path(p.path_id))}">${esc(p.name)} →</a>`).join('')}</div>` : ''}
      </section>

      <section class="detail-section" data-coursemap-section="provenance">
        <h2 class="section-title">信息何时更新？是否核验？数据来自哪里？</h2>
        <div class="metric-grid">
          ${metricBlock('信息更新日期', esc(dateOnly(resource.updated_at)) || '—')}
          ${metricBlock('费用观测日期', (esc(dateOnly(fee ? fee.observedAt : null)) || '—') + (ageText ? `（${esc(ageText)}）` : ''))}
          ${metricBlock('核验状态', esc(labelOf({ unverified: '未核验', editorial_verified: '编辑核验', provider_confirmed: '提供方确认', source_verified: '来源已核验' }, resource.verification_status)))}
          ${metricBlock('数据类别', badgeDataClass(summary.isDemo, { compact: true }))}
          ${metricBlock('官方许可', officialSource ? licenseBadge(officialSource.source) : '<span class="cmp-dim">无</span>')}
          ${officialSource ? metricBlock('官方来源', `<a href="${esc(officialSource.source.official_url || officialSource.source.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(officialSource.source.provider)}</a>`) : ''}
        </div>
        ${isRealVerified ? `<p class="cmp-dim" style="margin-top:8px;">这是 CourseMap 已核验的开放教育资源（OER）。CourseMap 只保存元数据与官方链接，<strong>不复制课程正文</strong>；请通过官方链接前往提供方页面获取正式内容。</p>` : ''}
        <div style="margin-top:12px;">
          ${sourceList(sourceEntries)}
        </div>
        ${fee ? `<h3 class="sub-title" style="margin-top:20px;">费用观测历史（append-only）</h3>
        ${feeTimeline((ctx.indexes.feesByResource.get(resource.resource_id) || [])
    .filter((r) => r.status === 'published')
    .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1)))}` : ''}
      </section>

      <div class="detail-actions">
        ${resource.url
    ? `<a class="btn btn--primary" data-coursemap-official-link href="${esc(resource.url)}" rel="noopener noreferrer nofollow" target="_blank">${isRealVerified ? '查看官方资源' : '前往资源页面'} ↗</a>`
    : '<span class="notice notice--demo" style="display:inline-block;">演示数据不提供真实外链（不得伪造指向真实课程的 URL）。</span>'}
        <button type="button" class="btn btn--ghost" data-favorite-toggle="${resource.resource_id}">收藏这个资源</button>
        ${summary.goals.length ? `<a class="btn btn--ghost" href="${esc(L.compare(summary.goals[0].goal_id))}">比较同类资源 →</a>` : ''}
      </div>
    `;

    bindFavoriteState();
    function bindFavoriteState() {
      import('../storage.js').then(({ isFavorite, storageAvailable: ok }) => {
        const button = mount.querySelector('[data-favorite-toggle]');
        if (button && ok && isFavorite(resource.resource_id)) {
          button.textContent = '已收藏';
          button.setAttribute('aria-pressed', 'true');
        }
      });
    }
  },
});
