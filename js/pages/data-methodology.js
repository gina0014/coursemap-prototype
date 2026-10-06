/* ============================================================================
   CourseMap — pages/data-methodology.js
   ----------------------------------------------------------------------------
   P-10 数据方法论。所有公式 / 阈值 / 数据集统计**运行时**从 config 与
   data-loader 读取，页面不硬编码任何数字。
   ========================================================================== */

import { initPage } from './base.js';
import { renderInto, L, badgeDemo, pageDataBadges, sourceList } from '../components.js';
import { esc, dateOnly } from '../utils.js';
import { THRESHOLDS, SEARCH, FIT_SCORE, AI } from '../config.js';
import { labelOf, SOURCE_TYPE, USAGE_PERMISSION } from '../labels.js';

initPage({
  active: 'methodology',
  async onReady(ctx) {
    const mount = document.querySelector('[data-page]');
    const stats = ctx.stats;

    const entityRows = Object.entries(stats.perEntity).map(([key, entry]) => `
      <tr>
        <th scope="row">${esc(entityLabel(key))}</th>
        <td class="num">${entry.total}</td>
        <td class="num">${entry.demo}</td>
        <td class="num">${entry.real}</td>
      </tr>`).join('');

    const sourceTypeRows = Object.entries(stats.sourceType)
      .map(([k, v]) => `<li>${esc(labelOf(SOURCE_TYPE, k))}：<strong class="num">${v}</strong> 个来源</li>`).join('');
    const permissionRows = Object.entries(stats.usagePermission)
      .map(([k, v]) => `<li>${esc(labelOf(USAGE_PERMISSION, k))}：<strong class="num">${v}</strong> 个来源</li>`).join('');

    mount.innerHTML = `
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="${esc(L.home())}">首页</a> › <span>数据方法论</span>
      </nav>

      <div class="detail-head">
        <div>
          <h1 class="detail-head__title">数据方法论</h1>
          <div class="detail-head__badges">${pageDataBadges(ctx)}</div>
        </div>
      </div>

      <p class="detail-lead">
        CourseMap 的每一类决策信息都必须能回答三个问题：数据从哪来、什么时候观测、是否核验。
        本页展示的阈值与统计全部由运行时从代码配置与数据文件计算得出。
      </p>

      <section class="detail-section" id="rules">
        <h2 class="section-title">发布与可见性规则</h2>
        <ul class="outcome-list">
          <li>内容治理状态：draft → pending → published。前端<strong>只展示 published</strong> 记录。</li>
          <li>级联可见：资源可见要求其提供方、学科、至少一个学习目标均可见。</li>
          <li>评分只由该资源自己的已发布评价聚合；<strong>绝不使用提供方评分代替</strong>。</li>
          <li>费用取最新观测；费用未知显示 —，<strong>不显示 0</strong>。</li>
          <li>评价样本 &lt; ${THRESHOLDS.ratingMinSample} 条 → 显示「Limited data」，不参与「高分筛选」。</li>
          <li>demo 记录必须在 UI 上带不可隐藏的 DEMO 徽标。</li>
        </ul>
      </section>

      <section class="detail-section" id="thresholds">
        <h2 class="section-title">阈值（来自 config.js，唯一定义处）</h2>
        <ul class="kv-list">
          <li><span>评分最小样本</span><strong>${THRESHOLDS.ratingMinSample}</strong></li>
          <li><span>费用复检触发器</span><strong>${THRESHOLDS.feeRecheckDays} 天</strong>（内部核验触发器，<strong>不是</strong>「费用有效期」）</li>
          <li><span>检索分页大小</span><strong>${SEARCH.pageSize}</strong></li>
          <li><span>预算快捷档</span><strong>${SEARCH.budgetPresets.map((p) => `¥${p}`).join(' / ')}</strong></li>
        </ul>
        <p class="cmp-dim">合成总分：${esc(FIT_SCORE.enabled ? '已启用（实验性）' : 'v0.1 未启用')}。${esc(FIT_SCORE.disclaimer)}</p>
      </section>

      <section class="detail-section" id="dataset">
        <h2 class="section-title">当前数据集（运行时统计）</h2>
        <div class="cmp-scroll">
          <table class="cmp-table">
            <caption class="sr-only">数据集实体统计</caption>
            <thead><tr><th scope="col">实体</th><th scope="col">可见记录</th><th scope="col">demo</th><th scope="col">real</th></tr></thead>
            <tbody>${entityRows}</tbody>
          </table>
        </div>
        <p class="cmp-dim">可见记录合计 ${stats.totals.records} 条；demo ${stats.totals.demo} 条；real ${stats.totals.real} 条。</p>
      </section>

      <section class="detail-section" id="sources">
        <h2 class="section-title">允许与禁止的数据来源</h2>
        <div class="ai-grid">
          <div>
            <h3 class="sub-title">允许（优先级从高到低）</h3>
            <ul class="outcome-list">
              <li>官方提供方页面 / 大学官方课程页</li>
              <li>政府与开放教育项目</li>
              <li>明确授权的 API</li>
              <li>编辑自建演示数据（必须整体标记 demo）</li>
            </ul>
          </div>
          <div>
            <h3 class="sub-title">禁止</h3>
            <ul class="outcome-list">
              <li>批量抓取受限制商业平台的课程、评价或内容</li>
              <li>猜测价格、评分、证书或课程时长（未知一律 null）</li>
              <li>把演示数据伪装成真实课程事实</li>
            </ul>
          </div>
        </div>
        <div class="detail-section" style="margin-top:12px;">
          <h3 class="sub-title">当前来源构成（运行时统计）</h3>
          <ul class="parse-notes">${sourceTypeRows || '<li>无</li>'}</ul>
          <ul class="parse-notes">${permissionRows}</ul>
        </div>
        ${sourceList(ctx.sources.filter((s) => s.status === 'published').map((source) => ({ source, relation: null, note: null })))}
      </section>

      <section class="detail-section" id="ai">
        <h2 class="section-title">AI 顾问的数据边界</h2>
        <ul class="outcome-list">
          <li>当前引擎：${esc(AI.mode === 'rule_based_prototype' ? '规则原型（非 LLM）' : AI.mode)}。</li>
          <li>推荐只来自 CourseMap 结构化数据（Evidence Layer），AI/LLM 在架构中只是交互与推理层。</li>
          <li>所有推荐必须带来源引用与不确定性说明；无来源推荐被禁止。</li>
        </ul>
      </section>

      <section class="detail-section" id="limits">
        <h2 class="section-title">已知限制</h2>
        <ul class="outcome-list">
          <li>当前数据集 100% 为演示数据（DEMO），不包含任何真实课程事实。</li>
          <li>没有用户系统：评价与收藏都是 Local Prototype。</li>
          <li>规则式检索没有语义理解；同义词只在学习目标 aliases 中显式维护。</li>
          <li>费用观测未经过人工核验（全部 unverified）。</li>
        </ul>
      </section>
    `;
  },
});

function entityLabel(key) {
  const map = {
    subjects: '学科 Subject',
    goals: '学习目标 Learning Goal',
    skills: '技能 Skill',
    providers: '提供方 Provider',
    resources: '学习资源 Learning Resource',
    paths: '学习路径 Learning Path',
    pathSteps: '路径步骤 Path Step',
    reviews: '学习评价 Review',
    feeHistory: '费用观测 Fee History',
    sources: '来源 Source',
  };
  return map[key] || key;
}
