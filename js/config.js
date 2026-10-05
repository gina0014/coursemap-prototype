/* ============================================================================
   CourseMap（学途） — config.js
   ----------------------------------------------------------------------------
   应用配置。**唯一定义处**：
     - 阈值（复检天数 / 评分最小样本）
     - 检索预设（预算档 / 排序方式 / 分页）
     - 本地存储键、数据文件清单
   P-10 数据方法论页展示的公式与阈值必须来自本文件，不得另行硬编码。

   安全：本文件**不得**出现任何 API Key / Token / 凭据。
   ========================================================================== */

export const APP = {
  name: 'CourseMap',
  nameZh: '学途',
  tagline: '学习目标驱动的课程与学习资源智能决策平台',
  thesis: '按学习目标找资源，而不是先找平台再翻课程。',
  version: 'CourseMap-v0.1-Prototype',
  stage: 'v0.1 Prototype — Educational Domain Prototype',
  buildDate: '2026-10-06',
};

/* ----------------------------------------------------------------------------
   阈值
   --------------------------------------------------------------------------
   ⚠️ feeRecheckDays 仅作为**内部重新核验触发器**，不代表「费用在 N 天内有效」。
   UI 必须展示观测日期，不得展示「有效期」概念。
   -------------------------------------------------------------------------- */
export const THRESHOLDS = {
  /** 内部复检触发器（天）。不是费用有效期。 */
  feeRecheckDays: 180,
  /** 参与评分聚合的最小样本。低于该值 → 显示「Limited data」。 */
  ratingMinSample: 3,
};

/* ----------------------------------------------------------------------------
   检索
   -------------------------------------------------------------------------- */
export const SEARCH = {
  pageSize: 12,
  budgetPresets: [50, 100, 200, 500],
  defaultSort: 'relevance',
  sorts: ['relevance', 'fee_asc', 'fee_desc', 'rating', 'duration_asc', 'workload_asc'],
};

/* ----------------------------------------------------------------------------
   实验性「学习适配分」（Learning Fit Score）
   ----------------------------------------------------------------------------
   ⚠️ 设计决定（docs/product/12_Business_Model.md / 14_Roadmap.md）：
   第一版**不合成**总分。v0.1 优先把 Fee / Duration / Difficulty / Rating /
   Workload / Certificate 作为分指标一等展示项，避免给未经教育效果验证的
   加权合成分子以「科学结论」的外观。本常量仅保留接口位，frozen=false、
   experimental=true；任何未来实现都必须公开展示权重与组成部分。
   -------------------------------------------------------------------------- */
export const FIT_SCORE = {
  frozen: false,
  experimental: true,
  enabled: false,
  label: '实验性学习适配分',
  disclaimer: 'v0.1 不计算合成总分：教育效果无法由若干输入字段加权得出。请优先看分指标。',
};

/* ----------------------------------------------------------------------------
   AI 学习顾问
   ----------------------------------------------------------------------------
   当前实现 = Rule-based Prototype Decision Assistant（非 LLM）。
   llmAdapter 是**接口位**：未来接入 LLM 时由后端代理持有密钥，
   前端永远不出现 secret。详见 docs/product/11_AI_Architecture.md。
   -------------------------------------------------------------------------- */
export const AI = {
  mode: 'rule_based_prototype',
  label: 'AI 学习顾问 Preview',
  disclaimer: 'Prototype Decision Assistant · Not LLM-powered。推荐结果来自 CourseMap 结构化数据的规则检索，可解释、可回溯。',
  maxRecommendations: 4,
};

/* ----------------------------------------------------------------------------
   本地存储键
   -------------------------------------------------------------------------- */
export const STORAGE_KEYS = {
  favorites: 'coursemap.favorites.v1',
  savedGoals: 'coursemap.savedGoals.v1',
  localReviews: 'coursemap.localReviews.v1',
  prefs: 'coursemap.prefs.v1',
};

export const STORAGE_SCHEMA_VERSION = 1;

/* ----------------------------------------------------------------------------
   数据文件清单（与 data/schema/validation-rules-v0.1.json 的 data_files 一致）
   -------------------------------------------------------------------------- */
export const DATA_FILES = {
  subjects: 'subjects.json',
  goals: 'learning-goals.json',
  skills: 'skills.json',
  providers: 'providers.json',
  resources: 'resources.json',
  paths: 'learning-paths.json',
  pathSteps: 'learning-path-steps.json',
  reviews: 'reviews.json',
  feeHistory: 'fee-history.json',
  sources: 'sources.json',
  resourceSource: 'resource-source.json',
};

/** 前端只展示该状态的记录（docs/product/08_Source_Governance.md） */
export const VISIBLE_STATUS = 'published';

/* ----------------------------------------------------------------------------
   路径工具
   ----------------------------------------------------------------------------
   全部在运行时推导，支持任意子路径部署（例如 /coursemap-prototype/）。
   -------------------------------------------------------------------------- */

/** 站点根目录的 pathname，例如 '/' 或 '/coursemap-prototype/' */
const SITE_ROOT = new URL('../', import.meta.url).pathname;

/** 计算当前文档相对站点根的深度前缀，例如 '' 或 '../' */
function relativePrefix() {
  if (typeof document === 'undefined') return '';
  const here = document.location.pathname;
  const root = SITE_ROOT.endsWith('/') ? SITE_ROOT : SITE_ROOT + '/';
  const rest = here.startsWith(root) ? here.slice(root.length) : here.replace(/^\//, '');
  const segments = rest.split('/').filter(Boolean);
  const depth = Math.max(0, segments.length - 1);
  return depth === 0 ? '' : '../'.repeat(depth);
}

/** 把站点内相对资源路径转成当前文档可用的相对路径 */
export function asset(rel) {
  return relativePrefix() + String(rel).replace(/^\//, '');
}

export const PATH = { siteRoot: SITE_ROOT, relativePrefix };
