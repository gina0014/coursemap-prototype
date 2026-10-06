/* ============================================================================
   CourseMap — js/featured-oer.js
   ----------------------------------------------------------------------------
   首页「精选开放学习资源」模块（Real OER Expansion · Module 6）。

   纪律（三条，缺一不可）：
     1. **只展示 verified real resources**。demo 记录永远不会出现在这里，
        因此本模块不需要（也不允许）出现 DEMO 徽标——出现即视为缺陷。
     2. **不得因为机构名气硬编码排名**。选取算法只看「可核验程度 + 覆盖多样性」，
        机构名（Harvard / MIT / Google / OpenStax）只用于「同一机构最多 N 条」
        的多样性约束，不作为加分项。
     3. **每张卡必须能点回官方页面**。没有 official_url 的真实资源直接排除，
        而不是渲染一个空链接。

   选取算法（可解释、可复算）：
     候选 = status=published 且 data_class=real 且至少绑定一个带 http(s)
            official_url 的来源。
     打分 = 可核验字段完整度（level_official / certificate_available /
            prerequisites_official / fee 各自非 null 计 1 分）
            + 许可已知（license !== 'unknown'）计 1 分。
     贪心 = 依次取分数最高者；若该 provider 已达 maxPerProvider 或该 subject
            已达 maxPerSubject 则跳过（保底：若全部被跳过则放宽 subject 约束，
            但仍不放宽 provider 约束，避免整屏同一机构）。
     同分 = 按 resource_id 升序（稳定，不随机）。
   ========================================================================== */

import { esc } from './utils.js';
import {
  L, labelOf, badgeDataClass, licenseBadge, officialResourceLink,
  DIFFICULTY, RESOURCE_TYPE, LANGUAGE,
} from './components.js';

export const FEATURED_LIMIT = 8;
export const FEATURED_MAX_PER_PROVIDER = 2;
export const FEATURED_MAX_PER_SUBJECT = 3;

/** 取该资源绑定的第一个「有官方链接」的来源。 */
export function officialSourceOf(ctx, resource) {
  const relations = ctx.indexes.resourceSourcesByResource.get(resource.resource_id) || [];
  for (const relation of relations) {
    const source = ctx.indexes.sourceById.get(relation.source_id);
    if (source && (source.official_url || source.url) && /^https?:\/\//.test(source.official_url || source.url)) {
      return source;
    }
  }
  return null;
}

/** 可核验字段完整度：数值越高，这条记录的来源支撑越充分。 */
export function verificationScore(resource, source) {
  let score = 0;
  for (const field of ['level_official', 'certificate_available', 'prerequisites_official', 'fee']) {
    if (resource[field] !== null && resource[field] !== undefined) score += 1;
  }
  if (source && source.license && source.license !== 'unknown') score += 1;
  if (source && source.usage_permission && source.usage_permission !== 'unknown') score += 1;
  return score;
}

/**
 * 选取精选资源。返回 [{ resource, source, score }]。
 * @param {object} ctx 数据上下文
 * @param {{limit?:number, maxPerProvider?:number, maxPerSubject?:number}} opts
 */
export function pickFeatured(ctx, opts = {}) {
  const limit = opts.limit || FEATURED_LIMIT;
  const maxPerProvider = opts.maxPerProvider || FEATURED_MAX_PER_PROVIDER;
  const maxPerSubject = opts.maxPerSubject || FEATURED_MAX_PER_SUBJECT;

  const candidates = [];
  for (const resource of ctx.resources) {
    if (resource.status !== 'published') continue;
    if (resource.data_class !== 'real') continue;       // 纪律 1：只展示真实资源
    const source = officialSourceOf(ctx, resource);
    if (!source) continue;                              // 纪律 3：没有官方链接就不展示
    candidates.push({ resource, source, score: verificationScore(resource, source) });
  }

  /* 稳定排序：分数降序 → resource_id 升序（不引入机构名气权重） */
  candidates.sort((a, b) => b.score - a.score
    || Number(a.resource.resource_id) - Number(b.resource.resource_id));

  const picked = [];
  const providerCount = new Map();
  const subjectCount = new Map();
  const taken = new Set();

  const tryPass = (enforceSubject) => {
    for (const cand of candidates) {
      if (picked.length >= limit) return;
      const id = cand.resource.resource_id;
      if (taken.has(id)) continue;
      const p = cand.resource.provider_id;
      const s = cand.resource.subject_id;
      if ((providerCount.get(p) || 0) >= maxPerProvider) continue;
      if (enforceSubject && (subjectCount.get(s) || 0) >= maxPerSubject) continue;
      taken.add(id);
      picked.push(cand);
      providerCount.set(p, (providerCount.get(p) || 0) + 1);
      subjectCount.set(s, (subjectCount.get(s) || 0) + 1);
    }
  };

  tryPass(true);
  /* 保底：不足额时放宽学科约束（但**不放宽**机构约束，避免整屏同一机构） */
  if (picked.length < limit) tryPass(false);

  return picked;
}

/* ----------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

function feeText(resource) {
  if (resource.fee === null || resource.fee === undefined) {
    return '<span class="cmp-dim">费用未核验</span>';
  }
  if (resource.fee === 0) return '<span class="badge badge--verified">免费</span>';
  return `¥${esc(String(resource.fee))}`;
}

/** 难度：只展示已核验的信息。CourseMap 枚举难度为 null 时展示官方等级，仍无则写「未核验」。 */
function difficultyText(resource) {
  if (resource.difficulty) return esc(labelOf(DIFFICULTY, resource.difficulty));
  if (resource.level_official) return esc(String(resource.level_official));
  return '<span class="cmp-dim">难度未核验</span>';
}

export function featuredOerCard(ctx, { resource, source }) {
  const provider = ctx.indexes.providerById.get(resource.provider_id);
  const subject = ctx.indexes.subjectById.get(resource.subject_id);
  const goals = (resource.learning_goal_ids || [])
    .map((id) => ctx.indexes.goalById.get(id))
    .filter(Boolean);

  return `<div class="card featured-card" data-coursemap-featured-card="${esc(String(resource.resource_id))}">
      <div class="card__head">
        <div class="card__title"><a href="${esc(L.resource(resource.resource_id))}">${esc(resource.title)}</a></div>
        <div>${badgeDataClass(resource.data_class === 'demo', { compact: false })}</div>
      </div>
      <div class="card__body">
        <div class="cmp-card__row"><span class="cmp-card__label">提供方</span><span data-coursemap-featured-provider>${esc(provider ? provider.name : '—')}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">学科</span><span>${esc(subject ? subject.name : '—')}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">类型</span><span>${esc(labelOf(RESOURCE_TYPE, resource.resource_type))} · ${esc(labelOf(LANGUAGE, resource.language))}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">难度</span><span data-coursemap-featured-difficulty>${difficultyText(resource)}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">费用</span><span data-coursemap-featured-fee>${feeText(resource)}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">适合目标</span><span>${goals.length ? esc(goals.map((g) => g.name).join('、')) : '—'}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">许可</span><span data-coursemap-license-cell>${licenseBadge(source)}</span></div>
        <div class="cmp-card__row"><span class="cmp-card__label">来源</span><span>${esc(source.provider)}${source.observed_at ? ` · 观测日 ${esc(String(source.observed_at).slice(0, 10))}` : ''}</span></div>
        ${resource.prerequisites_official ? `<div class="cmp-dim" data-coursemap-featured-prereq>先修（官方原文）：${esc(resource.prerequisites_official)}</div>` : ''}
        <div class="featured-card__actions">
          <a class="btn btn--primary btn--sm" href="${esc(L.resource(resource.resource_id))}">查看详情</a>
          ${officialResourceLink(source, { label: '访问官方资源' })}
        </div>
      </div>
    </div>`;
}

/** 渲染到 [data-featured-oer]；同时写出选取口径说明，便于审计。 */
export function renderFeaturedOer(ctx, root = document) {
  const box = root.querySelector('[data-featured-oer]');
  if (!box) return { rendered: 0, total: 0 };

  const picked = pickFeatured(ctx);
  const realTotal = ctx.resources.filter((r) => r.data_class === 'real' && r.status === 'published').length;

  if (!picked.length) {
    box.innerHTML = '<p class="cmp-dim">当前没有可展示的已核验真实资源。</p>';
    return { rendered: 0, total: realTotal };
  }

  box.innerHTML = picked.map((entry) => featuredOerCard(ctx, entry)).join('');
  box.setAttribute('data-coursemap-featured-count', String(picked.length));

  const note = root.querySelector('[data-featured-oer-note]');
  if (note) {
    const providers = new Set(picked.map((p) => p.resource.provider_id)).size;
    const subjects = new Set(picked.map((p) => p.resource.subject_id)).size;
    note.innerHTML = `本区仅展示 <strong>已核验真实资源</strong>（REAL · 来源已核验），共 ${picked.length} 条，`
      + `覆盖 ${providers} 家官方提供方、${subjects} 个学科；`
      + `当前数据集共有 ${realTotal} 条已发布真实资源。`
      + `展示顺序按「可核验字段完整度 + 覆盖多样性」自动选取，<strong>不按机构名气排序</strong>。`
      + `演示（DEMO）记录不会出现在本区，可在<a href="${esc(L.search({}))}">全部资源</a>中查看并单独标注。`;
  }

  return { rendered: picked.length, total: realTotal };
}
