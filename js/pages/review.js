/* ============================================================================
   CourseMap — pages/review.js
   ----------------------------------------------------------------------------
   P-08 结构化学习评价（Review Prototype · Local-only）。
   评价对象 = Learning Resource（不是 Provider）。
   提交结果仅保存在本浏览器，不进入数据集、不影响全局评分。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, stateNotFound, COMPLETION_STATUS, LEARNING_TAGS, labelOf } from '../components.js';
import { parseQuery, esc, intOrNull } from '../utils.js';
import { loadLocalReviews, addLocalReview, removeLocalReview, storageAvailable } from '../storage.js';

const DIMENSIONS = [
  { key: 'overall_rating', label: '总体评分' },
  { key: 'content_quality', label: '内容质量' },
  { key: 'difficulty_match', label: '难度匹配（与你的基础）' },
  { key: 'practical_value', label: '实用价值' },
  { key: 'workload_accuracy', label: '工作量标注准确度' },
];

initPage({
  active: 'search',
  async onReady(ctx, helpers) {
    const params = parseQuery();
    const resourceId = intOrNull(params.resource_id);
    const resource = resourceId !== null ? ctx.indexes.resourceById.get(resourceId) : null;
    const mount = document.querySelector('[data-page]');

    if (!resource || resource.status !== 'published') {
      renderInto(mount, stateNotFound({ title: '没有找到要评价的学习资源' }));
      return;
    }

    if (!storageAvailable) {
      mount.innerHTML = `<div class="state">
        <div class="state__title">浏览器不支持本地存储</div>
        <div class="state__desc">本地评价需要 localStorage。当前环境无法保存评价。</div>
      </div>`;
      return;
    }

    const stars = (name, label) => `
      <div class="review-dim">
        <span class="review-dim__label">${esc(label)}</span>
        <div class="star-row" role="radiogroup" aria-label="${esc(label)}">
          ${[1, 2, 3, 4, 5].map((v) => `
            <label class="star">
              <input type="radio" name="${name}" value="${v}" ${v === 4 ? 'checked' : ''}>
              <span aria-hidden="true">${v}★</span>
            </label>`).join('')}
        </div>
      </div>`;

    const renderLocal = () => {
      const rows = loadLocalReviews(resource.resource_id);
      const node = document.querySelector('[data-local-reviews]');
      if (!node) return;
      node.innerHTML = rows.length ? `
        <div class="card">
          <div class="card__head"><div class="card__title">已保存的本地评价（${rows.length}）</div></div>
          <div class="card__body">
            ${rows.map((r) => `<div class="timeline__item" data-local-review="${esc(r.local_id)}">
              <div class="timeline__date">${esc((r.submitted_at || '').slice(0, 10))}</div>
              <div>
                总评 ${r.overall_rating}★ · ${r.would_recommend ? '愿意推荐' : '不推荐'} · ${esc(labelOf(COMPLETION_STATUS, r.completion_status))}
                ${r.learning_tags.length ? ` · ${r.learning_tags.map((t) => esc(labelOf(LEARNING_TAGS, t))).join('、')}` : ''}
                ${r.comment ? `<div class="cmp-dim">${esc(r.comment)}</div>` : ''}
                <div class="cmp-dim" style="font-size:var(--cm-fs-xs);">仅存在于本浏览器，不进入数据集。</div>
                <button type="button" class="btn btn--ghost btn--sm" data-remove-review="${esc(r.local_id)}">删除</button>
              </div>
            </div>`).join('')}
          </div>
        </div>` : '<p class="cmp-dim">还没有本地评价。</p>';

      node.querySelectorAll('[data-remove-review]').forEach((button) => {
        button.addEventListener('click', () => {
          removeLocalReview(button.dataset.removeReview);
          renderLocal();
          helpers.refreshChrome();
        });
      });
    };

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> ›
        <a href="${esc(L.resource(resource.resource_id))}">${esc(resource.title)}</a> ›
        <span>写评价</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">评价：${esc(resource.title)}</h1>
          <div class="detail-head__badges">
            ${badgeDemo(resource.data_class === 'demo')}
            <span class="badge badge--ghost">评价对象 = 学习资源（不是提供方）</span>
          </div>
        </div>
      </div>

      <div class="notice notice--demo">
        <div class="notice__title">Review Prototype · Local-only</div>
        本表单是<strong>本地原型</strong>：提交后仅保存在你的浏览器 localStorage，
        <strong>不会</strong>上传到任何服务器、<strong>不会</strong>进入数据集、<strong>不会</strong>影响其他用户看到的评分。
        当前项目没有用户账号系统与真实评价后端。
      </div>

      <form class="review-form card" data-review-form>
        <div class="card__body">
          ${DIMENSIONS.map((d) => stars(d.key, d.label)).join('')}
          <div class="review-dim">
            <span class="review-dim__label">是否愿意推荐给同学？</span>
            <label class="review-inline"><input type="radio" name="would_recommend" value="1" checked> 愿意</label>
            <label class="review-inline"><input type="radio" name="would_recommend" value="0"> 不愿意</label>
          </div>
          <div class="review-dim">
            <span class="review-dim__label">学习进度</span>
            ${Object.entries(COMPLETION_STATUS).map(([k, v], i) => `
              <label class="review-inline"><input type="radio" name="completion_status" value="${k}" ${i === 0 ? 'checked' : ''}> ${v}</label>`).join('')}
          </div>
          <div class="review-dim">
            <span class="review-dim__label">学习标签（可多选）</span>
            <div class="cluster">
              ${Object.entries(LEARNING_TAGS).map(([k, v]) => `
                <label class="review-inline"><input type="checkbox" name="learning_tags" value="${k}"> ${v}</label>`).join('')}
            </div>
          </div>
          <div class="review-dim">
            <span class="review-dim__label"><label for="review-comment">补充说明（可选）</label></span>
            <textarea class="control" id="review-comment" name="comment" rows="3" maxlength="500"
              placeholder="例如：适合什么基础的人、每周实际花了多少时间"></textarea>
          </div>
          <div class="cluster" style="margin-top:12px;">
            <button type="submit" class="btn btn--primary">保存到本浏览器</button>
            <a class="btn btn--ghost" href="${esc(L.resource(resource.resource_id))}">返回资源页</a>
          </div>
        </div>
      </form>

      <section class="detail-section" data-local-reviews></section>
    `;

    renderLocal();

    document.querySelector('[data-review-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const val = (name) => Number(new FormData(form).get(name));
      const tags = Array.from(form.querySelectorAll('input[name="learning_tags"]:checked')).map((i) => i.value);
      addLocalReview({
        resource_id: resource.resource_id,
        overall_rating: val('overall_rating'),
        content_quality: val('content_quality'),
        difficulty_match: val('difficulty_match'),
        practical_value: val('practical_value'),
        workload_accuracy: val('workload_accuracy'),
        would_recommend: new FormData(form).get('would_recommend') === '1',
        completion_status: new FormData(form).get('completion_status'),
        learning_tags: tags,
        comment: form.comment.value.trim() || null,
      });
      renderLocal();
      const ok = document.querySelector('[data-review-saved]');
      if (ok) ok.hidden = false;
    });

    mount.insertAdjacentHTML('beforeend', '<div class="notice notice--verified" data-review-saved hidden role="status">已保存到本浏览器（Local Prototype）。</div>');
  },
});
