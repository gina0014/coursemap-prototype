/* ============================================================================
   CourseMap（学途） — components.js
   ----------------------------------------------------------------------------
   共享 UI 组件。**只消费** data-loader 已加载的数据与 derive 已计算的结果，
   不做任何数据访问（不 fetch）与任何业务计算。

   三条不可违反的渲染规则：
     R1. data_class === 'demo' 的记录 → 必须渲染不可隐藏的 DEMO 徽标
     R2. 任何评分聚合 → 必须同时渲染评价条数 + 样本状态 + 来源类别
     R3. 费用 → 必须同时渲染核验状态与观测日期（未知 ≠ 0）
   ========================================================================== */

import { APP, AI, asset } from './config.js';
import { esc, money, rating1, pct, dateOnly, daysSince } from './utils.js';
import {
  RESOURCE_TYPE, DIFFICULTY, LEARNING_MODE, LANGUAGE, FEE_VERIFICATION,
  SOURCE_TYPE, USAGE_PERMISSION, SOURCE_VERIFICATION, DATA_CLASS,
  AGGREGATE_PROVENANCE, RESOURCE_SOURCE_SCOPE, PROVIDER_TYPE, COMPLETION_STATUS,
  LEARNING_TAGS, FEE_TYPE, SORT_LABELS, LICENSE_FLAG, LICENSE_SEMANTICS_NOTE,
  UNKNOWN, NOT_VERIFIED, LIMITED_DATA, labelOf, pickEnum,
} from './labels.js';

/* ----------------------------------------------------------------------------
   链接
   -------------------------------------------------------------------------- */

function withQuery(base, params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '' || value === 'all') continue;
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `${base}?${q}` : base;
}

export const L = {
  home: () => asset('index.html'),
  search: (params) => withQuery(asset('pages/search.html'), params),
  resource: (id) => withQuery(asset('pages/resource.html'), { id }),
  provider: (id) => withQuery(asset('pages/provider.html'), { id }),
  compare: (goalId) => withQuery(asset('pages/compare.html'), { goal: goalId }),
  paths: () => asset('pages/paths.html'),
  path: (id) => withQuery(asset('pages/path.html'), { id }),
  favorites: () => asset('pages/favorites.html'),
  review: (resourceId) => withQuery(asset('pages/review.html'), { resource_id: resourceId }),
  advisor: () => asset('pages/advisor.html'),
  methodology: () => asset('pages/data-methodology.html'),
  about: () => asset('pages/about.html'),
  notFound: () => asset('404.html'),
};

/* ----------------------------------------------------------------------------
   徽标
   -------------------------------------------------------------------------- */

/** R1：DEMO 徽标。不可隐藏、不可用颜色代替文字。 */
export function badgeDemo(isDemo, { compact = false } = {}) {
  if (!isDemo) return '';
  return `<span class="badge badge--demo" data-coursemap-badge="demo">${compact ? 'DEMO' : 'DEMO · 演示数据'}</span>`;
}

/** Module E/P：数据类别徽标。REAL 记录必须显式标注，不能让读者误以为是演示数据。 */
export function badgeDataClass(isDemo, { compact = false } = {}) {
  if (isDemo) return badgeDemo(true, { compact });
  return `<span class="badge badge--verified" data-coursemap-badge="real">${compact ? 'REAL' : 'REAL · 真实资源'}</span>`;
}

/** 页面级数据构成徽标（运行时计算，禁止硬编码「全部为演示数据」）。 */
export function pageDataBadges(ctx) {
  const t = ctx && ctx.stats && ctx.stats.totals && ctx.stats.totals.resources;
  if (!t) return '';
  const parts = [];
  if (t.demo > 0) parts.push(badgeDemo(true, { compact: true }));
  if (t.real > 0) parts.push(badgeDataClass(false, { compact: true }));
  return parts.join('');
}

export function badgeTone(label, tone, extraAttrs = '') {
  if (!label) return '';
  return `<span class="badge badge--${tone}" ${extraAttrs}>${esc(label)}</span>`;
}

/** 难度徽标 */
export function badgeDifficulty(difficulty) {
  const meta = pickEnum(DIFFICULTY, difficulty);
  if (!meta) return badgeTone('难度 Unknown', 'unknown', 'data-coursemap-badge="difficulty-unknown"');
  return badgeTone(meta.label, meta.tone, `data-coursemap-badge="difficulty" title="难度：${esc(meta.label)}"`);
}

/** R3：费用核验徽标（观测日期由 feeBlock 负责） */
export function badgeFeeVerification(fee) {
  if (!fee) return badgeTone('费用未知', 'unknown', 'data-coursemap-badge="fee-unknown"');
  const meta = pickEnum(FEE_VERIFICATION, fee.verificationStatus);
  const tone = meta && meta.tone === 'verified' ? 'verified' : (meta && meta.tone === 'unknown' ? 'unknown' : 'unverified');
  return `<span class="badge badge--${tone}" data-coursemap-badge="fee-verification" title="${esc(meta ? meta.hint : '')}">${esc(meta ? meta.label : UNKNOWN)}</span>`;
}

/** R2：评分来源标签 */
export function badgeRatingProvenance(rating) {
  const meta = pickEnum(AGGREGATE_PROVENANCE, rating.provenance);
  return `<span class="badge badge--${meta.tone}" data-coursemap-badge="rating-provenance">${esc(meta.label)}</span>`;
}

/** 样本不足必须显式标注，不得隐藏样本量 */
export function badgeSampleState(rating) {
  if (rating.sampleState === 'none') {
    return '<span class="badge badge--unknown" data-coursemap-badge="sample-state">暂无评价</span>';
  }
  if (rating.sampleState === 'limited') {
    return `<span class="badge badge--limited" data-coursemap-badge="sample-state">${LIMITED_DATA}（样本不足）</span>`;
  }
  return '<span class="badge badge--ghost" data-coursemap-badge="sample-state">样本充足</span>';
}

export function badgeCertificate(cert) {
  if (cert === true) return badgeTone('提供证书', 'verified', 'data-coursemap-badge="certificate"');
  if (cert === false) return badgeTone('无证书', 'ghost', 'data-coursemap-badge="certificate"');
  return badgeTone('证书未知', 'unknown', 'data-coursemap-badge="certificate-unknown"');
}

/* ----------------------------------------------------------------------------
   费用区块（R3：金额 + 观测日期 + 核验必须一起出现）
   -------------------------------------------------------------------------- */

export function feeBlock(fee, { size = 'md' } = {}) {
  if (!fee) {
    return `<span class="fee"><span class="fee__value fee__value--unknown" data-coursemap-fee="unknown">${UNKNOWN}</span></span>`;
  }
  const amount = money(fee.fee);
  // 真实 0（免费）与 unknown 必须区分
  const amountText = amount === null ? UNKNOWN : (amount === 0 ? '免费' : `¥${amount}`);
  const age = typeof fee.ageDays === 'number' ? fee.ageDays : daysSince(fee.observedAt);
  const ageText = age === null ? '' : (age <= 0 ? '今日观测' : `${age} 天前观测`);
  const staleMark = fee.needsRecheck
    ? '<span class="badge badge--limited" data-coursemap-badge="recheck" title="观测时间较久，已列入内部重新核验队列。这不代表费用在这段时间内一直有效。">建议复检</span>'
    : '';
  return `<span class="fee">
      <span class="fee__value" data-coursemap-fee="value" style="${size === 'lg' ? 'font-size:var(--cm-fs-2xl);' : ''}">${esc(amountText)}</span>
      <span class="fee__date" data-coursemap-fee="observed-at">观测于 ${esc(dateOnly(fee.observedAt))}${ageText ? `（${esc(ageText)}）` : ''}</span>
      ${staleMark}
    </span>`;
}

/* ----------------------------------------------------------------------------
   评分区块（R2）
   -------------------------------------------------------------------------- */

export function ratingBlock(rating, { showSample = true, showProvenance = true } = {}) {
  const value = rating.overall === null
    ? `<span class="metric__value" data-coursemap-metric="overall">${NOT_VERIFIED}</span>`
    : `<span class="metric__value" data-coursemap-metric="overall">★ ${rating1(rating.overall)}</span>`;
  const count = showSample
    ? `<span class="metric__label" data-coursemap-metric="review-count">（${rating.count} 条评价）</span>`
    : '';
  const flags = [
    showSample && rating.sampleState !== 'sufficient' ? badgeSampleState(rating) : '',
    showProvenance && rating.count > 0 ? badgeRatingProvenance(rating) : '',
  ].filter(Boolean).join(' ');
  return `<span class="metric metric--rating">${value}${count}${flags ? ` ${flags}` : ''}</span>`;
}

export function metricBlock(label, valueHtml, { tone = '', hint = '' } = {}) {
  const cls = tone ? ` metric--${tone}` : '';
  return `<span class="metric${cls}"${hint ? ` title="${esc(hint)}"` : ''}>
      <span class="metric__label">${esc(label)}</span>
      <span class="metric__value">${valueHtml}</span>
    </span>`;
}

/* ----------------------------------------------------------------------------
   结果卡片（搜索 / 首页 / 收藏 / 路径步骤）
   -------------------------------------------------------------------------- */

export function resourceCard(summary, { showGoalLinks = true, favorite = false, compactMeta = false } = {}) {
  const { resource, provider, goals, fee, rating, isDemo } = summary;

  const goalLinks = showGoalLinks && goals.length
    ? goals.map((g) => `<a class="tag tag--link" href="${esc(L.search({ goal: g.goal_id }))}">${esc(g.name)}</a>`).join('')
    : '';

  const meta = [
    provider ? `<a href="${esc(L.provider(provider.provider_id))}">${esc(provider.name)}</a>` : '',
    labelOf(RESOURCE_TYPE, resource.resource_type),
    labelOf(LANGUAGE, resource.language),
  ].filter(Boolean).join(' · ');

  const durationText = typeof resource.duration_hours === 'number'
    ? `${resource.duration_hours} 小时`
    : '<span class="cmp-dim" title="总时长未知">时长 —</span>';
  const workloadText = typeof resource.weekly_workload_hours === 'number'
    ? `每周 ${resource.weekly_workload_hours} 小时`
    : '<span class="cmp-dim" title="每周投入未知">周投入 —</span>';

  const tags = (rating.dimensions && rating.overall !== null)
    ? ''
    : '';

  return `<article class="resource-card" data-coursemap-card data-resource-id="${resource.resource_id}">
    <div class="resource-card__top">
      <div>
        <h3 class="resource-card__name"><a href="${esc(L.resource(resource.resource_id))}" data-coursemap-link="resource">${esc(resource.title)}</a></h3>
        <div class="resource-card__badges" style="margin-top:4px;">
          ${badgeDataClass(isDemo)}
          ${badgeDifficulty(resource.difficulty)}
          ${badgeCertificate(resource.certificate_available)}
        </div>
      </div>
      <div style="text-align:right;display:grid;gap:4px;justify-items:end;">
        ${feeBlock(fee)}
        ${badgeFeeVerification(fee)}
      </div>
    </div>

    <p class="resource-card__where">${esc(meta)}</p>

    <div class="resource-card__metrics">
      ${metricBlock('学习者评分', rating.overall === null ? NOT_VERIFIED : `★ ${rating1(rating.overall)}`, { tone: rating.overall === null ? 'unknown' : '' })}
      <span class="metric" data-coursemap-metric="review-count"><span class="metric__label">评价数</span><span class="metric__value">${rating.count}</span></span>
      ${metricBlock('总时长', durationText, { tone: typeof resource.duration_hours === 'number' ? '' : 'unknown' })}
      ${metricBlock('每周投入', workloadText, { tone: typeof resource.weekly_workload_hours === 'number' ? '' : 'unknown' })}
      ${compactMeta ? '' : metricBlock('学习模式', esc(labelOf(LEARNING_MODE, resource.learning_mode)))}
    </div>

    <div class="cluster">
      ${rating.sampleState !== 'sufficient' ? badgeSampleState(rating) : ''}
      ${rating.count > 0 ? badgeRatingProvenance(rating) : ''}
    </div>

    ${goalLinks ? `<div class="resource-card__tags">${goalLinks}</div>` : ''}

    <div class="resource-card__actions">
      <a class="btn btn--ghost btn--sm" href="${esc(L.resource(resource.resource_id))}">看这个资源</a>
      ${goals.length ? `<a class="btn btn--sm" href="${esc(L.compare(goals[0].goal_id))}" data-coursemap-link="compare">和同类比一比 →</a>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn--ghost btn--sm" data-favorite-toggle="${resource.resource_id}" aria-pressed="${favorite ? 'true' : 'false'}">${favorite ? '已收藏' : '收藏'}</button>
    </div>
  </article>`;
}

export function resourceCardGrid(summaries, opts = {}) {
  if (!summaries.length) return '';
  return `<div class="grid grid--cards">${summaries.map((s) => resourceCard(s, opts)).join('')}</div>`;
}

/* ----------------------------------------------------------------------------
   状态组件（Loading / Empty / Error / Not Found）
   -------------------------------------------------------------------------- */

export function stateLoading(message = '正在读取数据…') {
  return `<div class="state" data-coursemap-state="loading">
      <div class="state__title">${esc(message)}</div>
      <div class="skeleton skeleton--line" style="max-width:280px;margin:16px auto 8px;"></div>
      <div class="skeleton skeleton--line" style="max-width:200px;margin:0 auto 8px;"></div>
      <div class="skeleton skeleton--card" style="max-width:420px;margin:16px auto 0;"></div>
    </div>`;
}

export function stateEmpty({ title, desc, relaxations = [], extraHtml = '' } = {}) {
  const relaxHtml = relaxations.length
    ? `<div class="relax-list">${relaxations.map((item) => `
        <div class="relax-item">
          <span>${esc(item.label)}</span>
          <span><strong class="num">${item.count}</strong> 个资源 <a class="btn btn--ghost btn--sm" href="${esc(item.href)}">放宽</a></span>
        </div>`).join('')}</div>`
    : '';
  return `<div class="state" data-coursemap-state="empty">
      <div class="state__icon" aria-hidden="true">🧭</div>
      <div class="state__title">${esc(title || '没有符合条件的学习资源')}</div>
      <div class="state__desc">${esc(desc || '当前筛选条件下没有结果。下面是可以立即执行的放宽路径（数量为实时计算）。')}</div>
      ${relaxHtml}
      ${extraHtml}
      <div class="state__actions">
        <a class="btn btn--primary" href="${esc(L.home())}">回到首页</a>
      </div>
    </div>`;
}

export function stateError({ title, message, detail } = {}) {
  return `<div class="state state--error" data-coursemap-state="error">
      <div class="state__icon" aria-hidden="true">⚠️</div>
      <div class="state__title">${esc(title || '数据加载失败')}</div>
      <div class="state__desc">${esc(message || '页面无法读取运行时的 JSON 数据。')}</div>
      ${detail ? `<details class="disclosure" style="margin-top:16px;text-align:left;"><summary>技术细节（仅供排查）</summary><div class="disclosure__body"><code>${esc(detail)}</code></div></details>` : ''}
      <div class="state__actions">
        <button type="button" class="btn btn--primary" data-action="retry">重试</button>
        <a class="btn btn--ghost" href="${esc(L.home())}">回到首页</a>
      </div>
    </div>`;
}

export function stateNotFound({ title, desc } = {}) {
  return `<div class="state state--notfound" data-coursemap-state="notfound">
      <div class="state__icon" aria-hidden="true">🔍</div>
      <div class="state__title">${esc(title || '没有找到这个学习资源')}</div>
      <div class="state__desc">${esc(desc || '这个链接可能已失效，或者该记录尚未发布。')}</div>
      <div class="state__actions">
        <a class="btn btn--primary" href="${esc(L.home())}">回到首页</a>
        <a class="btn btn--ghost" href="${esc(L.search({}))}">浏览全部资源</a>
      </div>
    </div>`;
}

/* ----------------------------------------------------------------------------
   来源区块（Provenance）— Module F / G / N / U
   必须呈现：来源类型 / 官方提供方 / 许可 / 许可含义 / 观测日 / 核验状态 /
             官方链接（可点击回到出处）
   -------------------------------------------------------------------------- */

/** 把 boolean 许可标志翻译为「允许/禁止」短语。未知（null）必须显示为未知，不得推测。 */
function licenseFlagText(field, value) {
  const map = LICENSE_FLAG[field];
  if (!map) return null;
  if (value === true) return { text: map.true, ok: true };
  if (value === false) return { text: map.false, ok: false };
  return { text: `${field} 未知`, ok: null };
}

/**
 * 许可徽标（Module G）。
 * 关键纪律：显示许可字符串本身（如 CC BY-NC-SA 4.0），并显式区分
 * 「免费」/「开放许可」/「公有领域」/「允许商用」四件不同的事。
 */
export function licenseBadge(source) {
  if (!source || !source.license) {
    // 演示来源本来就没有许可；真实来源缺许可会在数据层被 VR-E12 拦下。
    return `<span class="badge badge--unknown" data-coursemap-license="none">许可 Unknown</span>`;
  }
  const isPd = source.public_domain === true;
  const commercial = source.commercial_use === true;
  const tone = isPd ? 'verified' : (commercial ? 'verified' : 'unverified');
  const title = [
    `许可：${source.license}`,
    isPd ? '公有领域' : '非公有领域',
    commercial ? '允许商用' : '禁止商用',
  ].join(' · ');
  return `<span class="badge badge--${tone}" data-coursemap-license="value" title="${esc(title)}">${esc(source.license)}</span>`;
}

/** 许可要点（Module G/U）：逐条列出布尔标志，未知字段不猜。 */
export function licensePanel(source) {
  if (!source || (!source.license && !source.license_url)) return '';
  const flags = ['commercial_use', 'adaptation_allowed', 'attribution_required', 'share_alike', 'public_domain', 'ai_training_allowed']
    .map((field) => ({ field, ...licenseFlagText(field, source[field]) }))
    .filter((f) => f.text);
  const flagHtml = flags.length
    ? `<div class="license-flags">${flags.map((f) => `<span class="license-flag license-flag--${f.ok === true ? 'yes' : (f.ok === false ? 'no' : 'unknown')}">${esc(f.text)}</span>`).join('')}</div>`
    : '';
  return `<div class="license-panel" data-coursemap-license-panel>
      <div class="license-panel__head">
        <span class="license-panel__label">许可</span>
        ${licenseBadge(source)}
        ${source.license_url ? `<a class="license-panel__link" href="${esc(source.license_url)}" rel="noopener noreferrer nofollow" target="_blank">许可全文 ↗</a>` : ''}
      </div>
      ${source.public_domain === true
    ? '<p class="license-panel__note">该来源为<strong>公有领域</strong>作品，不受版权限制。</p>'
    : `<p class="license-panel__note">${esc(LICENSE_SEMANTICS_NOTE)}</p>`}
      ${source.license_note ? `<p class="license-panel__note">${esc(source.license_note)}</p>` : ''}
      ${flagHtml}
    </div>`;
}

/** Module F/N：官方资源按钮。只有存在官方链接时才渲染，绝不伪造 URL。 */
export function officialResourceLink(source, { label = '查看官方资源' } = {}) {
  const href = source && (source.official_url || source.url);
  if (!href) return '';
  return `<a class="btn btn--ghost btn--sm" data-coursemap-official-link href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${esc(label)} ↗</a>`;
}

export function sourceItem({ source, relation, note }) {
  const usage = pickEnum(USAGE_PERMISSION, source.usage_permission);
  const verification = pickEnum(SOURCE_VERIFICATION, source.verification_status);
  const scope = relation ? labelOf(RESOURCE_SOURCE_SCOPE, relation.field_scope, '通用') : null;
  const official = source.official_url || source.url;

  return `<div class="source-item" data-coursemap-source="${esc(String(source.source_id))}" data-coursemap-license-value="${esc(source.license || '')}">
      <div class="source-item__title">${esc(source.title || source.provider)}</div>
      <div class="source-item__meta">
        <span>类型：${esc(labelOf(SOURCE_TYPE, source.source_type))}</span>
        <span>官方提供方：${esc(source.provider)}</span>
        ${scope ? `<span>支撑字段：${esc(scope)}</span>` : ''}
        <span>核验：${esc(verification.label)}</span>
        <span>授权：<span class="badge badge--${usage.tone}">${esc(usage.label)}</span></span>
        <span>许可：${licenseBadge(source)}</span>
        <span>观测日：${esc(dateOnly(source.observed_at || source.retrieved_at)) || '未记录'}</span>
      </div>
      ${official
    ? `<div class="source-item__meta"><span>官方链接：<a href="${esc(official)}" rel="noopener noreferrer nofollow" target="_blank">${esc(official)}</a></span></div>`
    : '<div class="source-item__meta"><span>官方链接：无（演示来源不指向任何真实第三方页面）</span></div>'}
      ${note ? `<div class="source-item__meta"><span>${esc(note)}</span></div>` : ''}
      ${official
    ? `<div class="source-item__actions">${officialResourceLink(source)}</div>`
    : ''}
      ${licensePanel(source)}
    </div>`;
}

export function sourceList(entries, { emptyText } = {}) {
  if (!entries || entries.length === 0) {
    return `<div class="notice notice--danger"><div class="notice__title">暂无合规来源</div>
      按 CourseMap 的发布规则，缺少合规来源的核心事实**不得发布**。此处的缺失是数据问题，不是显示问题。</div>`;
  }
  return `<div class="source-list">${entries.map(sourceItem).join('')}</div>`;
}

/* ----------------------------------------------------------------------------
   费用历史（append-only 时间线）
   -------------------------------------------------------------------------- */

export function feeTimeline(rows, ctxLabelBySource = {}) {
  if (!rows.length) return '<p class="cmp-dim">暂无费用观测记录。</p>';
  return `<div class="timeline">${rows.map((row, index) => {
    const meta = pickEnum(FEE_VERIFICATION, row.verification_status);
    const amount = money(row.fee);
    return `<div class="timeline__item">
        <div class="timeline__date">${esc(dateOnly(row.observed_at))}</div>
        <div>
          <strong class="num">${amount === 0 ? '免费' : `¥${esc(money(row.fee))}`}</strong>
          <span class="cmp-dim"> · ${esc(labelOf(FEE_TYPE, row.fee_type))}</span>
          <span class="badge badge--${meta && meta.tone === 'verified' ? 'verified' : 'unverified'}">${esc(meta ? meta.label : UNKNOWN)}</span>
          ${index === 0 ? '<span class="badge badge--ghost">当前展示费用</span>' : ''}
          <div class="cmp-dim" style="font-size:var(--cm-fs-xs);">来源：${esc(ctxLabelBySource[row.source_id] || `#${row.source_id}`)}</div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

/* ----------------------------------------------------------------------------
   同目标对比（P-05）
   ---------------------------------------------------------------------------- */

function cell(valueHtml, { best = false } = {}) {
  return `<td${best ? ' class="is-best"' : ''}>${valueHtml}</td>`;
}

const dim = (text) => `<span class="cmp-dim">${esc(text)}</span>`;

const feeCellText = (fee) => (fee
  ? `<strong class="num">${money(fee.fee) === 0 ? '免费' : `¥${esc(money(fee.fee))}`}</strong><div class="cmp-dim" style="font-size:var(--cm-fs-xs);">${esc(dateOnly(fee.observedAt))}</div>${badgeFeeVerification(fee)}`
  : dim(UNKNOWN));

export function compareTable(rows, { feeStats, durationStats, ratingStats } = {}) {
  const columns = rows.map((summary) => {
    const { resource, provider } = summary;
    return `<th scope="col">
        <div style="display:grid;gap:4px;">
          <a href="${esc(L.resource(resource.resource_id))}">${esc(resource.title)}</a>
          <span class="cmp-dim" style="font-size:var(--cm-fs-xs);">${esc(provider ? provider.name : '未知提供方')}</span>
          ${badgeDataClass(summary.isDemo, { compact: true })}
        </div>
      </th>`;
  }).join('');

  const row = (label, cells) => `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;

  const isBestRow = (summary, pickSummary) => (pickSummary && summary.resource.resource_id === pickSummary.resource.resource_id);

  const feeCells = rows.map((s) => cell(feeCellText(s.fee), { best: isBestRow(s, feeStats.cheapest) })).join('');
  const durationCells = rows.map((s) => cell(
    typeof s.resource.duration_hours === 'number' ? `<strong class="num">${s.resource.duration_hours}</strong> 小时` : dim(UNKNOWN),
    { best: isBestRow(s, durationStats.shortest) },
  )).join('');
  const difficultyCells = rows.map((s) => cell(badgeDifficulty(s.resource.difficulty))).join('');
  const workloadCells = rows.map((s) => cell(
    typeof s.resource.weekly_workload_hours === 'number' ? `${s.resource.weekly_workload_hours} 小时/周` : dim(UNKNOWN),
  )).join('');
  const languageCells = rows.map((s) => cell(esc(labelOf(LANGUAGE, s.resource.language)))).join('');
  const modeCells = rows.map((s) => cell(esc(labelOf(LEARNING_MODE, s.resource.learning_mode)))).join('');
  const certCells = rows.map((s) => cell(badgeCertificate(s.resource.certificate_available))).join('');
  const ratingCells = rows.map((s) => cell(
    s.rating.overall === null
      ? dim(NOT_VERIFIED)
      : `<strong class="num">★ ${esc(rating1(s.rating.overall))}</strong><div class="cmp-dim" style="font-size:var(--cm-fs-xs);">${s.rating.count} 条评价</div>${s.rating.sampleState !== 'sufficient' ? badgeSampleState(s.rating) : ''}`,
    { best: isBestRow(s, ratingStats.best) },
  )).join('');
  const updatedCells = rows.map((s) => cell(esc(dateOnly(s.resource.updated_at)))).join('');
  const verificationCells = rows.map((s) => cell(badgeFeeVerification(s.fee))).join('');
  const actionCells = rows.map((s) => cell(`<a class="btn btn--ghost btn--sm" href="${esc(L.resource(s.resource.resource_id))}">详情</a>`)).join('');

  return `<div class="cmp-scroll">
    <table class="cmp-table">
      <caption class="sr-only">同一学习目标下多个学习资源的费用、时长、难度与评分对比</caption>
      <thead><tr><th scope="col">对比项</th>${columns}</tr></thead>
      <tbody>
        ${row('费用（含观测日）', feeCells)}
        ${row('总时长', durationCells)}
        ${row('难度', difficultyCells)}
        ${row('每周工作量', workloadCells)}
        ${row('语言', languageCells)}
        ${row('学习模式', modeCells)}
        ${row('证书', certCells)}
        ${row('学习者评分（含样本量）', ratingCells)}
        ${row('信息更新日期', updatedCells)}
        ${row('费用核验状态', verificationCells)}
        ${row('', actionCells)}
      </tbody>
    </table>
  </div>`;
}

export function compareCards(rows) {
  return `<div class="cmp-cards">${rows.map((s) => {
    const { resource, provider, fee } = s;
    const line = (label, value) => `<div class="cmp-card__row"><span class="cmp-card__label">${esc(label)}</span><span>${value}</span></div>`;
    return `<div class="card">
        <div class="card__head">
          <div>
            <div class="card__title"><a href="${esc(L.resource(resource.resource_id))}">${esc(resource.title)}</a></div>
            <div class="cmp-dim" style="font-size:var(--cm-fs-xs);">${esc(provider ? provider.name : '未知提供方')}</div>
          </div>
          <div style="text-align:right;">${badgeDataClass(s.isDemo, { compact: true })}</div>
        </div>
        <div class="card__body">
          ${line('费用', feeCellText(fee))}
          ${line('总时长', typeof resource.duration_hours === 'number' ? `${resource.duration_hours} 小时` : dim(UNKNOWN))}
          ${line('难度', badgeDifficulty(resource.difficulty))}
          ${line('每周工作量', typeof resource.weekly_workload_hours === 'number' ? `${resource.weekly_workload_hours} 小时/周` : dim(UNKNOWN))}
          ${line('证书', badgeCertificate(resource.certificate_available))}
          ${line('学习者评分', s.rating.overall === null ? dim(NOT_VERIFIED) : `★ ${esc(rating1(s.rating.overall))} <span class="cmp-dim">(${s.rating.count} 条)</span>`)}
          <div style="margin-top:12px;"><a class="btn btn--sm" href="${esc(L.resource(resource.resource_id))}">查看详情</a></div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

/* ----------------------------------------------------------------------------
   全站骨架（Header / Footer / Demo 提示条）
   -------------------------------------------------------------------------- */

const NAV = [
  { key: 'search', label: '找课程', href: () => L.search({}) },
  { key: 'paths', label: '学习路径', href: () => L.paths() },
  { key: 'favorites', label: '收藏', href: () => L.favorites() },
  { key: 'advisor', label: 'AI 学习顾问', href: () => L.advisor(), beta: true },
  { key: 'methodology', label: '数据方法论', href: () => L.methodology() },
  { key: 'about', label: '关于', href: () => L.about() },
];

export function headerHtml({ active = '', favoriteCount = 0 } = {}) {
  const links = NAV.map((item) => {
    const badge = item.key === 'favorites' && favoriteCount > 0
      ? `<span class="nav__count">${favoriteCount}</span>`
      : '';
    const beta = item.beta ? '<span class="badge badge--experimental" style="margin-left:4px;">Beta</span>' : '';
    return `<a class="nav__link" href="${esc(item.href())}"${active === item.key ? ' aria-current="page"' : ''}>${esc(item.label)}${badge}${beta}</a>`;
  }).join('');

  return `<div class="container app-header__inner">
      <a class="brand" href="${esc(L.home())}">
        <span class="brand__mark" aria-hidden="true">◈</span>
        <span>
          <span class="brand__name">${esc(APP.name)}<span class="brand__zh">${esc(APP.nameZh)}</span></span>
          <span class="brand__tag">${esc(APP.thesis)}</span>
        </span>
      </a>
      <button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="primary-nav">菜单</button>
      <nav class="nav" id="primary-nav" aria-label="主导航">${links}</nav>
    </div>`;
}

/* Module P：全站数据披露横幅。
   两件事必须同时说清楚：
     1) 数据集里既有「已核验真实 OER 资源」也有「DEMO 演示资源」；
     2) 因此任何页面都不得让读者把 DEMO 记录当成真实课程。
   记录数一律运行时计算（Module P：Verified Real: X / Demo: Y）。 */
export function demoBannerHtml(ctx) {
  if (!ctx || !ctx.stats) return '';
  const { resources, records, demo, real } = ctx.stats.totals;
  if (!ctx.stats.hasDemo && !ctx.stats.hasReal) return '';
  const hasReal = ctx.stats.hasReal;
  const hasDemo = ctx.stats.hasDemo;

  const tag = hasReal && hasDemo ? 'REAL + DEMO' : (hasReal ? 'REAL' : 'DEMO');
  const bodyHtml = hasReal && hasDemo
    ? '<strong>当前数据集同时包含已核验真实资源与演示资源。</strong>真实资源（标有 REAL 徽标与「查看官方资源」）来自 MIT OpenCourseWare、OpenStax 等开放教育资源，CourseMap 只保存元数据与官方链接，<strong>不复制课程正文</strong>；DEMO 记录仅用于产品演示，<strong>不代表真实存在的课程或真实价格</strong>。'
    : (hasReal
      ? '<strong>当前数据集为已核验的开放教育资源（OER）。</strong>每条记录均带官方来源、许可与观测日期；CourseMap 只保存元数据与官方链接，不复制课程正文。'
      : '<strong>当前版本用于产品测试。</strong>学习资源、提供方、费用、评分及学习路径包含演示数据，<strong>不代表真实课程信息、真实价格或真实教育建议</strong>。');

  const disclosure = resources
    ? `学习资源：共 <strong class="num">${resources.total}</strong> 条，其中已核验真实 <strong class="num">${resources.real}</strong> 条（其中带核验状态 <strong class="num">${resources.realVerified}</strong> 条）、演示 <strong class="num">${resources.demo}</strong> 条。`
    : `当前数据集：共 <strong class="num">${records}</strong> 条记录，其中演示 <strong class="num">${demo}</strong> 条、真实 <strong class="num">${real}</strong> 条。`;

  return `<div class="demo-banner" role="status" data-coursemap-banner="demo" data-coursemap-banner-tag="${tag}">
      <div class="container demo-banner__inner">
        <span class="demo-banner__tag">${tag}</span>
        <span>${bodyHtml}</span>
        <span>${disclosure} 演示记录已在各页面单独标注。</span>
        <a class="demo-banner__link" href="${esc(L.methodology())}">查看数据方法论</a>
      </div>
    </div>`;
}

export function footerHtml(ctx) {
  const stats = ctx?.stats?.totals;
  return `<div class="container">
      <div class="footer__cols">
        <div>
          <div class="footer__col-title">探索</div>
          <div class="footer__list">
            <a href="${esc(L.search({}))}">按目标找课程</a>
            <a href="${esc(L.paths())}">学习路径</a>
            <a href="${esc(L.advisor())}">AI 学习顾问（Beta）</a>
            <a href="${esc(L.favorites())}">我的收藏</a>
          </div>
        </div>
        <div>
          <div class="footer__col-title">数据</div>
          <div class="footer__list">
            <a href="${esc(L.methodology())}">数据方法论</a>
            <a href="${esc(L.methodology())}#sources">允许与禁止的数据来源</a>
            <a href="${esc(L.methodology())}#limits">已知限制</a>
          </div>
        </div>
        <div>
          <div class="footer__col-title">关于</div>
          <div class="footer__list">
            <a href="${esc(L.about())}">CourseMap 是什么</a>
            <a href="${esc(L.about())}#validation">我们验证什么</a>
            <a href="${esc(L.about())}#prototype">原型声明</a>
          </div>
        </div>
        <div>
          <div class="footer__col-title">版本</div>
          <div class="footer__list">
            <span class="footer__version">${esc(APP.version)}</span>
            <span>${esc(APP.stage)}</span>
            <span>构建：${esc(APP.buildDate)}</span>
          </div>
        </div>
      </div>
      <div class="footer__bottom">
        <span>CourseMap（学途）是一个独立的教育领域原型项目。它由一个美食决策原型经过完整领域重构而来，迁移决策记录在仓库的 docs/migration/ 中；原「全球图书馆知识与信息服务平台」未被修改。</span>
        <span>·</span>
        <span>无账号 · 无追踪 · 无 Cookie${stats ? ` · 当前数据集 ${stats.records} 条记录` : ''}</span>
        <span>·</span>
        <span class="footer__version">${esc(APP.version)}</span>
      </div>
    </div>`;
}

/* ----------------------------------------------------------------------------
   页面骨架挂载 + 通用交互
   -------------------------------------------------------------------------- */

export function mountChrome(ctx, { active = '' } = {}) {
  const banner = document.querySelector('[data-chrome="banner"]');
  if (banner) banner.innerHTML = demoBannerHtml(ctx);

  const header = document.querySelector('[data-chrome="header"]');
  if (header) {
    header.innerHTML = headerHtml({ active, favoriteCount: ctx?.favoriteCount ?? 0 });
    const toggle = header.querySelector('[data-nav-toggle]');
    const nav = header.querySelector('.nav');
    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  const footer = document.querySelector('[data-chrome="footer"]');
  if (footer) footer.innerHTML = footerHtml(ctx);
}

/** 收藏按钮的全局委托（所有页面通用） */
export function bindFavoriteToggles(ctx, onChange) {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-favorite-toggle]');
    if (!button) return;
    event.preventDefault();
    const { toggleFavorite, storageAvailable: stOk } = await import('./storage.js');
    if (!stOk) {
      button.textContent = '浏览器不支持本地存储';
      button.disabled = true;
      return;
    }
    const resourceId = Number(button.dataset.favoriteToggle);
    const items = toggleFavorite(resourceId);
    const nowFav = items.some((item) => item.resource_id === resourceId);
    button.setAttribute('aria-pressed', nowFav ? 'true' : 'false');
    button.textContent = nowFav ? '已收藏' : '收藏';
    onChange?.(items);
  });
}

export function renderInto(node, html) {
  if (!node) return;
  node.innerHTML = html;
}

export { SORT_LABELS, RESOURCE_TYPE, DIFFICULTY, LEARNING_MODE, LANGUAGE, COMPLETION_STATUS, LEARNING_TAGS, SOURCE_VERIFICATION, LICENSE_FLAG, LICENSE_SEMANTICS_NOTE };
export const DATA_CLASS_LABEL = DATA_CLASS;

/* ----------------------------------------------------------------------------
   枚举与工具的再导出（re-export）
   页面控制器统一从本模块取 UI 相关枚举，避免直接依赖 labels.js 的内部结构。
   -------------------------------------------------------------------------- */
export { PROVIDER_TYPE, labelOf };

/** AI 顾问披露文案（与 config.AI.disclaimer 单一真源一致） */
export const AI_DISCLAIMER = AI.disclaimer;
