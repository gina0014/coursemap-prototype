# 17 Known Limitations（如实）

1. **生产再验证尚未完成**：后端已部署且已读到密钥、修复已完成并本地全量验证通过，
   但修复尚未推送 → 生产仍在跑修复前代码。判定 Production Activation COMPLETE
   仍需 CI 同时通过 `public-e2e` 与 `backend-verify` 并产出证据。
2. **开发机无法直连 `*.vercel.app`**（DNS 污染 + TLS 复位）→ 生产验证只能经
   GitHub Actions 执行；本地只能跑「测试替身 + 完整真实管线」的等价验证。
3. Rate limit、会话存储、usage 日志均为**单实例内存实现**——多实例 serverless
   部署时需外置（Redis/KV/日志服务）；接口已收敛但迁移工作未做。
4. 会话 TTL 内重启实例会丢失上下文（内存实现的自然结果）。
5. Streaming 未实现（non-streaming 决策，见 10 文档）。
6. RAG / Vector Retrieval 未实现（DEFERRED，见 18 文档）。
7. 数据集仍为 DEMO：AI 真实了，但推荐对象不是真实课程；
   不因接入真实 LLM 而改变披露。
8. 「目标名匹配」靠**启发式**（精确 / 双向包含 / Dice 相似度）而非嵌入向量：
   对现有 12 个规范目标是充分的（含改写鲁棒性单测），但目标集合显著扩张后
   应改为语义匹配。另有 Stage A 已枚举规范目标清单作为第一道防线。
9. Vercel **冷启动**会让首个请求明显变慢（Serverless 特性）；
   验证脚本的等待/超时已按此设置。
10. Live 测试会产生真实 token 费用（预计每轮完整测试 < $0.05 量级，取决于模型定价）。
