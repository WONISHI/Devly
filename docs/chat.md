# 阶段 4：普通聊天与历史恢复

更新：2026-11-22。对应 4.1/P07、4.2/A01、4.3/U01、4.4/U02，记录见 LOG-036–LOG-041。代码、本地端到端与火山方舟指定模型的真实聊天/重启续聊验收均已通过；不扩展为任意端点兼容承诺。

## 使用流程

1. 侧栏“新聊天”可创建通用聊天；无需先选项目。项目与跨项目“最近”分别管理；选择真实项目后才可启用只读 Agent。先在设置中保存 Chat Completions 供应商、模型和受保护的 API Key。密钥仍通过 Main 的系统输入框设置，不进入 Renderer。
2. 打开本地项目，选择模型，在任务输入框输入文字；Enter 发送，Shift+Enter 换行，中文输入法组合期间不会提交，空输入不能提交。
3. 首次发送会创建项目会话，保存用户消息与回复占位后再发 HTTP 请求。输入框在当前会话生成时锁定，按钮变为停止；其他会话可继续使用。
4. 可切换项目、会话或设置页；原会话在 Main 继续接收，回来后读取同一回合。页面刷新不会重发请求。正常退出会停止并保存；异常退出后标记中断，由用户决定重发。
5. 重启应用后选择原会话即可继续。只有成功完成的历史回合进入下一条请求；取消/失败的部分回复保留显示，可明确重新发送。附件入口当前禁用，拖入/粘贴文件会提示仅支持纯文本，不偷偷上传本地文件。

本阶段只发送用户输入和该会话已完成的对话历史，**不自动读取项目目录、项目约定、文件或工具结果**。选择项目用于本地归属。完整上下文组装、工具调用循环、审批和命令执行属于后续阶段。

## 会话与模型规则（P07）

应用/项目默认模型是新会话的初始值；已有会话使用自己的 providerId/model，不随默认设置改变而跳到其他端点。旧版本未绑定的会话要求明确选择模型，不自动猜测迁移。

有消息的会话切换模型时，界面提供三种结果：

| 操作 | 历史与网络行为 |
| --- | --- |
| 取消 | 原绑定保持不变 |
| 新建会话使用 | 新会话为空，原会话及其绑定保留 |
| 保留历史并切换 | 明确授权当前会话的已完成历史在下一次发送时交给所选供应商 |

切换操作自身不会发 API 请求；生成中拒绝修改绑定。服务端再次检查 allowHistory，不能绕过弹窗直接更换已有历史的绑定。每个回合记录实际 Provider UUID、模型和配置 revision，旧回合不随会话切换改写；删除供应商后不自动替换成另一家。

## 实际架构

```mermaid
flowchart TD
  U[原 PromptInput / ModelSelector] --> H[ChatWorkspace + useChat]
  H --> G[desktop.data / 沙箱 Preload]
  G --> R[RequestRouter\n窗口 / frame / requestId / Zod 校验]
  R --> S[LocalDataService]
  S --> C[ChatRuntime\n每会话单回合 / 最多 4 个后台任务]
  C --> V[CredentialVault\nMain 解密 / 不返回 Key]
  C --> A[ChatCompletionsAdapter\nAbort / 超时 / SSE / 固定错误]
  A --> API[用户明确绑定的 API]
  API --> A
  A --> X[SecretRedactor\n分段 Key 回显保护]
  X --> C
  C --> W[DatabaseClient / 独立 Worker]
  S --> W
  W --> DB[(SQLite v4\n会话绑定 / 回合 / 消息分段)]
  DB --> Q[chat.read / sessions.messages\n有限快照与 keyset 分页]
  Q --> H
  H --> M[原 Conversation + Message\nRadix ScrollArea / 上滚锁定 / 回到底部]
```

回合属于 Main 与数据库，不属于某个 React 页面订阅。useChat 仅为可见会话轮询快照，卸载会停止定时器、丢弃迟到结果，不取消后台生成，也不把结果写到新的会话。发送已被接受后，即使 UI 刷新失败也不自动重复提交。较早的轮询不能覆盖较新已接受的回合。

## 本地契约

| 操作 | 参数与行为 |
| --- | --- |
| sessions.bind | projectId/sessionId/providerId/model；allowHistory 默认为 false；setDefault 为 true 时，会话绑定和项目默认模型在同一事务保存，其他设置保留 |
| chat.start | projectId/sessionId/turnId/text/expectedProviderId/expectedModel；Main 拒绝界面所见模型与持久化绑定不一致的请求，再复核配置 revision，避免旧界面意外发送给另一供应商 |
| chat.read | projectId/sessionId；仅返回最新回合 DTO 与安全文本，不返回 Key/凭据引用 |
| chat.cancel | projectId/sessionId/turnId；只停止对应回合，旧 turnId 不会取消新回合 |
| sessions.messages | 按项目/会话配对读取消息分段、状态与实际用量，limit/cursor 有界 |

## 生命周期（A01）

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> running: 归属与配置校验 / 原子保存消息
  running --> completed: 收到有效结束与文本
  running --> stopping: 用户停止
  stopping --> cancelled: 中止网络并保存部分文本
  running --> failed: 认证 / 网络 / 协议 / 配置改变
  pending --> failed: 准备失败或中断
  running --> failed: 重启恢复时发现旧运行记录
  running --> waiting_approval: 仅未来 Agent 使用
  waiting_approval --> running: 仅未来 Agent 使用
```

持久化 status 保持 pending/running/completed/failed/cancelled；phase 能表达 stopping 和预留的 waiting_approval。状态转换在共享契约定义、Worker 再校验；终态不能重新变回 running。工具状态契约仅预留，不创建假工具、审批、计划、测试或用量。未提供工具的普通请求若意外收到工具调用，显示不支持且不执行。

- 运行期由 AbortController 中止 fetch/SSE；120 秒超时，不自动切供应商或重试。
- 保存/删除 Provider 或替换/清除凭据会中止原配置请求；发请求前按 revision 检查准备期间的配置变化。
- 项目移除、会话归档先停止关联生成，再改变可见状态；不删除项目目录。
- 正常退出等待任务终结再关闭 Worker；重启把旧运行回合标为 INTERRUPTED，保留此前保存内容，不重复执行。
- 401/403/429/5xx/断流/超时等沿用 Provider 固定错误。Key 读取失败在发 HTTP 前拒绝，不能把它标成 API 的 401。

## 数据与边界

v4 是事务迁移：sessions 新增 provider_id/model；turns 增加实际绑定/revision、用户/助手消息 ID、phase、时间、error、usage 和 finish。旧 v3 数据保留，旧运行记录先恢复为失败，再建立每会话最多一个活动回合的唯一索引。升级前仍备份，失败回滚，不删旧库。

开始时在一个事务内写回合、用户消息、助手占位和两个 text 分段；此后约 80ms 批次保存累计安全文本，结束时再保存完整结果。进程突发中断可能丢失最后尚未提交的片段，界面不会把部分回复当成完整成功。

| 边界 | 当前实现 |
| --- | --- |
| 输入 | 最多 32,768 字符，去掉首尾空白后不能空 |
| 上下文 | 最多 200 条成功回合的消息，序列化后最多 256 KiB；超过时明确要求新建会话，不静默截断 |
| 单条回复 | 最多 262,144 字符；适配器另有 2 MiB 响应体限额 |
| Token/费用 | 输出参数采用当前项目 maxTokens；未上报用量保持 null；费用不编造，maxCost 尚不是完整 Agent 成本预算 |
| 历史 | UI 首次读最新 20 条，按需向前翻页，(created_at,id) 游标避免重复；本地附件/大日志仍按既有索引分段读取 |
| 传输 | 只有本地 DTO，Main 不序列化原始供应商错误体、Key 或 Authorization |

原版 Conversation 的底部跟随逻辑与同源 ScrollArea 组合，不修改上游源文件。消息区是局部滚动，外层页面不增高；加载更早消息保留阅读位置，主动上滚或使用向上翻页键会明确停止跟随，回到底部按钮恢复跟随。

## 检查与验收

```bash
pnpm check
pnpm verify:chat-ui
pnpm run pack --config.mac.identity=null
DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly pnpm verify:chat-ui
```

verify:chat 已纳入 check，使用真实 Electron ABI/SQLite Worker、注入 HTTP 响应与受保护引用替身，检查回合原子性、归属/取消、历史授权、错误、Key 分片回显保护、分页、重启和迁移。verify:chat-ui 使用实际 Electron 和 loopback HTTP，不使用用户 Key，检查真实输入/流式/切换/取消/分页/滚动/恢复。它们都是本地验证。

LOG-039 的隔离开发构建曾返回 CREDENTIAL。LOG-041 使用正常包内身份，在独立临时资料和空项目中复用选定 Provider 的元数据与密文，通过 Main 的 safeStorage 解密，完成真实验收；原资料未迁移或改写，Key 未进入 Renderer/日志。此结果不保证任意系统/构建身份可复用密文；真实接口检查为手动单次验收，不加入 CI。

- [X] 选择火山方舟 / chat-completions / deepseek-v4-1-flash-261017，发送固定标记请求，收到真实文本流。
- [X] 退出重启，原消息仍在，继续询问前一轮标记，回复匹配；持久化共 4 条用户/助手消息。
- [X] LOG-041 仅记录协议、模型、时间、字段类型与结果，不记录 Key、Authorization 或原始响应正文。

阶段 3、4 的真实验收已有独立通过证据。阶段 5 的只读 Agent 另有真实项目样例闭环（LOG-043），见 [只读 Agent](./read-only-agent.md)；普通聊天仍不执行工具。Windows、远端 CI、签名和发行仍单独验收。

## 火山方舟流式兼容修正（LOG-041）

“测试连接”发送非流式请求，只证明文本连接可用。聊天发送 stream=true；2026-11-22 实测火山方舟的中间帧带 reasoning_content/content，但省略 finish_reason，最后一帧才提供 stop，随后发送 [DONE]。旧解析器将中间帧误判为 INVALID_RESPONSE，导致未显示正文即失败。

现在仅允许流式中间帧省略 finish_reason，将其视为继续接收；非流式响应仍要求结束原因。流式必须先收到明确结束原因，再收到 [DONE]；缺少终态、断流、非法字段类型、终态后追加正文仍会失败。reasoning_content 不混入正文或发送到后续普通聊天历史。回归同时覆盖 null 与省略形式，工具参数和多调用组装仍保留校验。

阶段 5 的持久化升级到 SQLite v6（v5 工具 payload/顺序和 agent_info；v6 通用聊天 managed 归属），见 read-only-agent.md。普通聊天保持既有仅文本历史策略；首次发送也可自动建立通用会话，内部归属不列入项目区，不能用于文件工具。
