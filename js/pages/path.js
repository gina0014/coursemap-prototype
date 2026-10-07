/* ============================================================================
   CourseMap — pages/path.js
   ----------------------------------------------------------------------------
   P-02b Learning Path Detail（V0.2 UI Upgrade）。

   主视觉 = 垂直 roadmap / timeline：目标 → 阶段 → 资源 → 阶段目标，
   每阶段可标记 Not started / In progress / Completed（仅存浏览器 localStorage）。

   诚实性硬约束（不得违反）：
     1. 阶段时长**只能**由数据中已标注的资源时长推导；数据未标注的字段一律
        不参与计算，也不以 0 计入 —— 不做任何「周数」猜测。
     2. 阶段「学习成果」直接引用路径数据 learning-path-steps.json 的
        step.description，并显式说明出处；数据集没有独立 milestone 字段，
        因此不虚构 milestone 文案。
     3. 步骤顺序、技能、资源全部来自 CourseMap Learning Graph（evidence-backed）；
        进度状态是本机学习记录，不写回数据集。
   ========================================================================== */

import { initPage } from './base.js';
import {
  renderInto, L, badgeDataClass, badgeDifficulty, feeBlock, badgeCertificate, stateNotFound,
} from '../components.js';
import { parseQuery, esc, intOrNull } from '../utils.js';
import { pathView } from '../derive.js';
import { loadPathProgress, setPathStageStatus, clearPathProgress } from '../storage.js';

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_ORDER = ['not_started', 'in_progress', 'completed'];

/** 由「已标注」的资源时长推导阶段投入；未标注的不计入、不当 0。 */
function stageEstimate(core) {
  const known = core.filter((s) => typeof s.resource.duration_hours === 'number');
  const hours = known.reduce((n, s) => n + s.resource.duration_hours, 0);
  const unknown = core.length - known.length;
  const weeklies = known
    .map((s) => s.resource.weekly_workload_hours)
    .filter((h) => typeof h === 'number' && h > 0);
  const avgWeekly = weeklies.length
    ? Math.round(weeklies.reduce((a, b) => a + b, 0) / weeklies.length)
    : null;
  const weeks = hours > 0 && avgWeekly ? Math.ceil(hours / avgWeekly) : null;
  return { hours, unknown, weeks, avgWeekly, knownCount: known.length };
}

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

    /* ---------- 路径总览：轻量 SVG 步骤链（纯静态生成，无外部依赖，可降级） ---------- */
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
        ${nodes.map(({ entry, x, y }) => `
          <g class="path-node" data-step="${entry.step.step_order}">
            <rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10"
              fill="var(--cm-surface)" stroke="var(--cm-primary-border)"></rect>
            <text x="${x + 10}" y="${y + 21}" class="path-node__order">第 ${entry.step.step_order} 步</text>
            <text x="${x + 10}" y="${y + 41}" class="path-node__title">${esc(entry.step.title.length > 12 ? `${entry.step.title.slice(0, 12)}…` : entry.step.title)}</text>
          </g>`).join('\n')}
      </svg>`;

    /* ---------- 顶部统计（全部为可核验计数 + 显式口径的推导值） ---------- */
    const totals = steps.reduce((acc, entry) => {
      const est = stageEstimate(entry.core);
      acc.core += entry.core.length;
      acc.optional += entry.optional.length;
      acc.hours += est.hours;
      acc.unknown += est.unknown;
      acc.hoursKnown += est.knownCount;
      return acc;
    }, { core: 0, optional: 0, hours: 0, unknown: 0, hoursKnown: 0 });

    const summaryHtml = `<div class="path-summary" data-coursemap-path-stats>
      <div class="cmp-stat">
        <div class="cmp-stat__label">Stage / 阶段</div>
        <div class="cmp-stat__value num">${steps.length}</div>
      </div>
      <div class="cmp-stat">
        <div class="cmp-stat__label">核心资源</div>
        <div class="cmp-stat__value num">${totals.core}</div>
      </div>
      <div class="cmp-stat">
        <div class="cmp-stat__label">可选资源</div>
        <div class="cmp-stat__value num">${totals.optional}</div>
      </div>
      <div class="cmp-stat">
        <div class="cmp-stat__label">核心资源时长合计</div>
        <div class="cmp-stat__value num">${totals.hours > 0 ? `≈ ${totals.hours} 小时` : '—'}</div>
      </div>
    </div>
    <p class="cmp-dim" style="font-size:var(--cm-fs-sm);">
      计数与时长来自路径数据本身：<strong>核心资源时长合计</strong>只累加数据中已标注
      <code>duration_hours</code> 的资源${totals.unknown > 0 ? `（本路径有 ${totals.unknown} 条核心资源未标注时长，未计入，也不按 0 处理）` : '（本路径核心资源均已标注时长）'}。
      数据集没有「计划周数」字段，因此本页不给出承诺式周数；阶段处的「≈ N 周」仅在资源同时标注了时长与每周投入时按 <code>时长 ÷ 每周投入</code> 向上取整估算，并明确标注为估算值。
    </p>`;

    /* ---------- 垂直 roadmap：阶段 → 资源 → 阶段目标 ---------- */
    function pathResourceCard(s, isCore) {
      return `<div class="path-resource" data-coursemap-path-resource="${s.resource.resource_id}">
        <div class="path-resource__title">
          <a href="${esc(L.resource(s.resource.resource_id))}">${esc(s.resource.title)}</a>
          ${badgeDataClass(s.isDemo, { compact: true })}
          ${isCore ? '<span class="badge badge--primary">核心</span>' : '<span class="badge badge--ghost">可选</span>'}
        </div>
        <div class="cluster" style="margin:4px 0;">
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

    const stagesHtml = steps.map((entry) => {
      const { step, skill, goal, core, optional } = entry;
      const est = stageEstimate(core);
      const timeLabel = est.weeks !== null
        ? `≈ ${est.weeks} 周（估算：${est.hours} 小时 ÷ 每周 ${est.avgWeekly} 小时）`
        : (est.hours > 0
          ? `${est.hours} 小时（资源未标注每周投入，不给周数估算）`
          : '时长 —（资源未标注时长）');

      return `<section class="roadmap-stage" data-coursemap-path-step="${step.step_order}"
          data-stage="${step.step_order}" data-stage-status="not_started"
          aria-labelledby="stage-${step.step_order}-title">
        <div class="roadmap-stage__head">
          <div>
            <div class="roadmap-stage__row-label">Stage ${step.step_order}</div>
            <h3 class="roadmap-stage__title" id="stage-${step.step_order}-title">${esc(step.title)}</h3>
          </div>
          <div class="cluster">
            ${skill ? `<span class="tag">技能：${esc(skill.name)}</span>` : ''}
            ${goal ? `<a class="tag tag--link" href="${esc(L.search({ goal: goal.goal_id }))}">目标：${esc(goal.name)}</a>` : ''}
            <span class="roadmap-stage__weeks">${esc(timeLabel)}</span>
          </div>
        </div>

        <div class="roadmap-stage__body">
          <div class="roadmap-stage__row">
            <span class="roadmap-stage__row-label">阶段目标（来自路径数据 step.description）</span>
            <p class="cmp-dim">${esc(step.description)}</p>
          </div>

          <div class="roadmap-stage__row">
            <span class="roadmap-stage__row-label">核心资源（${core.length}）</span>
            <div class="grid grid--cards">${core.map((s) => pathResourceCard(s, true)).join('')}</div>
          </div>

          ${optional.length ? `<details class="disclosure">
            <summary>可选资源（${optional.length}）</summary>
            <div class="grid grid--cards" style="margin-top:8px;">${optional.map((s) => pathResourceCard(s, false)).join('')}</div>
          </details>` : ''}

          <div class="roadmap-stage__row">
            <span class="roadmap-stage__row-label">我的进度</span>
            <div class="stage-status" role="group" aria-label="第 ${step.step_order} 阶段学习状态"
                 data-stage-status-group>
              ${STATUS_ORDER.map((key) => `<button type="button" class="status-pill"
                  data-stage-status-btn="${key}" aria-pressed="${key === 'not_started' ? 'true' : 'false'}">${STATUS_LABEL[key]}</button>`).join('')}
            </div>
          </div>
        </div>
      </section>`;
    }).join('');

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> ›
        <a href="${esc(L.paths())}">学习路径</a> ›
        <span>${esc(path.name)}</span>
      </nav>

      <div class="detail-head">
        <div>
          <div class="roadmap-stage__row-label">Learning path</div>
          <h1 class="detail-head__title">${esc(path.name)}</h1>
          <div class="detail-head__badges">
            ${badgeDataClass(path.data_class === 'demo')}
            <span class="badge badge--ghost">${steps.length} 个阶段</span>
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
        ${summaryHtml}
        ${svg}
        <p class="cmp-dim" style="margin-top:8px;">图示为步骤顺序概览；完整的资源、费用与评价信息见下方路线（无 SVG 时同样完整可读）。</p>
      </section>

      <section class="detail-section">
        <h2 class="section-title">学习路线</h2>
        <div class="roadmap" data-coursemap-roadmap>${stagesHtml}</div>

        <div class="path-progress-bar">
          <div>
            <span class="roadmap-stage__row-label">本机学习进度</span>
            <p class="cmp-dim" style="margin:0;">进度只保存在这台设备的 localStorage（<code>coursemap.pathProgress.v1</code>），
              不进入数据集、不影响其它用户看到的任何内容，也没有账号云同步。</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-path-progress-reset>清除本路径进度</button>
        </div>
      </section>
    `;

    /* ---------- 进度交互（仅本机 localStorage） ---------- */
    const sections = Array.from(mount.querySelectorAll('[data-coursemap-path-step]'));

    function applyStatus(section, status) {
      const safe = STATUS_ORDER.includes(status) ? status : 'not_started';
      section.dataset.stageStatus = safe;
      section.classList.toggle('roadmap-stage--done', safe === 'completed');
      section.classList.toggle('roadmap-stage--current', safe === 'in_progress');
      section.querySelectorAll('[data-stage-status-btn]').forEach((btn) => {
        const on = btn.dataset.stageStatusBtn === safe;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-active', on);
      });
    }

    const saved = loadPathProgress(path.path_id);
    sections.forEach((section) => {
      applyStatus(section, saved[section.dataset.coursemapPathStep] || 'not_started');
      section.querySelectorAll('[data-stage-status-btn]').forEach((btn) => {
        btn.addEventListener('click', () => {
          applyStatus(section, btn.dataset.stageStatusBtn);
          setPathStageStatus(path.path_id, section.dataset.coursemapPathStep, btn.dataset.stageStatusBtn);
        });
      });
    });

    const resetBtn = mount.querySelector('[data-path-progress-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        clearPathProgress(path.path_id);
        sections.forEach((section) => applyStatus(section, 'not_started'));
      });
    }
  },
});
