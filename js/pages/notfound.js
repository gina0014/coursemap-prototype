/* ============================================================================
   CourseMap — pages/notfound.js（静态 404 正文 + 共享骨架）
   ============================================================================ */

import { initChromeOnly } from './base.js';
import { L } from '../components.js';
import { esc } from '../utils.js';

const HTML = `
  <div class="state state--notfound" data-coursemap-state="notfound">
    <div class="state__icon" aria-hidden="true">🧭</div>
    <div class="state__title">404 · 页面不存在</div>
    <div class="state__desc">
      你要找的页面不存在，或者已经移动。
      可以回到首页按学习目标重新出发，或者浏览全部学习资源。
    </div>
    <div class="state__actions">
      <a class="btn btn--primary" href="${esc(L.home())}">回到首页</a>
      <a class="btn btn--ghost" href="${esc(L.search({}))}">浏览全部资源</a>
      <a class="btn btn--ghost" href="${esc(L.paths())}">看学习路径</a>
    </div>
  </div>
`;

initChromeOnly({ active: '' }).then(() => {
  const mount = document.querySelector('[data-page]') || document.body;
  if (document.querySelector('[data-page]')) {
    document.querySelector('[data-page]').innerHTML = HTML;
  }
});
