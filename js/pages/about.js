/* ============================================================================
   CourseMap — pages/about.js（静态正文 + 共享骨架，渐进增强）
   ============================================================================ */

import { initChromeOnly } from './base.js';
import { L } from '../components.js';
import { APP } from '../config.js';
import { esc } from '../utils.js';

const HTML = `
  <nav class="breadcrumb" aria-label="面包屑">
    <a href="${esc(L.home())}">首页</a> › <span>关于</span>
  </nav>

  <div class="detail-head">
    <div>
      <h1 class="detail-head__title">关于 ${esc(APP.name)}（${esc(APP.nameZh)}）</h1>
      <div class="detail-head__badges">
        <span class="badge badge--demo">Educational domain prototype</span>
        <span class="footer__version">${esc(APP.version)}</span>
      </div>
    </div>
  </div>

  <p class="detail-lead">
    ${esc(APP.name)} 是一个<strong>学习目标驱动</strong>的课程与学习资源智能决策平台原型：
    按学习目标找资源，而不是先找平台再翻课程。
  </p>

  <section class="detail-section">
    <h2 class="section-title">它是什么 / 不是什么</h2>
    <div class="ai-grid">
      <div>
        <h3 class="sub-title">CourseMap 是</h3>
        <ul class="outcome-list">
          <li>Learning Resource Discovery（按目标发现资源）</li>
          <li>Cross-platform Comparison（跨提供方比较）</li>
          <li>Learning Path（先学什么后学什么）</li>
          <li>Decision Support（可解释的决策支持）</li>
          <li>Future AI Learning Advisor 的架构基座</li>
        </ul>
      </div>
      <div>
        <h3 class="sub-title">CourseMap 不是</h3>
        <ul class="outcome-list">
          <li>课程内容生产网站</li>
          <li>普通课程目录或 MOOC 导航站</li>
          <li>课程广告集合</li>
          <li>单纯的 AI Chatbot</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="detail-section" id="validation">
    <h2 class="section-title">我们验证什么</h2>
    <ul class="outcome-list">
      <li>每条核心事实的来源（Source）、观测日期（observed_at）与核验状态。</li>
      <li>评分只来自该资源自身的学习者评价，并永远展示样本量。</li>
      <li>费用永远带观测日期；未知费用显示为 —，绝不伪装成 0 或「免费」。</li>
      <li>数据治理状态（draft / pending / published）决定可见性。</li>
    </ul>
  </section>

  <section class="detail-section" id="prototype">
    <h2 class="section-title">原型声明（Prototype Disclosure）</h2>
    <ul class="outcome-list">
      <li>当前数据集 <strong>100% 为演示数据（DEMO）</strong>：提供方为虚构实体，不代表任何真实机构；不伪造真实课程事实、评价或合作关系。</li>
      <li>AI 学习顾问为<strong>规则原型（Not LLM-powered）</strong>，已预留 LLM Adapter 接口。</li>
      <li>评价与收藏为 Local Prototype，无账号、无云同步、无支付。</li>
      <li>任何未实现的能力都明确标记 Prototype / Reserved / Future，不假装完成。</li>
    </ul>
  </section>

  <section class="detail-section">
    <h2 class="section-title">项目脉络</h2>
    <p>
      ${esc(APP.name)} 由美食决策原型 DishMap（按菜找店）经过完整领域重构而来：
      领域模型、数据模型、页面、交互与测试全部按教育领域重新设计。
      迁移决策记录在仓库的 docs/migration/DishMap_to_CourseMap_Migration.md。
      它与「全球图书馆知识与信息服务平台」相互独立，后者未被本项目修改。
    </p>
  </section>
`;

initChromeOnly({ active: 'about' }).then(() => {
  const mount = document.querySelector('[data-page]');
  if (mount) mount.innerHTML = HTML;
});
