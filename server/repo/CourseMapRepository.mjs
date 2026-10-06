/* ============================================================================
   CourseMap AI Backend — repo/CourseMapRepository.mjs
   ----------------------------------------------------------------------------
   JsonCourseMapRepository：CourseMap 数据的单一访问点（服务端）。

   设计原则：
     - Repository abstraction：未来可替换为 PostgresCourseMapRepository，
       业务层（orchestrator / retriever / tools）不得感知 JSON 文件细节。
     - 只读。CourseMap data = Evidence Layer，AI 不得写库。
     - 数据文件与前端共用同一份（data/*.json），保证前后端事实一致。
   ========================================================================== */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = dirname(fileURLToPath(import.meta.url));

/** 多候选数据目录（本地 dev / Vercel bundle 布局可能不同）。 */
function candidateDataDirs() {
  return [
    join(SERVER_ROOT, '..', '..', 'data'),
    join(process.cwd(), 'data'),
    join(SERVER_ROOT, 'data'),
    '/var/task/data',
  ];
}

function findDataDir() {
  for (const dir of candidateDataDirs()) {
    if (existsSync(join(dir, 'resources.json'))) return dir;
  }
  return null;
}

function loadJson(dir, name, fallback) {
  if (!dir) return fallback;
  try {
    return JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  } catch {
    return fallback;
  }
}

function rowsOf(data, fallback = []) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  return fallback;
}

export class JsonCourseMapRepository {
  constructor(dataDir = null) {
    const dir = dataDir || findDataDir();
    if (!dir) {
      // 数据不可用时仓库保持空态（核心功能降级由上层处理），绝不抛出内部路径
      this._available = false;
      return;
    }
    this._available = true;
    this.resources = rowsOf(loadJson(dir, 'resources'));
    this.goals = rowsOf(loadJson(dir, 'learning-goals'));
    this.skills = rowsOf(loadJson(dir, 'skills'));
    this.providers = rowsOf(loadJson(dir, 'providers'));
    this.subjects = rowsOf(loadJson(dir, 'subjects'));
    this.paths = rowsOf(loadJson(dir, 'learning-paths'));
    this.pathSteps = rowsOf(loadJson(dir, 'learning-path-steps'));
    this.reviews = rowsOf(loadJson(dir, 'reviews'));
    this.sources = rowsOf(loadJson(dir, 'sources'));
    this.resourceSources = rowsOf(loadJson(dir, 'resource-source'));
    this.feeHistory = rowsOf(loadJson(dir, 'fee-history'));

    this._resourceById = new Map(this.resources.map((r) => [String(r.resource_id), r]));
    this._goalById = new Map(this.goals.map((g) => [String(g.goal_id), g]));
    this._providerById = new Map(this.providers.map((p) => [String(p.provider_id), p]));
    this._pathById = new Map(this.paths.map((p) => [String(p.path_id), p]));
    this._skillById = new Map(this.skills.map((s) => [String(s.skill_id), s]));
    this._sourceById = new Map(this.sources.map((s) => [String(s.source_id), s]));
    this._publishedResources = this.resources.filter((r) => r.status === 'published');
  }

  get isAvailable() { return this._available !== false; }

  /* ---- 基础查询（Retrieval API，与规格 §14 对应）---- */

  searchResources({ text = '', goalId = null, limit = 12 } = {}) {
    let out = this._publishedResources;
    if (goalId) {
      const key = String(goalId);
      out = out.filter((r) => (r.learning_goal_ids || []).some((g) => String(g) === key));
    }
    if (text) {
      const t = String(text).toLowerCase();
      out = out.filter((r) =>
        [r.title, r.description].some((f) => String(f || '').toLowerCase().includes(t)));
    }
    return out.slice(0, limit);
  }

  getResourceById(id) { return this._resourceById.get(String(id)) || null; }

  getResourcesByGoal(goalId, limit = 50) {
    const key = String(goalId);
    return this._publishedResources
      .filter((r) => (r.learning_goal_ids || []).some((g) => String(g) === key))
      .slice(0, limit);
  }

  /** 按目标名模糊匹配（含别名）。 */
  findGoalByName(name) {
    if (!name) return null;
    const t = String(name).toLowerCase().trim();
    return this.goals.find((g) =>
      String(g.name || '').toLowerCase() === t
      || (g.aliases || []).some((a) => String(a).toLowerCase() === t))
      || this.goals.find((g) => String(g.name || '').toLowerCase().includes(t)
        || (g.aliases || []).some((a) => String(a).toLowerCase().includes(t)))
      || null;
  }

  filterByBudget(list, budget) {
    if (budget === null || budget === undefined) return list;
    return list.filter((r) => r.fee === null || r.fee === undefined || r.fee <= budget);
  }

  filterByDifficulty(list, difficulty) {
    if (!difficulty) return list;
    return list.filter((r) => r.difficulty === difficulty);
  }

  /**
   * 难度**偏好排序**（软约束，绝不排除）。
   *
   * 为什么不硬过滤（生产缺陷记录）：
   *   current_level 描述的是「学习者的水平」，不是「资源必须达到的门槛」。
   *   当某个目标下只有一种难度的资源时（实测：目标「单细胞 RNA-seq 入门」
   *   的 2 条资源均为 advanced），硬过滤会把候选集清空，把一个正常请求
   *   变成假的「没有匹配资源 / AI 输出不可信」。这和「入门」目标恰恰需要
   *   那些材料相矛盾。
   *   因此难度一律保留，只做「越接近越靠前」的排序，交给 LLM 在解释里取舍。
   */
  orderByDifficulty(list, difficulty) {
    if (!difficulty) return list.slice();
    const dist = { beginner: 0, intermediate: 1, advanced: 2 };
    const target = dist[difficulty];
    if (target === undefined) return list.slice();
    return list.slice().sort((a, b) => {
      const da = dist[a.difficulty] === undefined ? 9 : Math.abs(dist[a.difficulty] - target);
      const db = dist[b.difficulty] === undefined ? 9 : Math.abs(dist[b.difficulty] - target);
      return da - db;
    });
  }

  filterByDuration(list, weeks, hoursPerWeek) {
    // target_duration_weeks × available_hours_per_week = 可承受总学时
    if (!weeks) return list;
    const cap = weeks * (hoursPerWeek || 999);
    return list.filter((r) => r.duration_hours === null || r.duration_hours === undefined
      || r.duration_hours <= cap);
  }

  filterByLanguage(list, language) {
    if (!language) return list;
    return list.filter((r) => r.language === language
      || (language === 'zh' && r.language === 'bilingual'));
  }

  /**
   * 语言**偏好排序**（软约束，绝不排除）。
   *
   * 理由同 orderByDifficulty：目标语言资源优先，但绝不因此丢弃唯一可用资源。
   * 实测：目标「单细胞 RNA-seq 入门」唯一直接对应的课程为英文资源，
   * 硬过滤会让中文用户看不到它 —— 应由 AI 在解释中提示语言门槛，而不是隐藏。
   */
  orderByLanguage(list, language) {
    if (!language) return list.slice();
    const rank = (r) => {
      if (r.language === language) return 0;
      if (language === 'zh' && r.language === 'bilingual') return 1;
      if (r.language === 'bilingual') return 1;
      return 2;
    };
    return list.slice().sort((a, b) => rank(a) - rank(b));
  }

  getProvider(id) { return this._providerById.get(String(id)) || null; }

  getLearningPath(pathId) {
    const path = this._pathById.get(String(pathId));
    if (!path) return null;
    /* 注意：必须按下标比较。ID 在数据集中是数字，而调用方（orchestrator 的
       path_ref、工具的 args）常把它们规范化成字符串传入；此处若用严格 ===
       会得到 0 个步骤 —— 学习路径会静默渲染为空（生产缺陷记录）。 */
    const steps = this.pathSteps
      .filter((s) => String(s.path_id) === String(pathId))
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({
        ...s,
        core_resources: (s.core_resource_ids || []).map((id) => this.getResourceById(id)).filter(Boolean),
        optional_resources: (s.optional_resource_ids || []).map((id) => this.getResourceById(id)).filter(Boolean),
        skill: this._skillById.get(String(s.skill_id)) || null,
        goal: this._goalById.get(String(s.goal_id)) || null,
      }));
    return { ...path, steps };
  }

  getPrerequisites(goalId) {
    const goal = this._goalById.get(String(goalId));
    if (!goal) return null;
    return {
      goal,
      prerequisite_goals: (goal.prerequisite_goal_ids || [])
        .map((id) => this._goalById.get(String(id))).filter(Boolean),
      prerequisite_skills: (goal.related_skill_ids || [])
        .flatMap((sid) => {
          const skill = this._skillById.get(String(sid));
          if (!skill) return [];
          return (skill.prerequisite_skill_ids || [])
            .map((pid) => this._skillById.get(String(pid))).filter(Boolean);
        }),
    };
  }

  getSourcesForResource(resourceId) {
    const links = this.resourceSources.filter((rs) => String(rs.resource_id) === String(resourceId));
    return links.map((rs) => ({
      resource_source_id: rs.resource_source_id,
      field_scope: rs.field_scope,
      note: rs.note || null,
      source: this._sourceById.get(String(rs.source_id)) || null,
    })).filter((x) => x.source);
  }

  /** 评分事实：由服务端代码聚合（不信任模型回传）。 */
  getRatingSummary(resourceId) {
    const rs = this.reviews.filter((r) => String(r.resource_id) === String(resourceId) && r.status === 'published');
    if (rs.length === 0) return { rating: null, rating_count: 0 };
    const rating = rs.reduce((s, r) => s + (r.overall_rating || 0), 0) / rs.length;
    return {
      rating: Math.round(rating * 10) / 10,
      rating_count: rs.length,
    };
  }
}

/** 单例（serverless 冷启动复用）。 */
let singleton = null;
export function getRepository() {
  if (!singleton) singleton = new JsonCourseMapRepository();
  return singleton;
}
