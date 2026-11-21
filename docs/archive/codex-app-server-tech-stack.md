# 历史方案：Codex App Server 优先路线

> 本文为目标澄清前的历史快照，已由当前文档替代，不作为后续执行依据。

# Devly 技术选型与实现方式

本文为首版技术基线，配合 [详细架构设计](../architecture.md) 使用。工程已初始化并安装依赖，具体版本和本机验证结果见 [搭建记录](../setup.md)；本文中各模块的目标职责不代表相关业务已经全部实现。

## 1. 核心方案

**Electron + React + TypeScript + electron-vite + AI Elements（elements.ai-sdk.dev）+ 配套 shadcn/ui + Tailwind CSS + Lucide React + Zustand + Codex App Server。**

按用户确认，UI 与 AI 业务界面以 [AI Elements](https://elements.ai-sdk.dev/components/commit) 这套组件为主，按需引入原组件源码，包括 Commit、Conversation、Message、Tool 等。按钮、弹窗、菜单等使用 AI Elements 配套的 shadcn/ui 基础组件。Codex 事件与 UI 状态之间保留适配层。

## 2. 组件和工程选型

| 层级或功能 | 选择 | 实现方式与边界 |
| --- | --- | --- |
| 桌面容器 | Electron | 主进程管理窗口、系统能力及受控服务，Renderer 负责界面 |
| 前端 | React + TypeScript | 函数组件，开启严格类型检查 |
| 开发与构建 | electron-vite | 管理 main、preload、renderer 的构建与开发流程 |
| 包管理 | pnpm | 提交锁文件，CI 使用冻结锁文件安装 |
| 通用 UI | AI Elements 配套的 shadcn/ui 基础组件 | 与实际引入的 AI Elements 源码保持一致，按需引入并在项目内维护 |
| 样式 | Tailwind CSS，优先采用 v4 兼容组合 | 配合 CSS 变量统一主题，具体版本随工程兼容性验证锁定 |
| 图标 | lucide-react | 按名称静态导入；统一尺寸、线宽和按钮可访问名称 |
| AI 业务组件 | elements.ai-sdk.dev 的 AI Elements | 直接复用所选组件源码，Devly 封装业务适配；使用原 Commit 组件展示提交 |
| 提示消息 | Sonner | 短暂成功、失败反馈；审批和任务结果保留在任务界面 |
| 多面板布局 | react-resizable-panels | 侧栏、对话、编辑器、底部终端可调整尺寸，保存布局偏好 |
| 前端状态 | Zustand | 按项目、会话、布局拆分 store；组件选择性订阅 |
| 参数校验 | Zod | 在主进程校验 IPC 输入；跨进程类型来自共享契约 |
| Markdown | react-markdown + remark-gfm + rehype-sanitize | 用于正文；默认不解析原始 HTML，限制链接协议与外部资源加载 |
| 代码与差异 | monaco-editor + @monaco-editor/react | 按需加载编辑器；Monaco 资源和 Worker 本地打包 |
| 交互式终端 | @xterm/xterm + @xterm/addon-fit + node-pty | Renderer 绘制终端；受控后台服务管理 PTY、工作目录和生命周期 |
| 长列表 | @tanstack/react-virtual | 优先用于大量会话和工具记录；长消息列表在需要时接入并处理动态高度 |
| Agent 引擎 | Codex App Server | 主进程管理子进程，通过 stdio 协议适配，不重复执行工具事件 |
| Git | Git CLI + Node child_process.spawn | 参数数组调用，解析结构化或适合机器读取的输出，管理进程取消 |
| 文件服务 | Node fs/promises | 路径校验、按需读取、写入前版本检查；文件监听变化需重新核对实际内容 |
| 本地数据库 | SQLite + better-sqlite3 | Repository 层隔离 SQL，使用版本化 SQL 迁移；数据库访问集中到后台 Worker |
| 日志 | electron-log | 主进程和后台任务日志，设置大小、保留周期和敏感信息过滤 |
| 打包分发 | electron-builder 稳定版 | macOS、Windows、Linux 分别构建验证，按需配置签名与公证 |
| 单元与组件测试 | Vitest + React Testing Library | 覆盖协议映射、状态流转和审批交互等行为 |
| 桌面流程验证 | Playwright Electron 支持 + 安装包人工验证 | Electron 自动化接口为实验性能力；原生菜单、终端和安装包另行验证 |
| 格式与静态检查 | ESLint + Prettier + tsc | 分别检查 main、preload、renderer 的依赖边界和类型 |

上述是库的职责选择，不是已经验证可直接组合安装的版本清单。Electron 内置 Node.js 与开发机 Node.js 版本不同，原生模块需要匹配目标 Electron ABI。

## 3. UI 分层与组件职责

### 通用组件层

位置建议为 `src/renderer/src/components/ui/`，维护生成后的 shadcn/ui 组件源码。

- Button、Input、Textarea：按钮、设置字段和基础输入。
- Dialog、AlertDialog：设置窗口和需要明确决定的操作。
- DropdownMenu、ContextMenu：项目、文件、会话和消息操作菜单。
- Tooltip、Popover：提示和辅助操作。
- Tabs、ScrollArea、Collapsible：编辑器标签、滚动区域和折叠内容。
- Command：项目内命令和快捷操作入口，按需引入相关依赖。

shadcn/ui 同时存在不同基础组件路线；本项目以实际引入的 AI Elements 源码依赖为准，保持配套版本和配置一致。基础组件路线不匹配时进行明确适配，不将迁移后的界面模式自动替代用户指定的 AI Elements 组件。

### AI 业务组件层

位置建议为 `src/renderer/src/features/chat/components/`，由通用组件与实际 Agent 数据组合实现。

| 组件 | 职责 |
| --- | --- |
| ConversationView | 会话容器、历史分页、滚动位置和新消息提示 |
| MessageItem | 用户、助手消息，以及结构化内容分段 |
| PromptComposer | 多行输入、附件、提交、执行中输入策略和停止按钮 |
| AgentProgress | 展示引擎提供的进度或摘要；不把加载动画当作模型真实思考内容 |
| ToolCallCard | 工具名称、参数摘要、执行状态、输出与错误 |
| ApprovalCard | 操作内容、权限范围、请求归属、允许或拒绝及提交状态 |
| PlanView | 引擎实际返回的计划和步骤状态 |
| ChangedFiles | 修改文件列表、差异入口及变更归属 |
| VerificationResult | 实际测试命令、退出码、输出和未验证项 |

从 [AI Elements](https://elements.ai-sdk.dev/docs) 按需引入原组件源码，建议保存在 `src/renderer/src/components/ai-elements/`；上表业务组件负责组合和接入实际数据。组件代码归项目维护；组件名称、属性和依赖以所选版本为准。

这些组件不直接连接模型或执行工具，数据来源是 `Codex 事件 → 引擎适配器 → 应用事件 → Zustand 投影 → React 组件`。

### 主题与图标规范

- 使用语义化 CSS 变量统一背景、文字、边框、主色、警告和错误色，支持明亮、暗色及跟随系统。
- 桌面工具采用紧凑密度，菜单、输入框和消息卡片保持一致；代码编辑器、终端与应用主题同步。
- 操作图标统一使用 Lucide React。首版文件树也可使用同一套图标，后续需要语言专用图标时再单独评估。
- 图标按钮提供可访问名称；图标不代替必要的操作文字。
- 模型或品牌 Logo 作为单独的品牌资源管理，Lucide 不能替代所有品牌标识。

## 4. 其他 AI 产品与专用组件方案

### 公开产品的参考选型

以下仅依据查阅时公开仓库或官方文档，依赖存在不代表每个页面都使用同一套组件。

| 产品 | 可核实的 UI 相关依赖 | 参考价值与来源 |
| --- | --- | --- |
| LibreChat | React、Radix UI、Ariakit、Headless UI、Lucide React；自有组件包 | 对话产品会组合通用组件与业务组件，见 [前端依赖](https://github.com/LibreChat-AI/LibreChat/blob/main/client/package.json) 和 [组件文档](https://www.librechat.ai/docs/development/components) |
| Open WebUI | Svelte / SvelteKit、Tailwind CSS、Bits UI | 使用另一套前端生态实现 AI 界面，见 [仓库依赖](https://github.com/open-webui/open-webui/blob/main/package.json) |
| LobeHub | @lobehub/ui、@lobehub/icons | 维护自己的组件和图标体系，见 [仓库依赖](https://github.com/lobehub/lobehub/blob/main/package.json) |

不根据界面外观推断 ChatGPT、Claude 等闭源产品的完整组件栈，也不把开源仿制界面的组件选择当成原产品的实现证据。

### AI 专用组件方案对比

| 方案 | 提供什么 | 对 Devly 的取舍 |
| --- | --- | --- |
| shadcn AI Elements | 迁移后基于 shadcn/ui 组合的消息、工具、计划、审批等界面模式 | 作为迁移资料保留，当前不替换用户选定的原 AI Elements 组件 |
| Vercel AI Elements（elements.ai-sdk.dev） | 基于 shadcn/ui 的 AI 界面组件与自定义 registry，与 AI SDK 有配套示例 | 用户确认采用的方案；按需引入源码并锁定依赖，包含原 Commit 等组件 |
| assistant-ui | 对话组件与前端 Runtime，支持外部状态存储适配 | 可替代自建对话交互层；需要映射 Codex 消息、状态、取消和工具结果，不是 Agent 执行引擎 |
| Ant Design X | Ant Design 体系下的 AI 交互组件和配套能力 | 适合采用 Ant Design 的 AI 产品；当前采用 AI Elements 及配套基础组件 |

来源：[shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements)、[Vercel AI Elements](https://elements.ai-sdk.dev/docs)、[assistant-ui 外部状态适配](https://www.assistant-ui.com/docs/runtimes/custom/external-store)、[Ant Design X](https://x.ant.design/)。

当前确定采用 **用户指定的 AI Elements + 配套 shadcn/ui 基础组件 + Devly 自己的事件状态适配**。assistant-ui 等方案仅作为比较资料，不纳入首版。

### AI Elements 对 Devly 的覆盖映射

用户指定的 [Commit 组件](https://elements.ai-sdk.dev/components/commit) 用于 Git 提交展示，包含 hash 复制、作者、时间、文件状态及增删行数。整套 AI Elements 也覆盖对话、代码工具、语音和工作流，作为 Devly AI 业务界面的主要组件来源，按产品实际范围引入。

| Devly 场景 | 选用的 AI Elements 组件 | 采用方式与职责 |
| --- | --- | --- |
| 对话与输入 | Conversation、Message、Prompt Input、Attachments | 采用用户指定站点提供的组件，适配本地会话和 IPC |
| 工具执行 | Tool、Task、Plan、Reasoning | 展示引擎提供的工具状态、计划和摘要，业务状态仍由 Codex 事件决定 |
| 权限审批 | Confirmation | 接入真实审批请求 ID、授权范围与响应处理 |
| Git 提交 | Commit | 采用原 Commit 组件，数据来自 Git 服务 |
| 修改文件 | File Tree、Code Block | 展示文件清单和代码片段；可编辑代码与完整 Diff 继续使用 Monaco |
| 执行日志 | Terminal | 展示 ANSI 日志和流式输出；交互式终端继续采用 xterm.js + node-pty |
| 测试与错误 | Test Results、Stack Trace | 展示实际验证结果、退出码与错误定位 |
| 上下文与队列 | Context、Queue、Checkpoint | 按引擎实际能力展示；检查点恢复需要运行时和文件快照支持 |

**上游状态（2026-11-21 核对）：** [原项目文档](https://elements.ai-sdk.dev/docs) 已公告 AI Elements 正迁移到 shadcn/ui，并计划在 2026 年 11 月底弃用原项目，官方推荐新项目采用迁移后的方案。这是上游维护信息；Devly 当前按用户选择采用原组件源码并自行维护，保留 Commit 等原有组件，不据此自动改换选型。引入时记录源码版本和依赖版本，后续如需迁移再单独决定。

这些 UI 组件与底层执行能力分开集成。原 Tool 的属性使用 AI SDK 的 `ToolUIPart` 类型，接入 Codex 时需要状态映射或调整本地组件契约；无需仅为复用展示组件就把执行引擎改成 AI SDK。原 Terminal 是输出展示组件，其文档未提供 PTY 会话管理能力；Commit 展示提交信息，Git 查询和提交操作仍由主进程服务实现。

## 5. 进程与打包实现约束

1. Renderer 保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，通过受限 preload API 访问系统能力。Electron Renderer 沙箱不等于 Agent 命令执行沙箱。
2. Preload 仅暴露明确的业务方法和订阅接口，不暴露原始 ipcRenderer；订阅返回清理函数，避免切换会话后残留监听器。
3. Zod Schema 或等价契约放在 shared 层；主进程必须执行输入校验，不能把 TypeScript 类型当作运行时验证。
4. Codex App Server 是独立子进程；适配器可以位于主进程服务中。普通应用元数据和设置通过受控服务读写。
5. better-sqlite3 在专用 Worker 中集中访问，避免同步查询阻塞 Electron 主事件循环；SQLite 和 node-pty 按目标平台、架构与 Electron ABI 重建并验证打包资源。
6. Monaco 及其 Worker 随应用本地打包；不依赖默认 CDN 加载。首版支持编辑与 Diff，完整语言服务、调试器和 VS Code 扩展兼容性属于额外能力。
7. Codex 二进制位置、版本检测与认证失败提示需要明确实现。首版优先使用用户已安装的兼容 Codex，并支持选择路径；随安装包分发需另做平台资源、版本更新与分发条件评估。
8. 原生依赖和 Codex 可执行文件需要正确处理 ASAR 内外的资源位置，目标系统上验证执行权限和进程启动。
9. 流式消息分批更新，避免每个字符触发整个会话重渲染；Git、文件和命令日志按需读取，长日志落盘并限制界面保留长度。
10. 首版保持本地桌面架构，使用 IPC 连接本地能力。云同步、远程执行、团队协作和自动更新在相应需求确定后再增加服务。

## 6. 版本锁定与验证

- 初始化时检查 Electron、electron-vite、React、Tailwind 和所选 shadcn 组件的兼容性，选择稳定版本并提交 pnpm 锁文件。
- AI Elements 与配套 shadcn 组件作为项目源码维护，记录来源版本、基础组件路线和主题配置；后续更新需要审查代码差异。
- 新增原生依赖后，在目标 Electron 中验证加载，并对最终安装包进行测试；开发环境能运行不代表安装包可用。
- 针对 Codex 版本运行协议握手、创建会话、流式事件、审批、中断和恢复验证，再声明该版本兼容。
- 已完成本机安装、基础桌面启动、原生模块和 macOS 应用目录打包验证；完整产品能力与目标平台验收仍按开发计划推进。

## 7. 主要官方资料

- [electron-vite](https://electron-vite.org/guide/)：main、preload、renderer 的构建方式。
- [shadcn/ui Vite 安装](https://ui.shadcn.com/docs/installation/vite)：UI 工程接入。
- [Lucide React](https://lucide.dev/guide/react/)：图标组件。
- [Zustand](https://github.com/pmndrs/zustand)：前端状态管理。
- [Zod](https://zod.dev/)：Schema 与运行时校验。
- [Sonner](https://sonner.emilkowal.ski/)：短暂提示。
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)：可调整布局。
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)：长列表虚拟化。
- [Monaco React](https://github.com/suren-atoyan/monaco-react)：编辑器接入与本地资源加载。
- [xterm.js](https://xtermjs.org/docs/guides/using-addons/) 与 [node-pty](https://github.com/microsoft/node-pty)：终端渲染与 PTY。
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)：SQLite 访问。
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)：进程边界与 IPC。
- [electron-builder](https://www.electron.build/)：打包分发，使用所选稳定版本对应文档。
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)：桌面流程自动化接口及其限制。
