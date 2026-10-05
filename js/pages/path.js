/* ============================================================================
   CourseMap — pages/path.js
   ----------------------------------------------------------------------------
   P-02b Learning Path Detail。轻量 SVG 步骤链可视化（无第三方依赖、可降级：
   SVG 失败时下方文字步骤列表仍然完整可读）。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, badgeDifficulty, feeBlock, badgeCertificate, stateNotFound } from '../components.js';
import { parseQuery, esc, intOrNull } from '../utils.js';
import { pathView } from '../derive.js';

initPage({
  active: 'paths',
  async onReady(ctx) {
    const params = parseQuery();
    const id = intOrNull(params.id);
    const view = id !== null ? pathView(ctx, id) : null;
    const mount = document.querySelector('[data-page]');

    if (!view) {
      renderInto(mount, stateNotFound({ title: '没有找到这条学习路径' }));
      return;
    }
    const { path, goals, steps } = view;

    /* ---------- 轻量 SVG 步骤链（纯静态生成，无外部依赖） ---------- */
    const NODE_W = 168;
    const NODE_H = 54;
    const GAP_X = 40;
    const ROWS = Math.min(3, steps.length);
    const perRow = Math.ceil(steps.length / ROWS);
    const width = Math.min(perRow, steps.length) * (NODE_W + GAP_X) - GAP_X + 32;
    const height = ROWS * (NODE_H + 46) + 16;

    const nodes = steps.map((entry, i) => {
      const row = Math.floor(i / perRow);
      const colInRow = i % perRow;
      const inRow = Math.min(perRow, steps.length - row * perRow);
      const x = 16 + (width - 32 - inRow * NODE_W - (inRow - 1) * GAP_X) / 2 + colInRow * (NODE_W + GAP_X);
      const y = 16 + row * (NODE_H + 46);
      return { entry, x, y };
    });

    const edges = [];
    for (let i = 1; i < nodes.length; i += 1) {
      const a = nodes[i - 1];
      const b = nodes[i];
      const sameRow = a.y === b.y;
      if (sameRow) {
        edges.push(`<line x1="${a.x + NODE_W}" y1="${a.y + NODE_H / 2}" x2="${b.x}" y2="${b.y + NODE_H / 2}"
          stroke="var(--cm-border-strong)" stroke-width="2" marker-end="url(#cm-arrow)"/>`);
      } else {
        const bendY = a.y + NODE_H + 23;
        edges.push(`<path d="M ${a.x + NODE_W / 2} ${a.y + NODE_H} L ${a.x + NODE_W / 2} ${bendY} L ${b.x + NODE_W / 2} ${bendY} L ${b.x + NODE_W / 2} ${b.y}"
          fill="none" stroke="var(--cm-border-strong)" stroke-width="2" marker-end="url(#cm-arrow)"/>`);
      }
    }

    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="学习路径步骤图：${esc(path.name)}"
        class="path-svg" data-coursemap-path-svg>
        <defs>
          <marker id="cm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cm-border-strong)"></path>
          </marker>
        </defs>
        ${edges.join('\n')}
        ${nodes.map(({ entry, x, y }, i) => `
          <g class="path-node" data-step="${entry.step.step_order}">
            <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10"
              fill="var(--cm-surface)" stroke="var(--cm-primary-border)"></rect>
            <text x="${x + 10}" y="${y + 21}" class="path-node__order">第 ${entry.step.step_order} 步</text>
            <text x="${x + 10}" y="${y + 41}" class="path-node__title">${esc(entry.step.title.length > 12 ? `${entry.step.title.slice(0, 12)}…` : entry.step.title)}</text>
          </g>`).join('\n')}
      </svg>`;

    /* ---------- 文字步骤列表（可降级的完整信息层） ---------- */
    const stepsHtml = steps.map((entry) => {
      const { step, skill, goal, core, optional } = entry;
      return `<section class="path-step" data-coursemap-path-step="${step.step_order}">
        <div class="path-step__head">
          <span class="path-step__order">第 ${step.step_order} 步</span>
          <h3 class="path-step__title">${esc(step.title)}</h3>
          ${skill ? `<span class="tag">技能：${esc(skill.name)}</span>` : ''}
          ${goal ? `<a class="tag tag--link" href="${esc(L.search({ goal: goal.goal_id }))}">目标：${esc(goal.name)}</a>` : ''}
        </div>
        <p class="cmp-dim">${esc(step.description)}</p>
        <div class="grid grid--cards" style="margin-top:12px;">
          ${core.map((s) => pathResourceCard(s, true)).join('')}
        </div>
        ${optional.length ? `<details class="disclosure" style="margin-top:8px;">
          <summary>可选资源（${optional.length}）</summary>
          <div class="grid grid--cards" style="margin-top:8px;">${optional.map((s) => pathResourceCard(s, false)).join('')}</div>
        </details>` : ''}
      </section>`;
    }).join('');

    function pathResourceCard(s, isCore) {
      return `<div class="path-resource" data-coursemap-path-resource="${s.resource.resource_id}">
        <div class="path-resource__title">
          <a href="${esc(L.resource(s.resource.resource_id))}">${esc(s.resource.title)}</a>
          ${badgeDemo(s.isDemo, { compact: true })}
          ${isCore ? '<span class="badge badge--primary">核心</span>' : '<span class="badge badge--ghost">可选</span>'}
        </div>
        <div class="cluster" style="margin:6px 0;">
          ${badgeDifficulty(s.resource.difficulty)}
          ${badgeCertificate(s.resource.certificate_available)}
        </div>
        <div class="path-resource__meta">
          ${feeBlock(s.fee)}
          <span class="cmp-dim">${typeof s.resource.duration_hours === 'number' ? `${s.resource.duration_hours} 小时` : '时长 —'}
            · ${typeof s.resource.weekly_workload_hours === 'number' ? `每周 ${s.resource.weekly_workload_hours} 小时` : '周投入 —'}
            · ${s.rating.count > 0 ? `★ ${s.rating.overall.toFixed(1)}（${s.rating.count} 条）` : '暂无评价'}</span>
        </div>
      </div>`;
    }

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> ›
        <a href="${esc(L.paths())}">学习路径</a> ›
        <span>${esc(path.name)}</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">${esc(path.name)}</h1>
          <div class="detail-head__badges">
            ${badgeDemo(path.data_class === 'demo')}
            <span class="badge badge--ghost">${steps.length} 步</span>
            <span class="badge badge--ghost">适合：${esc(path.target_audience)}</span>
          </div>
        </div>
        <div class="cluster">
          <a class="btn btn--ghost btn--sm" href="${esc(L.search({ goal: goals[0] ? goals[0].goal_id : 'all' }))}">浏览路径起点资源</a>
        </div>
      </div>

      <p class="detail-lead">${esc(path.description)}</p>
      <div class="cluster">${goals.map((g) => `<span class="tag">${esc(g.name)}</span>`).join('')}</div>

      <section class="detail-section">
        <h2 class="section-title">路径总览</h2>
        ${svg}
        <p class="cmp-dim" style="margin-top:8px;">图示为步骤顺序概览；完整的资源、费用与评价信息见下方文字步骤（无 SVG 时同样完整可读）。</p>
      </section>

      ${stepsHtml}
    `;
  },
});
