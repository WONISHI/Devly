# 供应商与协议验收矩阵

更新：2026-11-27。实现按协议选择，不根据供应商品牌猜测格式。当前三种适配器均使用 Main fetch、严格流边界和本地工具循环；共享的是 HTTP/SSE 传输，消息与工具结构分别实现。

| 协议 / 端点 | 模型 | 文本 / 文本流 | 工具往返 / 取消 / 错误 | 证据与状态 |
| --- | --- | --- | --- | --- |
| Chat Completions / 火山方舟 `ark.cn-beijing.volces.com/api/v3` | `deepseek-v4-1-flash-261017` | 既有真实检查通过 | 既有真实编程样例通过；本地取消/错误回归另有记录 | 文本/只读 2026-11-22（LOG-041/043），编程样例 2026-11-26（LOG-051）及 2026-11-27 预览包（LOG-094，6 轮/7 工具，真实审批修改/测试/Diff）；仅该组合，不扩大覆盖范围 |
| Responses / 本地回环协议替身 | `local-fixture` | 非流式/逐字节 SSE 本地通过 | 原生 call_id/function_call_output、实际搜索→读取、取消/HTTP 错误本地通过 | LOG-062；代码和本地协议已验证，真实端点待联调 |
| Anthropic Messages / 本地回环协议替身 | `local-fixture` | 非流式/原生内容块增量本地通过 | tool_use/tool_result、签名块、实际搜索→读取、取消/HTTP 错误本地通过 | LOG-063；代码和本地协议已验证，真实端点待联调 |

用户本轮确认先完成代码与本地协议验证，新协议真实供应商联调另行安排。没有向未知端点转发个人 Key，没有把替身结果写成真实供应商通过。设置中每次诊断保存所选配置修订下的实际检查时间、模型与结果；更改端点、协议、模型、兼容配置或密钥引用会使旧报告失效。

## 路由与能力边界

| 项目 | Chat Completions | Responses | Anthropic Messages |
| --- | --- | --- | --- |
| Base URL | 如 `https://host/v1` | 如 `https://host/v1` | 如 `https://host/v1` |
| 请求路径 | `/chat/completions` | `/responses` | `/messages` |
| 认证 | Bearer | Bearer | x-api-key + anthropic-version 2023-06-01 |
| 模型列表 | 尝试 `/models`，可手填 | 同左 | 同左；仅尝试读取当前页，不假定接口可用 |
| 输出限制 | 显式兼容参数 | max_output_tokens，明确选择 omit 才省略 | max_tokens 必需；omit 明确拒绝 |
| 工具 | function/tool_calls | 独立函数输出项与 call_id | 独立内容块与 tool_use_id |
| 结构化输出 | 独立探测 | 独立探测 text.format | 当前适配器明确不支持，不静默删除参数 |
| 视觉 / 上下文窗口 | 按配置和单独验证，默认未知 | 同左 | 同左；当前不声明完整附件能力 |
| 服务端工具 | 不开放任意模型执行入口 | 未注册的服务端工具明确拒绝 | 未注册的服务端工具明确拒绝 |

文本成功不标记工具、视觉或结构化输出支持。当前模型未知时保留 unknown；探测失败只是该配置本次检查失败，不证明整个协议或公司不支持。无模型列表时仍可手填模型 ID。HTTP 不加密配置会提示风险；重定向禁止自动携带认证信息。

Responses 使用 store:false，在同一个适配器实例内保留供应商原始输出项（包括加密 reasoning）供后续工具往返，不把专有项暴露给 Renderer。Anthropic 在同一实例内保留原内容块和 thinking signature；合并相邻 tool_result 为原生 user 内容块。两者的工具索引均归一为连续业务索引，不能把原生文本/推理块的 index 当成工具序号。缓存有界且 dispose 清理；不承诺跨应用重启恢复供应商隐藏推理状态。

增量参数完整、JSON 校验和协议终止通过前不执行工具；未知输出项、缺终止、矛盾结果、重复调用 ID 均失败。没有网络断流自动续接、自动切换协议或自动重试副作用。

## 复现

```bash
pnpm exec vitest run tests/providers.test.ts tests/native-protocols.test.ts tests/model-options.test.ts
pnpm verify:protocols
```

本地原生脚本需要回环监听权限，生成临时项目和 SQLite，真实文件搜索/读取，结束后清理。真实验收需在 Devly 内选择对应协议、端点、模型和受保护密钥，依次检查非流式文本、文本流、工具往返和取消，记录不含秘密的结果；尚未联调的行保持待验证。

协议实现参考官方文档：[Responses 流事件](https://developers.openai.com/api/reference/resources/responses/streaming-events)、[Responses 函数调用](https://developers.openai.com/api/docs/guides/function-calling)、[Anthropic 内容块与流事件](https://platform.claude.com/docs/en/build-with-claude/streaming)。仅采用本项目明确实现的子集，不因文档列出某能力就宣称已实现。
