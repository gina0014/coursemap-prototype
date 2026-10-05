/* ============================================================================
   CourseMap（学途） — data-loader.js
   ----------------------------------------------------------------------------
   **唯一数据访问点。整个项目中只有本文件允许 fetch 数据文件。**
   页面控制器与组件不得各自 fetch。

   职责：
     1. 读取 11 个运行时 JSON
     2. 应用可见性规则：只暴露 status === 'published' 且其必需父记录
        也 published 的记录（这条规则只在这里实现一次）
     3. 建立索引，避免页面做 O(n²) 扫描
     4. 失败时抛 DataLoadError，**不静默降级**

   未来后端接入：本文件即 Repository 边界。把 fetchJson 换成
   REST/GraphQL Adapter 即可，页面代码不需要改动（docs/product/10）。
   ========================================================================== */

import { DATA_FILES, VISIBLE_STATUS, asset } from './config.js';

export class DataLoadError extends Error {
  constructor(reason, detail = {}) {
    super(`CourseMap 数据加载失败：${reason}`);
    this.name = 'DataLoadError';
    this.reason = reason;
    Object.assign(this, detail);
  }
}

const FILE_ORDER = Object.values(DATA_FILES);

let cache = null;
let inFlight = null;

/** 读取单个 JSON（顶层必须是数组，与 VR-C 系列规则一致） */
async function fetchJson(filename) {
  const href = asset(`data/${filename}`);
  let response;
  try {
    response = await fetch(href, { cache: 'no-cache' });
  } catch (error) {
    throw new DataLoadError(`无法请求 ${filename}`, { url: href, detail: String(error) });
  }
  if (!response.ok) {
    throw new DataLoadError(`${filename} 返回 HTTP ${response.status}`, { url: href, status: response.status });
  }
  let parsed;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new DataLoadError(`${filename} 不是合法 JSON`, { url: href, detail: String(error) });
  }
  if (!Array.isArray(parsed)) {
    throw new DataLoadError(`${filename} 顶层不是数组`, { url: href });
  }
  return parsed;
}

/* ----------------------------------------------------------------------------
   索引
   -------------------------------------------------------------------------- */

function indexBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) map.set(keyFn(row), row);
  return map;
}

function indexMulti(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/* 多值键展开索引：keyFn 返回字符串数组，每个键都指向该行（用于 learning_goal_ids / skill_ids 等） */
function indexByMultiId(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const keys = keyFn(row) || [];
    for (const key of keys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

/* ----------------------------------------------------------------------------
   可见性（唯一实现处）
   -------------------------------------------------------------------------- */

function applyVisibility(raw) {
  const published = (rows) => rows.filter((row) => row.status === VISIBLE_STATUS);

  const subjects = published(raw.subjects);
  const subjectIds = new Set(subjects.map((row) => row.subject_id));

  const providers = published(raw.providers);
  const providerIds = new Set(providers.map((row) => row.provider_id));

  const goals = published(raw.goals).filter((row) => subjectIds.has(row.subject_id));
  const goalIds = new Set(goals.map((row) => row.goal_id));

  const skills = published(raw.skills).filter((row) => subjectIds.has(row.subject_id));
  const skillIds = new Set(skills.map((row) => row.skill_id));

  const resources = published(raw.resources).filter(
    (row) => providerIds.has(row.provider_id)
      && subjectIds.has(row.subject_id)
      && (row.learning_goal_ids || []).some((id) => goalIds.has(id)),
  );
  const resourceIds = new Set(resources.map((row) => row.resource_id));

  const sources = published(raw.sources);
  const sourceIds = new Set(sources.map((row) => row.source_id));

  const reviews = published(raw.reviews).filter((row) => resourceIds.has(row.resource_id));

  const feeHistory = published(raw.feeHistory).filter(
    (row) => resourceIds.has(row.resource_id) && sourceIds.has(row.source_id),
  );

  const paths = published(raw.paths);
  const pathIds = new Set(paths.map((row) => row.path_id));

  const pathSteps = published(raw.pathSteps).filter(
    (row) => pathIds.has(row.path_id)
      && (row.skill_id === null || skillIds.has(row.skill_id))
      && (row.goal_id === null || goalIds.has(row.goal_id))
      && (row.core_resource_ids || []).every((id) => resourceIds.has(id)),
  );

  const resourceSource = raw.resourceSource.filter(
    (row) => resourceIds.has(row.resource_id) && sourceIds.has(row.source_id),
  );

  return {
    subjects, goals, skills, providers, resources, paths, pathSteps,
    reviews, feeHistory, sources, resourceSource,
  };
}

/* ----------------------------------------------------------------------------
   数据集统计（P-10 专用；全部运行时计算，禁止硬编码）
   -------------------------------------------------------------------------- */

function tally(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function datasetStats(visible, raw) {
  const allVisible = [
    ...visible.subjects, ...visible.goals, ...visible.skills, ...visible.providers,
    ...visible.resources, ...visible.paths, ...visible.pathSteps,
    ...visible.reviews, ...visible.feeHistory, ...visible.sources,
  ];

  const perEntity = {};
  for (const [key, rows] of Object.entries(visible)) {
    perEntity[key] = {
      total: rows.length,
      demo: rows.filter((row) => row.data_class === 'demo').length,
      real: rows.filter((row) => row.data_class === 'real').length,
    };
  }

  return {
    hasDemo: allVisible.some((row) => row.data_class === 'demo'),
    hasReal: allVisible.some((row) => row.data_class === 'real'),
    totals: {
      records: allVisible.length,
      demo: allVisible.filter((row) => row.data_class === 'demo').length,
      real: allVisible.filter((row) => row.data_class === 'real').length,
      rawRecords: Object.values(raw).reduce((sum, rows) => sum + rows.length, 0),
    },
    perEntity,
    sourceType: tally(visible.sources, (row) => row.source_type),
    usagePermission: tally(visible.sources, (row) => row.usage_permission),
    feeVerification: tally(visible.feeHistory, (row) => row.verification_status),
    reviewOrigin: tally(visible.reviews, (row) => row.review_origin),
    reviewDataClass: tally(visible.reviews, (row) => row.data_class || 'unspecified'),
    resourceType: tally(visible.resources, (row) => row.resource_type || 'unknown'),
    goalSpread: tally(visible.resources, (row) => (row.learning_goal_ids || [])[0]),
  };
}

/* ----------------------------------------------------------------------------
   对外接口
   -------------------------------------------------------------------------- */

/**
 * 由「原始行集合」构造页面使用的数据上下文。
 *
 * 这是一个**纯函数**（不 fetch、不依赖 DOM），因此可以被 Node 测试直接调用，
 * 在没有浏览器的环境下验证可见性规则、索引与统计是否正确。
 *
 * @param {Record<string, Array<object>>} raw 与 DATA_FILES 的 key 对应的原始行
 */
export function buildContext(raw) {
  const visible = applyVisibility(raw);

  const ctx = {
    raw,
    ...visible,
    indexes: {
      subjectById: indexBy(raw.subjects, (row) => row.subject_id),
      goalById: indexBy(raw.goals, (row) => row.goal_id),
      goalByName: indexBy(raw.goals, (row) => row.name),
      skillById: indexBy(raw.skills, (row) => row.skill_id),
      providerById: indexBy(raw.providers, (row) => row.provider_id),
      resourceById: indexBy(raw.resources, (row) => row.resource_id),
      pathById: indexBy(raw.paths, (row) => row.path_id),
      sourceById: indexBy(raw.sources, (row) => row.source_id),
      reviewsByResource: indexMulti(raw.reviews, (row) => row.resource_id),
      feesByResource: indexMulti(raw.feeHistory, (row) => row.resource_id),
      resourcesByProvider: indexMulti(raw.resources, (row) => row.provider_id),
      resourcesByGoal: indexByMultiId(raw.resources, (row) => row.learning_goal_ids),
      stepsByPath: indexMulti(raw.pathSteps, (row) => row.path_id),
      resourceSourcesByResource: indexMulti(raw.resourceSource, (row) => row.resource_id),
    },
    warnings: [],
    fileOrder: FILE_ORDER,
  };

  ctx.stats = datasetStats(visible, raw);
  return ctx;
}

export async function loadAll({ force = false } = {}) {
  if (cache && !force) return cache;
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    const entries = await Promise.all(
      Object.entries(DATA_FILES).map(async ([key, filename]) => [key, await fetchJson(filename)]),
    );
    const raw = Object.fromEntries(entries);
    const ctx = buildContext(raw);
    cache = ctx;
    inFlight = null;
    return ctx;
  })();

  return inFlight;
}

/** 供测试与调试使用 */
export function _resetCache() {
  cache = null;
  inFlight = null;
}

/** 仅供测试注入用（不参与运行时路径） */
export function _primeCache(ctx) {
  cache = ctx;
}
