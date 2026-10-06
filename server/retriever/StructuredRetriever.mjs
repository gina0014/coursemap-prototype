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
   * @returns {{goal, candidates: object[], total: number, relaxations: string[]}}
   */
  retrieve(intent, limit = 12) {
    const goal = this.repo.findGoalByName(intent.goal);
    if (!goal) return { goal: null, candidates: [], total: 0, relaxations: [] };

    const base = this.repo.getResourcesByGoal(goal.goal_id, 200);
    const totalBefore = base.length;
    const relaxations = [];

    /* ---- 硬约束：用户明确给出的边界，不得越界 ---- */
    // 预算
    let list = this.repo.filterByBudget(base, intent.budget);
    if (list.length === 0 && base.length > 0 && intent.budget !== null && intent.budget !== undefined) {
      relaxations.push(`预算 ¥${intent.budget} 内没有匹配资源`);
    }
    // 可承受总学时（目标周期 × 每周可投入）
    list = this.repo.filterByDuration(list, intent.target_duration_weeks, intent.available_hours_per_week);

    /* ---- 软偏好：难度 / 真实性 / 语言只排序、不排除 ----
       理由见 CourseMapRepository.orderByDifficulty / orderByLanguage 的注释：
       它们描述「学习者的适配度」而非「资源可用性」，硬过滤会把合法请求
       变成假的「无匹配资源」（生产缺陷：目标「单细胞 RNA-seq 入门」）。

       顺序很关键（Module L）：先按难度适配度分层 → 再在**同一层内**让已核验的
       真实资源优先 → 最后按语言偏好。这样「优先真实资源」不会变成
       「real 永远第一」：一个更适配的 demo 资源仍可排在适配度差的 real 之前。 */
    list = this.repo.orderByDifficulty(list, intent.current_level);
    list = this.repo.orderByDataClass(list);
    list = this.repo.orderByLanguage(list, intent.language);

    if (intent.certificate_requirement) {
      list = list.filter((r) => r.certificate_available === true).concat(
        list.filter((r) => r.certificate_available !== true),
      );
    }

    return {
      goal,
      candidates: list.slice(0, limit),
      total: totalBefore,
      relaxations,
      data_class_counts: this.repo.dataClassCounts ? this.repo.dataClassCounts() : null,
    };
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
      level_official: r.level_official ?? null,
      language: r.language,
      learning_mode: r.learning_mode,
      certificate_available: r.certificate_available,
      rating: r.rating,
      rating_count: r.rating_count,
      data_class: r.data_class,
      verification_status: r.verification_status,
      prerequisites: r.prerequisite_skill_ids || [],
      outcomes: (r.learning_outcomes || []).slice(0, 3),
      /* 溯源：真实资源必须让模型看到「有官方来源 + 许可」，但模型无权改写这些值
         （最终展示值由 orchestrator 的 Fact Hydration 从 Repository 重取）。 */
      has_official_source: Boolean(r.url),
      license: this.repo.licenseSummaryFor
        ? (this.repo.licenseSummaryFor(r.resource_id)[0]?.license || null)
        : null,
    }));
  }
}
