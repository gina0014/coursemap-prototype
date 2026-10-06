/* ============================================================================
   CourseMap — pages/home.js
   ----------------------------------------------------------------------------
   P-01 首页。Hero 静态可用（渐进增强）；Quick Goals 与数据统计由运行时填充。
   MoT #1：用户进入首页立即理解「按学习目标找资源」。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, badgeDataClass } from '../components.js';
import { asset } from '../config.js';

initPage({
  active: '',
  async onReady(ctx, helpers) {
    /* 表单：学习目标 / 当前基础 / 预算 / 每周时间 → search 页 */
    const form = document.querySelector('[data-home-search]');
    if (form) {
      const goalSelect = form.querySelector('[data-field="goal"]');
      for (const goal of ctx.goals) {
        const option = document.createElement('option');
        option.value = String(goal.goal_id);
        option.textContent = goal.name;
        goalSelect.append(option);
      }
      const budgetSelect = form.querySelector('[data-field="budget"]');
      for (const preset of [50, 100, 200, 500]) {
        const option = document.createElement('option');
        option.value = String(preset);
        option.textContent = `¥${preset} 以内`;
        budgetSelect.append(option);
      }
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const params = {};
        for (const input of form.querySelectorAll('[data-field]')) {
          const value = input.value;
          if (value && value !== 'all') params[input.dataset.field] = value;
        }
        location.href = L.search(params);
      });
    }

    /* Quick Goals（全部运行时生成） */
    const quick = document.querySelector('[data-quick-goals]');
    if (quick) {
      const preferred = ['Python 入门', 'Python 数据分析', '人工智能', '科研统计基础', '学术英语写作'];
      const goals = ctx.goals
        .slice()
        .sort((a, b) => {
          const ia = preferred.indexOf(a.name);
          const ib = preferred.indexOf(b.name);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.goal_id - b.goal_id;
        })
        .slice(0, 5);
      quick.innerHTML = goals.map((goal) => {
        const count = (ctx.indexes.resourcesByGoal.get(goal.goal_id) || [])
          .filter((r) => r.status === 'published').length;
        return `<a class="chip" href="${asset('pages/search.html')}?goal=${goal.goal_id}">${goal.name} <span class="cmp-dim">${count}</span></a>`;
      }).join('');
    }

    /* 热门目标卡片（每个目标一张，含资源数） */
    const goalGrid = document.querySelector('[data-goal-grid]');
    if (goalGrid) {
      goalGrid.innerHTML = ctx.goals.map((goal) => {
        const resources = (ctx.indexes.resourcesByGoal.get(goal.goal_id) || [])
          .filter((r) => r.status === 'published');
        const subject = ctx.indexes.subjectById.get(goal.subject_id);
        const pathCount = ctx.paths.filter((p) => (p.goal_ids || []).includes(goal.goal_id)).length;
        return `<a class="goal-card" href="${asset('pages/search.html')}?goal=${goal.goal_id}">
            <div class="goal-card__subject">${subject ? subject.name : ''}</div>
            <div class="goal-card__name">${goal.name}</div>
            <div class="goal-card__desc">${goal.description}</div>
            <div class="goal-card__meta"><strong class="num">${resources.length}</strong> 个资源 · ${pathCount} 条路径</div>
          </a>`;
      }).join('');
    }

    /* 数据可信度摘要（全部运行时计算） */
    const statsBox = document.querySelector('[data-home-stats]');
    if (statsBox) {
      const res = ctx.stats.totals.resources;
      statsBox.innerHTML = `
        <div class="stat-strip">
          <span class="stat"><strong class="num">${ctx.subjects.length}</strong> 学科</span>
          <span class="stat"><strong class="num">${ctx.goals.length}</strong> 学习目标</span>
          <span class="stat"><strong class="num">${res.total}</strong> 学习资源</span>
          <span class="stat"><strong class="num">${ctx.paths.length}</strong> 学习路径</span>
          <span class="stat"><strong class="num">${res.real}</strong> 条已核验真实资源 ${badgeDataClass(false, { compact: true })}</span>
          <span class="stat"><strong class="num">${res.demo}</strong> 条演示记录 ${badgeDemo(true, { compact: true })}</span>
          <span class="stat"><a href="${L.methodology()}">数据方法论 →</a></span>
        </div>`;
    }

    /* 首页正文是静态 HTML（渐进增强）；这里只清掉 loading 骨架 */
    renderInto(document.querySelector('[data-page]'), '');
  },
});
