# 17 Known Limitations（如实）

1. **Real DeepSeek Call 未验证**：当前环境无 API Key，Live 测试 SKIP。
   工程闭环完成，但「真实调用 PASS」这一验收项待 Key 后执行。
2. **后端未部署**：部署平台需用户账号授权；前端公网当前为降级模式（规则原型）。
3. Rate limit、会话存储、usage 日志均为**单实例内存实现**——多实例 serverless
   部署时需外置（Redis/KV/日志服务）；接口已收敛但迁移工作未做。
4. 会话 TTL 内重启实例会丢失上下文（内存实现的自然结果）。
5. Streaming 未实现（non-streaming 决策，见 10 文档）。
6. RAG / Vector Retrieval 未实现（DEFERRED，见 18 文档）。
7. 数据集仍为 DEMO：AI 真实了，但推荐对象不是真实课程；
   不因接入真实 LLM 而改变披露。
8. Live E2E 的 7 个公网 Case（16 文档）待 Key 后执行，本轮不预写 PASS。
9. Live 测试会产生真实 token 费用（预计每轮完整测试 < $0.05 量级，取决于模型定价）。
