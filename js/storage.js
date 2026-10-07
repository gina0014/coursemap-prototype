/* ============================================================================
   CourseMap（学途） — storage.js
   ----------------------------------------------------------------------------
   本地状态（localStorage）封装：学习收藏（资源/目标）/ 本地学习评价 / 界面偏好。

   诚实性硬约束（docs/product/04_Information_Architecture.md）：
   本地评价**仅**保存在浏览器中（Local Prototype），
   **不进入**数据集，**不影响**其它用户看到的评分，**没有**账号云同步。
   本地评价与全局评分聚合在代码层面就是两条完全分开的路径。
   ========================================================================== */

import { STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from './config.js';

function available() {
  try {
    const probe = '__coursemap_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const CAN_USE_STORAGE = typeof window !== 'undefined' && available();

function read(key, fallback) {
  if (!CAN_USE_STORAGE) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function write(key, payload) {
  if (!CAN_USE_STORAGE) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION, ...payload }));
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = CAN_USE_STORAGE;

/* ----------------------------------------------------------------------------
   学习收藏（Learning Wishlist）—— 收藏对象 = Learning Resource
   -------------------------------------------------------------------------- */

const FAVORITES_EMPTY = { items: [] };

export function loadFavorites() {
  const data = read(STORAGE_KEYS.favorites, FAVORITES_EMPTY);
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .filter((item) => item && typeof item.resource_id === 'number')
    .map((item) => ({
      resource_id: item.resource_id,
      saved_at: item.saved_at || null,
    }));
}

export function isFavorite(resourceId) {
  return loadFavorites().some((item) => item.resource_id === Number(resourceId));
}

export function addFavorite(resourceId) {
  const items = loadFavorites();
  const id = Number(resourceId);
  if (!items.some((item) => item.resource_id === id)) {
    items.push({ resource_id: id, saved_at: new Date().toISOString() });
    write(STORAGE_KEYS.favorites, { items });
  }
  return loadFavorites();
}

export function removeFavorite(resourceId) {
  const id = Number(resourceId);
  const items = loadFavorites().filter((item) => item.resource_id !== id);
  write(STORAGE_KEYS.favorites, { items });
  return loadFavorites();
}

export function toggleFavorite(resourceId) {
  return isFavorite(resourceId) ? removeFavorite(resourceId) : addFavorite(resourceId);
}

export function favoriteCount() {
  return loadFavorites().length;
}

/* ----------------------------------------------------------------------------
   收藏学习目标（可选的第二收藏维度）
   -------------------------------------------------------------------------- */

export function loadSavedGoals() {
  const data = read(STORAGE_KEYS.savedGoals, { items: [] });
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .filter((item) => typeof item.goal_id === 'number')
    .map((item) => ({ goal_id: item.goal_id, saved_at: item.saved_at || null }));
}

export function toggleSavedGoal(goalId) {
  const id = Number(goalId);
  const items = loadSavedGoals();
  const next = items.some((item) => item.goal_id === id)
    ? items.filter((item) => item.goal_id !== id)
    : [...items, { goal_id: id, saved_at: new Date().toISOString() }];
  write(STORAGE_KEYS.savedGoals, { items: next });
  return next;
}

/* ----------------------------------------------------------------------------
   本地学习评价（结构化；与全局评分严格分离）
   -------------------------------------------------------------------------- */

export function loadLocalReviews(resourceId = null) {
  const data = read(STORAGE_KEYS.localReviews, { items: [] });
  const items = Array.isArray(data.items) ? data.items : [];
  const normalized = items
    .filter((item) => item && typeof item.resource_id === 'number')
    .map((item) => ({
      local_id: item.local_id || null,
      resource_id: item.resource_id,
      overall_rating: item.overall_rating,
      content_quality: item.content_quality,
      difficulty_match: item.difficulty_match,
      practical_value: item.practical_value,
      workload_accuracy: item.workload_accuracy,
      would_recommend: item.would_recommend === true,
      completion_status: item.completion_status || null,
      learning_tags: Array.isArray(item.learning_tags) ? item.learning_tags : [],
      comment: item.comment || null,
      submitted_at: item.submitted_at || null,
      review_origin: 'local_prototype',
      /** 明确标记：这条评价**没有**进入数据集、不影响全局评分 */
      included_in_dataset: false,
    }));
  if (resourceId === null) return normalized;
  return normalized.filter((item) => item.resource_id === Number(resourceId));
}

export function addLocalReview(review) {
  const data = read(STORAGE_KEYS.localReviews, { items: [] });
  const items = Array.isArray(data.items) ? data.items : [];
  const clamp = (v) => Math.max(1, Math.min(5, Math.round(Number(v) || 0)));
  const entry = {
    local_id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    resource_id: Number(review.resource_id),
    overall_rating: clamp(review.overall_rating),
    content_quality: clamp(review.content_quality),
    difficulty_match: clamp(review.difficulty_match),
    practical_value: clamp(review.practical_value),
    workload_accuracy: clamp(review.workload_accuracy),
    would_recommend: review.would_recommend === true,
    completion_status: review.completion_status || null,
    learning_tags: Array.isArray(review.learning_tags) ? review.learning_tags.slice(0, 5) : [],
    comment: review.comment ? String(review.comment).slice(0, 500) : null,
    submitted_at: new Date().toISOString(),
  };
  items.push(entry);
  const ok = write(STORAGE_KEYS.localReviews, { items });
  return { ok, entry };
}

export function removeLocalReview(localId) {
  const data = read(STORAGE_KEYS.localReviews, { items: [] });
  const items = (Array.isArray(data.items) ? data.items : []).filter((item) => item.local_id !== localId);
  write(STORAGE_KEYS.localReviews, { items });
  return loadLocalReviews();
}

/* ----------------------------------------------------------------------------
   界面偏好
   -------------------------------------------------------------------------- */

export function loadPrefs() {
  return read(STORAGE_KEYS.prefs, { view: null });
}

export function savePrefs(patch) {
  const current = loadPrefs();
  return write(STORAGE_KEYS.prefs, { ...current, ...patch });
}

/* ----------------------------------------------------------------------------
   学习路径阶段进度（Local Prototype）
   ----------------------------------------------------------------------------
   与「本地学习评价」同一诚实性口径：进度**只**保存在浏览器中，
   不进入数据集、不影响其它用户看到的任何内容、没有账号云同步。
   值域固定为 not_started / in_progress / completed。
   -------------------------------------------------------------------------- */

export const PATH_STAGE_STATUSES = ['not_started', 'in_progress', 'completed'];

function normalizeStatus(value) {
  return PATH_STAGE_STATUSES.includes(value) ? value : 'not_started';
}

export function loadPathProgress(pathId = null) {
  const data = read(STORAGE_KEYS.pathProgress, { paths: {} });
  const paths = data.paths && typeof data.paths === 'object' ? data.paths : {};
  if (pathId === null) return paths;
  const entry = paths[String(Number(pathId))];
  const stages = entry && typeof entry === 'object' ? entry : {};
  const out = {};
  Object.keys(stages).forEach((k) => { out[k] = normalizeStatus(stages[k]); });
  return out;
}

export function setPathStageStatus(pathId, stepOrder, status) {
  const paths = loadPathProgress();
  const key = String(Number(pathId));
  const current = paths[key] && typeof paths[key] === 'object' ? paths[key] : {};
  const next = { ...current, [String(Number(stepOrder))]: normalizeStatus(status) };
  paths[key] = next;
  write(STORAGE_KEYS.pathProgress, { paths });
  return next;
}

export function clearPathProgress(pathId) {
  const paths = loadPathProgress();
  delete paths[String(Number(pathId))];
  write(STORAGE_KEYS.pathProgress, { paths });
  return {};
}
