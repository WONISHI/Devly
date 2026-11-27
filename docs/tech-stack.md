# Devly 技术选型与实现方式

用户已明确：做具备 Codex 类似能力、可直接接入第三方 API 的桌面工具。当前状态与任务见 [工作总表](./work-plan.md)，历史的 Codex 优先选型见 [归档](./archive/codex-app-server-tech-stack.md)。

## 1. 已确认的核心方案

**Electron + React + TypeScript + electron-vite + 原 AI Elements（elements.ai-sdk.dev）+ 配套 shadcn/ui + Tailwind CSS + Lucide React + Zustand + 自研 Agent + Provider 适配层。**

Codex App Server 不再是主引擎或安装前提；目前的 CLI 检测和握手脚本只是已完成的技术储备。软件应在不安装 Codex 的机器上通过用户自己的第三方 API 工作。

## 2. 技术选择与实现状态

| 功能                    | 选择                                                            | 当前实现与边界                                                                                                                                |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面与构建              | Electron / React / TypeScript / electron-vite / pnpm / Volta    | main/preload/renderer/shared 分层，工具与锁文件固定；当前 macOS ARM64                                                                         |
| AI 组件                 | 用户指定原 AI Elements                                          | PromptInput/Conversation/Message/Tool/ModelSelector、Confirmation/Plan/Task、真实 Commit 和 Terminal/Test Results/Stack Trace；来源 35 份校验 |
| 基础 UI / 样式 / 图标   | 配套 shadcn/ui / Radix / Tailwind / Lucide                      | 业务复用 components/ui；固定窗口与 ScrollArea；品牌 v5 不变                                                                                   |
| 状态与面板              | Zustand / react-resizable-panels                                | 项目、聊天、编辑缓冲区、终端视图和项目布局；只有明确持久化字段跨重启保存                                                                      |
| 通知与正文              | Sonner / 原 Message 的 Streamdown 及配套插件                    | 真实状态/错误展示；审批与执行结果保存在历史，不只依赖 toast                                                                                   |
| 校验                    | Zod + 共享契约                                                  | IPC 来源、归属、参数、Provider、工具/审批、编辑/Git/PTY/布局运行时校验                                                                        |
| 代码与 Diff             | Monaco 0.52.2 / @monaco-editor/react 4.7.0                      | 本地 Worker、模型/标签、保存冲突与实际 Diff；仅已打开模型基础语言服务                                                                         |
| 用户终端                | xterm 5.5.0 / fit 0.10.0 / node-pty 1.1.0                       | 实际输入/resize/Ctrl+C/多终端与清理；受限系统 Shell，无个人工具链和网络                                                                       |
| Agent 日志              | 原 Terminal / ansi-to-react 6.2.6                               | 只读实际执行输出；严格 TAP 测试与真实堆栈定位；未知报告不称测试通过                                                                           |
| 数据                    | better-sqlite3 / worker_threads / SQL 迁移                      | userData SQLite Worker v15；新增项目上下文、worktree/父子关系、MCP 引用与 Skill 哈希，事务迁移与去秘密备份                                                                 |
| 凭据                    | Main / Electron safeStorage                                     | DB 只存引用，密文单独受保护保存，系统保护不可用拒绝，不回传保存后明文                                                                         |
| Agent                   | 自研本地运行时                                                  | 模型/工具循环、macOS 审批执行、4 并发队列与有界父子任务；重启核对后新只读继续，不重放旧副作用                                                             |
| 主协议                  | ProviderAdapter / Main 原生 fetch / Chat Completions            | 非流式/SSE/工具归一化、错误生命周期、能力诊断；指定真实端点已验证，不推广所有模型                                                             |
| 其他协议                | Responses / Anthropic Messages 独立适配                         | 阶段 9 独立适配和本地协议验证已接入；真实端点待联调，无新增 SDK                                                                                           |
| Git                     | Node child_process / 系统 Git CLI                               | 只读基线/Diff、真实第一父历史、审查后的暂存/本地提交、安全分支；无自动推送                                                                    |
| 文件与命令              | 路径/版本校验 / 单修改队列 / macOS Seatbelt                     | 项目内受限执行；cwd/worktree 不是沙箱，Windows 约束待 T12                                                                                     |
| MCP / Skills / 多 Agent | 官方 MCP Client 2.4.0 / Ajv 8.20.0 / 自研队列与预算 | Streamable HTTP 实际服务、显式 Skill 与资源、两子任务隔离/继承/取消；本机验收边界见 task-extensions.md                                                                                       |
| 日志                    | electron-log / 脱敏结构化记录 / blob 引用                       | 输出截断、原始日志读取、实际退出与审批历史；阶段 9 增加白名单诊断、备份及核对恢复                                                                             |
| 分发与检查              | electron-builder / TS / ESLint / Prettier / Vitest / Playwright | 167 项常规检查通过、3 项主机检查默认跳过；扩展原生/窗口与包内证据见阶段 10/11 日志；未签名目录不是正式发行                                     |

## 3. Provider 配置契约

每个 Provider 保存名称、协议、Base URL、凭据引用、模型 ID 和显式配置。是否追加路径、是否支持模型列表、工具调用、视觉、结构化输出等由具体适配器确认，不能假定所有地址都按同一路由响应。

- 用户手工填写模型 ID 作为模型列表不可用时的正常入口。
- 设置界面提交 Key 后，保存结果只返回掩码和状态；不向 Renderer 返回已保存的明文。
- Provider 连接测试与模型能力测试分开，文本测试通过不能证明编程 Agent 可用。
- 认证、限流、超时、服务失败、流损坏与用户取消有不同状态。
- 模型发出完整工具调用后由本地执行器校验和执行，再回传真实结果。
- 不自动切换供应商或把旧项目上下文发送给未选端点；未知用量和费用保留为空。
- 首先完成一个兼容端点的真实编程任务，再扩展协议覆盖；每个已验证组合记录协议、模型和日期。

## 4. 原 AI Elements 的使用方式

| Devly 界面           | 原组件                                           | 接入要求                                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| 对话、输入、附件     | Conversation、Message、Prompt Input、Attachments | 来自 Devly 会话/消息，不依赖某家 API 的历史 ID                |
| 工具过程             | Tool、Task、Plan、Reasoning                      | 将自研 Agent 事件映射到组件契约，展示可获得的真实摘要         |
| 审批                 | Confirmation                                     | 对应自己的审批 ID、操作范围和生命周期                         |
| 提交历史             | Commit                                           | 业务面板来自真实 Git；开发者预览的演示数据明确标记            |
| 文件和代码           | File Tree、Code Block                            | 编辑和完整 Diff 仍由 Monaco 承担                              |
| 命令与测试           | Terminal、Test Results、Stack Trace              | 原 Terminal 是日志展示，不代替交互式 PTY                      |
| 上下文、队列与检查点 | Context、Queue、Checkpoint                       | 需要 Devly 的预算、调度和快照支持，不因组件存在而自动具备功能 |

按需引入原源码并记录依赖，组件保存在 `src/renderer/src/components/ai-elements/`，业务组件放在各 feature 目录。当前来源版本见 [SOURCE](../src/renderer/src/components/ai-elements/SOURCE.md)。

上游已公告原项目迁移至 shadcn/ui；本项目仍按用户明确选择使用原组件源码维护，不自动替换 Commit 等组件。[原库文档](https://elements.ai-sdk.dev/docs)

## 5. 进程与发行约束

1. Renderer 禁用 Node 集成并启用隔离/沙箱，只通过受限 preload 访问本地能力。
2. IPC 在主进程校验来源、Schema 和任务归属，订阅可清理；TypeScript 类型不是运行时验证。
3. API 网络请求和秘密只在主进程或受控后台，命令进程的环境变量需要单独过滤。
4. 数据库同步查询集中到 Worker，避免阻塞主窗口；Agent 长任务有独立生命周期和取消链。
5. SQLite、PTY 按 Electron ABI 和目标架构重建；Monaco 及 Worker 本地打包，不依赖 CDN。
6. macOS 与 Windows 分别验证，源码跨平台不能代替真实运行。当前 PNG/ICNS 已接入运行时与打包资源，Windows 图标仍需目标构建验证。
7. 新 API SDK、MCP、浏览器或调度依赖在对应任务实施时安装，不提前把选择写成已经完成。
8. 正式发行前复核维护版本、原生兼容性、秘密边界、签名与迁移。当前开发版本不声称已满足正式发布条件。

## 6. 参考

- [OpenAI Node SDK](https://github.com/openai/openai-node)：客户端与 API 调用基础，第三方端点仍需逐个验证。
- [Function Calling](https://developers.openai.com/api/docs/guides/function-calling)：客户端执行工具的闭环。
- [Claude Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)：原生内容块与工具调用适配依据。
- [AI Elements Commit](https://elements.ai-sdk.dev/components/commit)：原提交组件。
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[electron-vite](https://electron-vite.org/guide/) 与 [electron-builder](https://www.electron.build/)：桌面进程、构建与分发。

## 阶段 1 依赖复核（2026-11-21）

当前锁定版本的维护状态、许可证与来源以 [V01 评估](./dependency-review.md) 为准。本轮仅将误发的 jest-dom 6.10.0 固定为 6.9.1；Electron 39、ESLint 9 仍属失维护版本，未进行全面主版本升级，不可将工程检查通过解释为可正式发行。通信层已使用统一 v1 契约、错误 DTO 和带清理的事件接口，见 [B02](./ipc-contracts.md)；自动检查与 CI 计划见 [B04](./quality-checks.md)。

B03 已将工作台迁移为 Provider/Devly Agent 概念，并提供明确待接入状态的设置入口。正常启动不探测 Codex，无需 ChatGPT 登录；原握手脚本独立保留，不代表第三方 API 或 Agent 已实现。见 [产品入口与验证](./provider-entry.md)。

阶段 3 已把该入口接入供应商 CRUD、受保护凭据操作、Main 原生 fetch Chat Completions 适配与连接/能力检查，不增加 SDK 依赖；原握手脚本仍不参与主路线。本地实现与阶段 3–5 指定真实端点验收已通过；范围不扩大到其他供应商，见 [Provider API](./provider-api.md)。

阶段 2 使用现有 better-sqlite3 和 Node worker_threads，不增加数据库或凭据依赖；Electron 39 的 safeStorage 由 Main 使用，密文落盘且 DB 只存 UUID 引用，缺少安全后端时拒绝保存。详见 [本地数据架构](./local-data.md)。

阶段 6 的原 Confirmation/Plan/Task/Shimmer 与 Alert/Card 沿用同一固定提交。新增 motion 12.42.0（MIT，React 18/19 peer），原组件校验扩展至 32 个文件；命令/补丁采用 macOS Seatbelt 子进程，非工作目录伪隔离。具体能力限制见 [执行与审批](./execution-foundation.md)。

阶段 8：原 Terminal/Test Results/Stack Trace 仍取同一固定来源，新增 ansi-to-react 6.2.6 与显式 Radix use-controllable-state 1.3.0。xterm 与 PTY 从技术储备接入实际桌面业务，主题与布局有开发/包内证据。ansi-to-react 仅包元数据声明 BSD-3-Clause，缺完整上游权利人通知，正式发行前必须补全，不能用标准模板代替。详细契约、系统边界、快捷键和依赖核对见 [工作台说明](./git-and-terminal.md) 与 [依赖评估](./dependency-review.md)。

阶段 9 沿用原生 fetch、Zod、SQLite Worker 和已有 TanStack Virtual，不增加依赖；数据库仍 v8。独立协议、短时推理延续、事件去重与状态核对、generation 恢复、配置白名单和测量边界见 [稳定性说明](./stability-and-recovery.md)。

## 阶段 10 依赖与边界

新增精确固定 @modelcontextprotocol/client 2.4.0、ajv 8.20.0；官方测试服务 @modelcontextprotocol/server 2.4.0 为 devDependency。SDK 只在 Main 使用，JSON Schema 校验放在有内存/时限的 Worker；Renderer 无客户端秘密。原 AI/UI 来源清单仍为 35 份，没有换库。SDK v2 为 Apache-2.0，Ajv 为 MIT，相关实际通知随 resources/vendor/stage10-* 打包；见 [依赖评估](./dependency-review.md)。

项目记录/所选 Skill 不是扩权；MCP 也不受本机文件沙箱保证。worktree 使用实际系统 Git、固定参数和 ff-only，父子 Agent 没有任意供应商/递归/自动合并入口。完整当前实现与限制见 [扩展说明](./task-extensions.md)。阶段 9 节中的 v8 是当时版本，当前链已追加至 v15。

## 阶段 11 的新增实现

HTML 使用精确 parse5 8.1.1（MIT）在有界 Worker 解析；现有 Electron Session/BrowserWindow/CDP 与 Main 私有认证代理实现受控浏览器及静态预览，没有额外浏览器 SDK。现有 shadcn 表单与原 Prompt Input/Tool/Confirmation 接真实附件/审批，未改原组件来源。调度用 Main 定时器、powerMonitor/Notification 和 SQLite v15，不新增系统 daemon 或云服务。详见[网页扩展说明](./web-and-automation.md)。

## 阶段 12 预览收口

版本 0.2.0-preview.1 使用原选型与品牌 v5；KaTeX 0.18.2 显式本地 CSS/字体，linkify-it 定向锁到 5.0.2，实际渲染安全检查通过。Main 延迟加载 PTY，非 macOS 写入/命令/终端明确拒绝。当前 ARM64 DMG 实际复制安装与升级通过，Windows/正式签名/维护主版本升级仍未通过；详见[发行验收](./release-acceptance.md)。
