/* ============================================================================
   CourseMap AI Backend — tools/toolExecutor.mjs
   ----------------------------------------------------------------------------
   工具执行器。安全硬约束（ADR-005）：
     - 模型生成的 tool arguments 视为 UNTRUSTED INPUT。
     - 一律 JSON Schema 校验 + 服务端二次验证；不 eval、不拼 SQL、不碰 FS/shell。
     - 工具名必须在 allowlist（TOOL_NAMES）内。
     - 结果数有上限，避免撑爆上下文。
   ========================================================================== */

import { ApiError, ERROR_CODES } from '../errors.mjs';
import { TOOL_NAMES } from './toolSchemas.mjs';

const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const LANGUAGES = new Set(['zh', 'en', 'bilingual']);

function asFiniteNumber(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asEnum(v, allowed) {
  return (typeof v === 'string' && allowed.has(v)) ? v : null;
}

function asStr(v, maxLen = 120) {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, maxLen);
  return s.length ? s : null;
}

/** ID 接受 string / number（数据集 resource_id 为整数）。 */
function asId(v, maxLen = 40) {
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim().slice(0, maxLen);
    return s.length ? s : null;
  }
  return null;
}

export class ToolExecutor {
  constructor(repository, retriever, maxResults = 12) {
    this.repo = repository;
    this.retriever = retriever;
    this.maxResults = maxResults;
    this.callCount = 0;
  }

  /**
   * @param {string} name       工具名
   * @param {object} rawArgs    模型生成的参数（untrusted）
   * @returns {{ ok: true, result: object } | { ok: false, error: string }}
   */
  execute(name, rawArgs) {
    this.callCount += 1;
    if (!TOOL_NAMES.has(name)) {
      return { ok: false, error: `Unknown tool "${asStr(name, 40)}". Allowed tools only.` };
    }
    let args = rawArgs;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { return { ok: false, error: 'Arguments are not valid JSON.' }; }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { ok: false, error: 'Arguments must be a JSON object.' };
    }

    try {
      switch (name) {
        case 'search_learning_resources': return this._search(args);
        case 'get_resource_detail': return this._detail(args);
        case 'compare_learning_resources': return this._compare(args);
        case 'get_learning_path': return this._path(args);
        case 'get_prerequisites': return this._prereqs(args);
        case 'get_source_evidence': return this._sources(args);
        default: return { ok: false, error: 'Unhandled tool.' };
      }
    } catch (err) {
      return { ok: false, error: 'Tool execution failed.' };
    }
  }

  _search(args) {
    const goal = asStr(args.goal, 80);
    if (!goal) return { ok: false, error: 'goal is required.' };
    const level = asEnum(args.level, DIFFICULTIES);
    const budget = asFiniteNumber(args.budget);
    const hours = asFiniteNumber(args.hours_per_week);
    const language = asEnum(args.language, LANGUAGES);
    if (budget !== null && (budget < 0 || budget > 100000)) {
      return { ok: false, error: 'budget out of range.' };
    }

    const matched = this.repo.findGoalByName(goal);
    if (!matched) {
      return { ok: true, result: { goal: null, resources: [], note: 'No matching CourseMap goal. Do not invent resources.' } };
    }
    let list = this.repo.getResourcesByGoal(matched.goal_id, 200);
    list = this.repo.filterByBudget(list, budget);
    list = this.repo.filterByDuration(list, null, hours);
    // 难度 / 语言为软偏好（排序），不排除 —— 与 StructuredRetriever 保持一致。
    // 硬过滤会把「目标下只有单一难度/语言资源」的情况错误地变成零结果。
    list = this.repo.orderByDifficulty(list, level);
    list = this.repo.orderByLanguage(list, language);
    if (args.certificate === true) list = list.filter((r) => r.certificate_available === true);
    if (typeof args.resource_type === 'string') list = list.filter((r) => r.resource_type === args.resource_type);

    return {
      ok: true,
      result: {
        goal: { goal_id: matched.goal_id, name: matched.name },
        count: list.length,
        resources: this.retriever.toCompactCandidates(list.slice(0, this.maxResults)),
      },
    };
  }

  _detail(args) {
    const id = asId(args.resource_id, 40);
    const r = id ? this.repo.getResourceById(id) : null;
    if (!r) return { ok: true, result: { resource: null, note: `resource_id "${id || ''}" does not exist in CourseMap. Never invent it.` } };
    const rating = this.repo.getRatingSummary(r.resource_id);
    return {
      ok: true,
      result: {
        resource: { ...r, rating: rating.rating, rating_count: rating.rating_count },
        provider: this.repo.getProvider(r.provider_id),
      },
    };
  }

  _compare(args) {
    const ids = Array.isArray(args.resource_ids) ? args.resource_ids : null;
    if (!ids || ids.length < 2 || ids.length > 6) {
      return { ok: false, error: 'resource_ids must be an array of 2-6 ids.' };
    }
    const rows = [];
    const missing = [];
    for (const rawId of ids.slice(0, 6)) {
      const id = asId(rawId, 40);
      const r = id ? this.repo.getResourceById(id) : null;
      if (!r) { missing.push(id); continue; }
      const rating = this.repo.getRatingSummary(r.resource_id);
      rows.push({
        resource_id: r.resource_id,
        title: r.title,
        provider: this.repo.getProvider(r.provider_id)?.name || null,
        fee: r.fee, currency: r.currency,
        duration_hours: r.duration_hours, weekly_workload_hours: r.weekly_workload_hours,
        difficulty: r.difficulty, language: r.language, learning_mode: r.learning_mode,
        certificate_available: r.certificate_available,
        rating: rating.rating, rating_count: rating.rating_count,
        verification_status: r.verification_status, data_class: r.data_class,
        sources: this.repo.getSourcesForResource(r.resource_id).map((s) => s.source.source_id),
      });
    }
    // 派生统计由 CourseMap 代码计算（不让 LLM 算事实）
    const fees = rows.map((r) => r.fee).filter((v) => v !== null && v !== undefined);
    const durations = rows.map((r) => r.duration_hours).filter((v) => v !== null && v !== undefined);
    const ratings = rows.map((r) => r.rating).filter((v) => v !== null && v !== undefined);
    const stats = {
      lowest_fee: fees.length ? Math.min(...fees) : null,
      highest_fee: fees.length ? Math.max(...fees) : null,
      fee_spread: fees.length ? Math.max(...fees) - Math.min(...fees) : null,
      shortest_duration: durations.length ? Math.min(...durations) : null,
      longest_duration: durations.length ? Math.max(...durations) : null,
      highest_rating: ratings.length ? Math.max(...ratings) : null,
      resource_count: rows.length,
    };
    return { ok: true, result: { resources: rows, computed: stats, missing_ids: missing } };
  }

  _path(args) {
    const pathId = asId(args.path_id, 40);
    if (pathId) {
      const p = this.repo.getLearningPath(pathId);
      if (!p) return { ok: true, result: { path: null, note: `path_id "${pathId}" does not exist in CourseMap.` } };
      return { ok: true, result: { path: p } };
    }
    const goalName = asStr(args.goal, 80);
    const goal = goalName ? this.repo.findGoalByName(goalName) : null;
    if (!goal) return { ok: true, result: { paths: [], note: 'No matching goal.' } };
    const paths = this.repo.paths.filter((p) => (p.goal_ids || []).includes(goal.goal_id));
    return {
      ok: true,
      result: {
        paths: paths.map((p) => {
          const full = this.repo.getLearningPath(p.path_id);
          return full ? {
            path_id: full.path_id, name: full.name, description: full.description,
            step_count: full.steps.length,
            steps: full.steps.map((s) => ({
              step_order: s.step_order, title: s.title, skill: s.skill?.name || null,
              core_resource_ids: s.core_resource_ids,
            })),
          } : null;
        }).filter(Boolean),
      },
    };
  }

  _prereqs(args) {
    const goalName = asStr(args.goal, 80);
    const goal = goalName ? this.repo.findGoalByName(goalName) : null;
    if (!goal) return { ok: true, result: { found: false, note: 'No matching CourseMap goal.' } };
    const pre = this.repo.getPrerequisites(goal.goal_id);
    return {
      ok: true,
      result: {
        found: true,
        goal: { goal_id: goal.goal_id, name: goal.name },
        prerequisite_goals: pre.prerequisite_goals.map((g) => ({ goal_id: g.goal_id, name: g.name })),
        prerequisite_skills: pre.prerequisite_skills.map((s) => ({ skill_id: s.skill_id, name: s.name })),
      },
    };
  }

  _sources(args) {
    const id = asId(args.resource_id, 40);
    const r = id ? this.repo.getResourceById(id) : null;
    if (!r) return { ok: true, result: { sources: [], note: `resource_id "${id || ''}" does not exist.` } };
    const links = this.repo.getSourcesForResource(r.resource_id);
    return {
      ok: true,
      result: {
        resource_id: r.resource_id,
        data_class: r.data_class,
        verification_status: r.verification_status,
        updated_at: r.updated_at,
        observed_at: r.observed_at,
        sources: links.map((l) => ({
          source_id: l.source.source_id,
          title: l.source.title,
          source_type: l.source.source_type,
          url: l.source.url,
          verification_status: l.source.verification_status,
          field_scope: l.field_scope,
          note: l.note,
        })),
      },
    };
  }
}
