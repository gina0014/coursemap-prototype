/* ============================================================================
   CourseMap（学途） — pages/base.js
   ----------------------------------------------------------------------------
   页面公共引导：
     · file:// 协议检测（ES Module + fetch 在 file:// 下不可用）
     · Loading / Error / Not Found 状态统一处理
     · 共享骨架（Header / Footer / Demo 提示条）挂载

   注：教育领域没有「地理位置」概念，旧版的定位参考点（ORIGIN）已在
   领域重构中删除（见 docs/migration/DishMap_to_CourseMap_Migration.md）。
   ========================================================================== */

import { loadAll, DataLoadError } from '../data-loader.js';
import { mountChrome, stateLoading, stateError } from '../components.js';
import { favoriteCount, storageAvailable } from '../storage.js';
import { isFileProtocol } from '../utils.js';
import { asset } from '../config.js';

/* ----------------------------------------------------------------------------
   file:// 提示
   -------------------------------------------------------------------------- */

export function fileProtocolNotice() {
  return `<div class="state state--error" data-coursemap-state="error">
      <div class="state__icon" aria-hidden="true">🧷</div>
      <div class="state__title">需要通过本地 HTTP 服务器打开</div>
      <div class="state__desc">
        浏览器不允许 <code>file://</code> 页面读取 JSON 数据或加载 ES Module
        （CORS / 协议限制），因此直接双击 HTML 文件无法运行原型。
      </div>
      <div class="notice" style="text-align:left;max-width:560px;margin:20px auto 0;">
        <div class="notice__title">启动方式</div>
        <div class="formula">cd coursemap-prototype<br>python -m http.server 8000<br># 然后在浏览器访问该目录下的 index.html</div>
      </div>
      <div class="state__actions">
        <a class="btn btn--primary" href="${asset('index.html')}">重新打开首页（需在本地 HTTP 服务下访问）</a>
      </div>
    </div>`;
}

/* ----------------------------------------------------------------------------
   页面引导
   -------------------------------------------------------------------------- */

/**
 * @param {object} config
 *   active  当前导航项 key（'search' | 'paths' | 'favorites' | 'advisor' | 'methodology' | 'about'）
 *   root    页面根节点（[data-page]）
 *   onReady (ctx, helpers) => void
 */
export async function initPage({ active = '', root, onReady }) {
  const mount = root || document.querySelector('[data-page]');

  if (isFileProtocol()) {
    if (mount) mount.innerHTML = fileProtocolNotice();
    return;
  }

  if (mount) mount.innerHTML = stateLoading();

  let ctx;
  try {
    ctx = await loadAll();
  } catch (error) {
    const detail = error instanceof DataLoadError
      ? `${error.message}${error.url ? ` · ${error.url}` : ''}`
      : String(error);
    if (mount) mount.innerHTML = `${stateError({
      title: '数据加载失败',
      message: '页面无法读取运行时的 JSON 数据。请确认本地服务器已启动，且 data/ 目录完整。',
      detail,
    })}`;
    document.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
    return;
  }

  ctx.favoriteCount = storageAvailable ? favoriteCount() : 0;
  ctx.storageAvailable = storageAvailable;
  mountChrome(ctx, { active });

  const helpers = {
    /** 重新渲染导航（收藏数变化后） */
    refreshChrome() {
      ctx.favoriteCount = storageAvailable ? favoriteCount() : 0;
      mountChrome(ctx, { active });
    },
  };

  try {
    await onReady(ctx, helpers);
  } catch (error) {
    if (mount) {
      mount.innerHTML = stateError({
        title: '页面渲染失败',
        message: '数据已加载，但页面渲染过程出错。',
        detail: String(error && error.stack ? error.stack : error),
      });
      document.querySelector('[data-action="retry"]')?.addEventListener('click', () => location.reload());
    }
    throw error;
  }
}

/* ----------------------------------------------------------------------------
   静态页面引导（About / 404）
   ----------------------------------------------------------------------------
   这类页面的正文是**静态 HTML**，不依赖数据即可阅读（渐进增强）。
   这里只挂载共享骨架，并在数据不可用时静默降级——静态正文仍然可读。
   -------------------------------------------------------------------------- */

export async function initChromeOnly({ active = '' } = {}) {
  try {
    const ctx = await loadAll();
    ctx.favoriteCount = storageAvailable ? favoriteCount() : 0;
    mountChrome(ctx, { active });
    return ctx;
  } catch {
    mountChrome({ stats: { hasDemo: false } }, { active });
    return null;
  }
}
