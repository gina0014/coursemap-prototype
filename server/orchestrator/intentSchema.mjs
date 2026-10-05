/* ============================================================================
   CourseMap AI Backend — orchestrator/intentSchema.mjs
   ----------------------------------------------------------------------------
   LearningDecisionRequest 的服务端 schema 校验（规格 §11-13）。
   模型返回的 JSON ≠ 自动可信：必须逐字段清洗 + 范围验证。
   未知 = null；禁止模型猜测用户未提供的重要限制。
   ========================================================================== */

const LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const LANGUAGES = new Set(['zh', 'en', 'bilingual']);
const LEARNING_STYLES = new Set(['self_paced', 'instructor_led', 'hybrid']);
const RESOURCE_TYPES = new Set(['course', 'tutorial', 'book', 'open_course', 'learning_module']);

function num(v, { min = -Infinity, max = Infinity } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function str(v, maxLen = 120) {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, maxLen);
  return s.length ? s : null;
}

function enumOrNull(v, allowed) {
  return (typeof v === 'string' && allowed.has(v)) ? v : null;
}

function boolOrNull(v) {
  if (typeof v === 'boolean') return v;
  return null;
}

/**
 * 清洗模型/前端提交的意图对象。任何字段不合法 → null（绝不抛错、绝不猜）。
 * @returns {{ intent: LearningDecisionRequest, warnings: string[] }}
 */
export function sanitizeIntent(raw) {
  const warnings = [];
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const budget = num(r.budget, { min: 0, max: 100_000 });
  if (r.budget !== null && r.budget !== undefined && budget === null) {
    warnings.push('预算字段无效，已忽略。');
  }
  const hours = num(r.available_hours_per_week, { min: 0.5, max: 100 });
  const weeks = num(r.target_duration_weeks, { min: 0.5, max: 520 });

  const intent = {
    goal: str(r.goal, 80),
    current_level: enumOrNull(r.current_level, LEVELS),
    known_skills: Array.isArray(r.known_skills)
      ? r.known_skills.slice(0, 10).map((s) => str(s, 40)).filter(Boolean)
      : [],
    budget,
    available_hours_per_week: hours,
    target_duration_weeks: weeks,
    language: enumOrNull(r.language, LANGUAGES),
    preferred_learning_style: enumOrNull(r.preferred_learning_style, LEARNING_STYLES),
    certificate_requirement: boolOrNull(r.certificate_requirement),
    resource_type: enumOrNull(r.resource_type, RESOURCE_TYPES),
    career_goal: str(r.career_goal, 120),
  };
  return { intent, warnings };
}

/** 前端直接提交的结构化 context（可选增强），同样必须清洗。 */
export function sanitizeContext(ctx) {
  const { intent } = sanitizeIntent(ctx && typeof ctx === 'object' ? ctx : {});
  return intent;
}
