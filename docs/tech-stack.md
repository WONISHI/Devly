# Devly 技术选型与实现方式

用户已明确：做具备 Codex 类似能力、可直接接入第三方 API 的桌面工具。当前状态与任务见 [工作总表](./work-plan.md)，历史的 Codex 优先选型见 [归档](./archive/codex-app-server-tech-stack.md)。

## 1. 已确认的核心方案

**Electron + React + TypeScript + electron-vite + 原 AI Elements（elements.ai-sdk.dev）+ 配套 shadcn/ui + Tailwind CSS + Lucide React + Zustand + 自研 Agent + Provider 适配层。**

Codex App Server 不再是主引擎或安装前提；目前的 CLI 检测和握手脚本只是已完成的技术储备。软件应在不安装 Codex 的机器上通过用户自己的第三方 API 工作。

## 2. 技术选择与实现状态


| 功能           | 选择                                                                    | 当前状态与实现方式                                                                            |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 桌面与界面     | Electron、React、TypeScript                                             | 已建立 main/preload/renderer/shared；现有界面为基础暗色工作台                                 |
| 构建与包管理   | electron-vite、Vite、pnpm、Volta                                        | 已配置，依赖版本以锁文件为准                                                                  |
| AI 组件        | 用户指定的原 AI Elements                                                | 原 Conversation、Message、Tool、Commit、Code Block 已引入；业务尚未连接                       |
| 通用 UI        | 与原 AI Elements 同版本配套 shadcn/ui、Radix                            | 已按源码引入，不能自动替换为迁移后方案                                                        |
| 样式与图标     | Tailwind CSS、Lucide React                                              | 已接入；应用品牌用用户确认的图片，Dock 当前为 v5                                              |
| 状态管理       | Zustand                                                                 | 目前只有项目与页签内存状态，真实任务投影待实现                                                |
| 通知           | Sonner                                                                  | 已接入，审批与任务结果不只依赖短暂 toast                                                      |
| 面板与长列表   | react-resizable-panels、TanStack Virtual                                | 已安装，未形成完整布局或性能验收                                                              |
| 运行时校验     | Zod + 共享契约                                                          | 已用于路径契约；Provider、事件与工具契约待扩展                                                |
| Markdown       | react-markdown、remark-gfm、rehype-sanitize；原 Message 配套 Streamdown | 已安装；选定一条正文渲染路径并复核原始 HTML/链接/资源处理                                     |
| 代码与 Diff    | Monaco + React 封装                                                     | 已安装，Worker、本地资源、文件模型和业务待实现                                                |
| 交互终端       | xterm.js + addon-fit + node-pty                                         | 已安装，PTY 技术验证通过；交互界面与服务待实现                                                |
| 数据           | better-sqlite3 + SQLite Worker + SQL 迁移                               | 只验证了原生查询；数据库文件、Worker、表和 Repository 待实现                                  |
| 凭据           | Electron 主进程及系统保护存储                                           | 待实现；保护能力不可用时明确失败，不明文兜底                                                  |
| Agent          | 自研 Node 后台运行时                                                    | 待实现；负责上下文、工具循环、预算、审批、取消、恢复                                          |
| API 适配       | ProviderAdapter；优先 Chat Completions 兼容协议                         | 待实现；Base URL/Key/model 可配置；现有 ai 依赖不等于网络适配已完成                           |
| 其他协议       | Responses、Anthropic Messages 独立适配器                                | 待实现；每种协议单独验证流式与工具调用                                                        |
| HTTP 与 SDK    | 首个适配器优先评估 openai SDK，保留统一接口                             | 尚未声明 openai 或 Anthropic SDK 为直接依赖；实现任务时按需安装并锁版本，禁止在 Renderer 调用 |
| Git            | Node child_process 调 Git CLI                                           | 目前仅检测版本，真实 status/diff/log/提交待实现                                               |
| 命令与文件工具 | Node 文件 API、子进程、权限策略、OS 执行隔离                            | 待实现；工作目录与 worktree 不能代替沙箱                                                      |
| MCP/Skills     | 本地 MCP 客户端、Skills 资源与规则加载                                  | 待实现，由 Devly 接入，不依赖 Codex 提供执行循环                                              |
| 日志           | electron-log + 结构化工具日志                                           | 主进程日志已接入，业务日志与脱敏待完善                                                        |
| 分发           | electron-builder                                                        | 本机 macOS 未签名 .app 已生成；DMG、签名、Windows 仍待验证                                    |
| 检查           | TypeScript、ESLint、Prettier、Vitest、Playwright                        | 已配置；目前仅 1 项契约测试及基础桌面 smoke                                                   |

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
| 提交历史             | Commit                                           | 数据来自 Git 服务，当前演示数据不得视作真实提交               |
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

阶段 2 使用现有 better-sqlite3 和 Node worker_threads，不增加数据库或凭据依赖；Electron 39 的 safeStorage 由 Main 使用，密文落盘且 DB 只存 UUID 引用，缺少安全后端时拒绝保存。详见 [本地数据架构](./local-data.md)。
