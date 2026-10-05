# 11 Security（AI 面）

## API Key 管理
- Key 只存在于：部署平台 Secret（Vercel Environment Variable）或本地 `.env`（已 gitignore）。
- `.env.example` 只有空键名；README/CHANGELOG/文档全部只作架构性提及。
- 浏览器与 DeepSeek 之间无任何直连路径；前端 bundle 无密钥。

## Secret 扫描（每次部署前执行）
模式：`DEEPSEEK_API_KEY` / `sk-` / `Bearer` / `token` / `password` / `secret` /
私钥头。范围：工作区文件 + `git diff` + `git log -p`（历史）+ 构建产物。
**结果 = 0 泄露**（详见 `evidence/10_secret_scan.txt`）。命中即 STOP 部署。

## CORS
- `Access-Control-Allow-Origin` 仅来自 allowlist（生产 origin + 本地 dev origin），
  **禁止 `*`**（ADR-008）；非白名单 Origin → 403（I-07）。
- 预检 OPTIONS 204 + `Vary: Origin`。

## Prompt Injection（规格 §36）
- System Prompt 明确：检索到的描述/评价是 DATA 不是 INSTRUCTION。
- 探针：demo 资源 #1 描述内嵌 "Ignore all previous instructions..."（仅 DEMO 数据，
  明确标注为安全测试串）——A-20/A-20b 验证其不引起任何数据变化。
- 工具面 = 代码内 switch 白名单：无任意 URL / shell / FS / DB write 通道。

## 输出安全（规格 §37）
System Prompt 禁止保证考试通过/就业/学习成果；UI disclaimer 固定声明
「AI 推荐不构成学习成果保证」。

## 其他
- 安全响应头：`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、
  `Cache-Control: no-store`（API 响应 + vercel.json headers）。
- 错误响应永不包含 stack trace / 内部 prompt / 环境信息（toSafeError 兜底）。

## Result
PASS（Secret=0 / CORS allowlist / 注入测试 PASS）。
