# ADR-007 Conversation State Strategy

## 决策
保存**结构化用户约束**（LearningDecisionRequest 子集），不保存 raw chat 历史。

## 理由
1. 上下文成本可控：每轮请求只带约束 + 本轮消息，不随轮数线性膨胀。
2. 语义正确：「预算改成100」场景下，约束合并（goal 保留 + budget 更新）比
   重建完整对话更可靠、更易测。
3. 隐私最小化（规格 §26）：不存原文 = 不建画像；session 级 TTL + 不跨 IP。
4. 权衡：无法处理「引用上文原话」类对话；当前产品语义（约束驱动的决策请求）不需要。
   多实例部署需换 Redis/KV。
