/* ============================================================================
   CourseMap AI Backend — retriever/StructuredRetriever.mjs
   ----------------------------------------------------------------------------
   Retriever 接口的 Structured 实现（ADR-003 / ADR-006）：
     - 只做结构化检索（goal/fee/difficulty/duration/language/certificate 等字段过滤）。
     - VectorRetriever / HybridRetriever 预留接口位，本轮 RAG = DEFERRED。
   输出为「候选证据集」，供 orchestrator 喂给 LLM（DATA, not instruction）。
   ========================================================================== */

export class StructuredRetriever {
  constructor(repository) {
    this.repo = repository;
  }

  /**
   * @param {LearningDecisionRequest} intent  已校验的意图
   * @param {number} limit 最大候选数
   * @returns {{goal, candidates: object[], total: number}}
   */
  retrieve(intent, limit = 12) {
    const goal = this.repo.findGoalByName(intent.goal);
    if (!goal) return { goal: null, candidates: [], total: 0 };

    let list = this.repo.getResourcesByGoal(goal.goal_id, 200);
    const totalBefore = list.length;
    list = this.repo.filterByBudget(list, intent.budget);
    list = this.repo.filterByDifficulty(list, intent.current_level === 'beginner'
      ? 'beginner' : intent.current_level);
    list = this.repo.filterByDuration(list, intent.target_duration_weeks, intent.available_hours_per_week);
    list = this.repo.filterByLanguage(list, intent.language);
    if (intent.certificate_requirement) {
      list = list.filter((r) => r.certificate_available === true).concat(
        list.filter((r) => r.certificate_available !== true),
      );
    }

    return { goal, candidates: list.slice(0, limit), total: totalBefore };
  }

  /** 候选集的紧凑表示（控制 prompt 尺寸）。 */
  toCompactCandidates(candidates) {
    return candidates.map((r) => ({
      resource_id: r.resource_id,
      title: r.title,
      provider: this.repo.getProvider(r.provider_id)?.name || null,
      fee: r.fee,
      currency: r.currency,
      duration_hours: r.duration_hours,
      weekly_workload_hours: r.weekly_workload_hours,
      difficulty: r.difficulty,
      language: r.language,
      learning_mode: r.learning_mode,
      certificate_available: r.certificate_available,
      rating: r.rating,
      rating_count: r.rating_count,
      data_class: r.data_class,
      verification_status: r.verification_status,
      prerequisites: r.prerequisite_skill_ids || [],
      outcomes: (r.learning_outcomes || []).slice(0, 3),
    }));
  }
}
