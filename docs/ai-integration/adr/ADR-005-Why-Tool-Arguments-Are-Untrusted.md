# ADR-005 Why Tool Arguments Are Untrusted

## 决策
模型生成的工具参数一律视为 untrusted input：JSON Schema 声明 + 服务端二次校验 +
代码内 switch 白名单执行；不 eval、不动态执行、不拼接查询。

## 理由
1. Prompt injection 可经用户消息或检索文本影响模型输出，模型可能生成恶意参数
   （如 tool=run_shell）——白名单 + 二次校验使该路径无执行面。
2. 参数即查询边界：类型/枚举/范围/数量上限校验同时是成本护栏（防全库导出进 prompt）。
3. 工具结果本身也截断（≤6000 字符）回填，防止上下文爆炸。
