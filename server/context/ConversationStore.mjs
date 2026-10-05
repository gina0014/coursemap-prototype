/* ============================================================================
   CourseMap AI Backend — context/ConversationStore.mjs
   ----------------------------------------------------------------------------
   有限多轮对话（规格 §25-26）：
     - 保存「结构化用户约束」（LearningDecisionRequest），不是无限 raw chat。
     - session-level（内存 + TTL），不做长期用户画像，不假装跨设备记忆。
     - merge：前端 context 显式约束 > 会话延续 > 模型本轮抽取。
   注意：单实例内存实现；serverless 多实例场景应替换为 Redis/KV 适配。
   ========================================================================== */

import { CONFIG } from '../config.mjs';
import { sanitizeIntent } from '../orchestrator/intentSchema.mjs';
import { ApiError, ERROR_CODES } from '../errors.mjs';

const CONSTRAINT_KEYS = ['goal', 'current_level', 'known_skills', 'budget',
  'available_hours_per_week', 'target_duration_weeks', 'language',
  'certificate_requirement', 'resource_type'];

export class ConversationStore {
  constructor(ttlMs = CONFIG.context.sessionTtlMs, maxTurns = CONFIG.rateLimit.maxConversationTurns) {
    this._ttl = ttlMs;
    this._maxTurns = maxTurns;
    this._sessions = new Map();
  }

  get(conversationId, clientIp) {
    if (!conversationId) return null;
    const s = this._sessions.get(conversationId);
    if (!s) return null;
    if (Date.now() - s.updatedAt > this._ttl) { this._sessions.delete(conversationId); return null; }
    if (s.clientIp !== clientIp) return null; // 会话不跨 IP 复用（基础会话劫持防御）
    s.turns += 1;
    if (s.turns > this._maxTurns) {
      throw new ApiError(ERROR_CODES.RATE_LIMITED, '本会话对话轮次已达上限，请开启新会话。', 429);
    }
    return s;
  }

  /** 前端显式 context 合并进会话。 */
  merge(session, contextIntent) {
    if (!session) return contextIntent && Object.values(contextIntent).some((v) => v !== null && !(Array.isArray(v) && v.length === 0)) ? contextIntent : null;
    for (const key of CONSTRAINT_KEYS) {
      const v = contextIntent ? contextIntent[key] : null;
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        session.constraints[key] = v;
      }
    }
    session.updatedAt = Date.now();
    return session.constraints;
  }

  /**
   * 连续性：本轮模型抽取未覆盖的约束，从会话延续。
   * 例：上轮 goal=Python 数据分析，本轮只说「预算改成100」→ goal 保留，budget 更新。
   */
  applyContinuity(mergedContext, thisRoundIntent, llmIntent) {
    const out = { ...thisRoundIntent };
    const base = mergedContext || {};
    for (const key of CONSTRAINT_KEYS) {
      const provided = llmIntent ? llmIntent[key] : null;
      const covered = provided !== null && provided !== undefined && !(Array.isArray(provided) && provided.length === 0);
      if (!covered && out[key] === null) {
        out[key] = base[key] ?? null;
      }
    }
    if (Array.isArray(out.known_skills) && out.known_skills.length === 0 && Array.isArray(base.known_skills)) {
      out.known_skills = base.known_skills;
    }
    return sanitizeIntent(out).intent;
  }

  save(conversationId, constraints, clientIp) {
    if (!conversationId) return;
    this._sessions.set(conversationId, {
      constraints, clientIp, turns: 1, updatedAt: Date.now(),
    });
  }

  clear(conversationId) { this._sessions.delete(conversationId); }
}
