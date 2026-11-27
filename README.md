# Devly

支持第三方模型 API 的本地桌面 AI 编程工作台，目标对齐 Codex 类似的编程与任务交互能力。采用 Electron、React、TypeScript、原版 AI Elements、Tailwind CSS、Lucide React 与 Zustand；主路线为自研 Agent 与 Provider 适配层。

当前已接入 **独立聊天、跨项目最近聊天、新建项目、只读/项目 Agent、逐次审批、停止、历史、本地 Monaco 编辑与实际 Diff**。macOS 项目 Agent 支持版本检查的文件替换、受限命令与 Git 基线；权限设置选择“每次询问”且系统预检通过后可用，本地命令不开放目录外访问与网络；阶段 10 的显式 MCP 外部工具走独立审批。阶段 7 已通过指定火山方舟 DeepSeek 模型的真实搜索→读取→审批修改→审批测试→Monaco Diff 样例（LOG-051），不代表其他模型或平台自动兼容。页头“项目文件/项目更改”打开编辑区，支持文件标签、保存、外部变更冲突及未保存提示，见 [编辑器与 Diff](./docs/editor-and-diff.md) 和 [执行边界](./docs/execution-foundation.md)。阶段 8 已接入真实 Git 历史、审查后的暂存/本地提交、分支保护、受限交互终端、实际测试/堆栈、主题和持久布局，见 [Git 与终端工作台](./docs/git-and-terminal.md)。设置的“用量与额度”提供真实 Token、本地预算与已适配的账户余额，见 [用量说明](./docs/usage-and-budget.md)。更多见 [只读 Agent](./docs/read-only-agent.md)、[聊天](./docs/chat.md)、[Provider API](./docs/provider-api.md) 和 [本地数据](./docs/local-data.md)。

阶段 9 新增 Responses / Anthropic Messages 独立适配、数据备份与下次启动恢复、核对后只读继续、配置导入导出、诊断与长历史虚拟化。新协议真实端点按用户安排另行联调，当前是本地协议验证；使用说明见 [恢复与稳定性](./docs/stability-and-recovery.md)、[供应商矩阵](./docs/provider-matrix.md)。

阶段 10 已实现项目指令/记忆、4 并发任务队列、受审查的 worktree、父子 Agent、真实 MCP Streamable HTTP 与项目 Skills。设置新增“项目上下文 / 任务与隔离 / MCP 工具 / Skills”独立组；多 Agent 默认关闭、显式开启后仍逐次审批，子任务使用独立文件与日志，不自动合并。详见 [多任务与扩展](./docs/task-extensions.md)。当前本地模型夹具验收不代替新供应商真实联调，Windows 与正式发行仍待后续。

阶段 11 已接入受限文本/图片附件、独立搜索/抓取、隔离静态网页预览、逐次审批浏览器与真实截图，以及默认停用的只读本地定时任务。代码和当前 macOS 本地/未签名应用内验收完成；真实搜索端点按用户安排另行联调，未推广为任意服务兼容。详见 [附件、网页与本地自动化](./docs/web-and-automation.md)。

## 启动

工具版本：开发机 Node.js `24.7.0`，pnpm `10.34.9`。package.json 中的 Volta 配置会在项目目录中选择该版本。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

已安装依赖的当前工作区可直接运行 `pnpm dev`。安装过程会通过 electron-builder 为目标 Electron 重建原生模块；不同系统和架构需要分别安装验证，不复制已有 node_modules 跨平台使用。

## 常用命令

| 命令                             | 作用                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                       | 启动 Electron 开发应用                                        |
| `pnpm build`                     | 类型检查并构建 main、preload、renderer                        |
| `pnpm start`                     | 启动构建产物                                                  |
| `pnpm check`                     | 统一运行类型、Lint、格式、关键测试、文档、原组件与生产构建    |
| `pnpm audit:dependencies`        | 生成本机安装依赖与许可证清单                                  |
| `pnpm verify:usage-ui`           | 隔离验证用量、预算与重启界面                                  |
| `pnpm verify:vendor`             | 离线核对原 AI Elements/UI 来源哈希                            |
| `pnpm typecheck`                 | TypeScript 检查                                               |
| `pnpm lint`                      | ESLint 检查                                                   |
| `pnpm test`                      | 基础契约测试                                                  |
| `pnpm format:check`              | 格式检查                                                      |
| `pnpm verify:no-codex`           | 在隔离 PATH 中验证无 Codex 启动与 Provider 入口               |
| `pnpm verify:data`               | Worker/SQLite 数据、迁移与存储集成检查                        |
| `pnpm verify:persistence`        | 真实桌面双项目重启、设置与系统凭据检查                        |
| `pnpm verify:provider`           | Electron 供应商界面与本地 HTTP 协议替身验证（非供应商实测）   |
| `pnpm verify:model-picker`       | 首页原版模型选择、搜索、重启与项目隔离，确认不发送 API 请求   |
| `pnpm verify:chat`               | SQLite/独立聊天运行时、取消/错误/上下文/迁移与恢复检查        |
| `pnpm verify:agent`              | SQLite/真实适配器的只读工具循环与预算集成（本地替身）         |
| `pnpm verify:agent-ui`           | 原 Tool、日志查看、取消、重启与只读模式桌面验收               |
| `pnpm verify:chat-ui`            | 实际输入、HTTP 文本流、会话隔离、分页、滚动与重启续聊         |
| `pnpm verify:agent`              | 真实适配器/SQLite Worker 的只读循环、工具边界、日志和预算检查 |
| `pnpm verify:agent-ui`           | 原 Tool 卡片、模式/范围、日志查看、取消和重启恢复             |
| `pnpm verify:icons`              | 357 个离线品牌 SVG、目录及 MIT 通知完整性检查                 |
| `pnpm verify:provider-icons`     | 图标匹配、深浅主题、包内资源加载与零外部请求检查              |
| `pnpm verify:native`             | 在 Electron Node 中验证 SQLite 和 PTY                         |
| `pnpm verify:editor`             | 实际文件/SQLite/隔离保存/外部冲突与 Git Diff 检查（macOS）    |
| `pnpm verify:editor-ui`          | 文件树/模型/保存/未保存提示/Diff/本地 Worker 桌面检查         |
| `pnpm verify:git-workspace`      | 临时真实 Git 仓库、提交/分支保护与布局重启检查（macOS）       |
| `pnpm verify:terminal`           | 实际 PTY、项目归属、Ctrl+C、输出限制与进程清理（macOS）       |
| `pnpm verify:workbench-host`     | 显式运行 Git 与既有执行隔离主机检查                           |
| `pnpm verify:workbench-ui`       | Git/xterm、跨项目、主题/布局/快捷键、最小窗口与重启           |
| `pnpm verify:results-ui`         | 实际 Python 测试、原日志/测试/堆栈及文件行定位                |
| `pnpm verify:editor-live`        | 显式指定既有 Provider 的真实 API 编程样例；受控项目、可能计费 |
| `node scripts/smoke-desktop.mjs` | 启动桌面应用，检查 IPC、目录选择和 AI 组件，生成截图          |
| `pnpm verify:stability-ui`       | 实际窗口的协议、错误入口、恢复审查、配置与备份重启            |
| `pnpm verify:performance-ui`     | 2000 条历史/大日志的实际窗口测量与虚拟化                      |
| `pnpm verify:extensions-ui`      | 原生窗口的 MCP/Skills/父子任务、工作区审查与重启（支持包内）  |
| `pnpm verify:multitask`          | 真实工作区、父子继承/预算/取消、并发锁和日志归属              |
| `pnpm verify:mcp`                | 官方 SDK 实际 HTTP 服务、审批、错误与派发后取消               |
| `pnpm verify:workspaces`         | 真实 worktree、审查/提交/快进/分叉及用户内容保护              |
| `pnpm run pack`                  | 构建当前平台应用目录                                          |
| `pnpm dist`                      | 构建当前平台安装包                                            |

## 目录

```text
src/main/                       Electron 主进程与受限 IPC
src/preload/                    contextBridge 业务接口
src/shared/                     共享类型与参数 Schema
src/renderer/src/               App 页面装配、状态与样式
src/renderer/src/app/           shell 与页头
src/renderer/src/features/      工作台、环境面板、原组件预览及 hooks
src/renderer/src/platform/      preload 桌面能力网关
src/renderer/src/components/ui/  配套 shadcn/ui 基础组件
src/renderer/src/components/ai-elements/  原版 AI Elements 源码与来源记录
scripts/                        原生模块与桌面运行检查
tests/                          基础测试
docs/                           架构、技术选型、实施计划和搭建记录
```

首页使用原版 AI Elements ModelSelector 选择已保存模型，支持按模型/供应商搜索；无项目时保存应用默认值，有项目时保存该项目默认值，重启保留。选择器提供供应商管理入口，侧栏设置仍可管理配置；环境检查和原 AI 组件预览收进开发者选项。供应商连接诊断、普通聊天、只读 Agent 与 macOS 逐次审批的项目执行已接入。正常启动不探测 Codex，不要求安装 Codex 或登录 ChatGPT；独立握手脚本保留为可选技术储备。见 [产品入口](./docs/provider-entry.md)。

后续按 [工作总表](./docs/work-plan.md) 推进，每项完成后在 [工作日志](./docs/work-log.md) 记录实现与验证；仓库执行约定见 [AGENTS.md](./AGENTS.md)。

参见 [文档入口](./docs/README.md)、[搭建与验证记录](./docs/setup.md) 和 [开发计划](./docs/development-plan.md)。

Renderer 的模块职责与检查范围见 [feature 边界](./docs/renderer-structure.md)。

桌面通信协议见 [B02 契约](./docs/ipc-contracts.md)，本地与双平台 CI 入口见 [B04 检查计划](./docs/quality-checks.md)，维护版本、许可证与发行阻断见 [V01 依赖评估](./docs/dependency-review.md)。

阶段 1–8 的当前 macOS 验收见日志；阶段 6 执行与审批见 LOG-047/LOG-048，阶段 7 编辑与真实编程样例见 LOG-049–LOG-051，阶段 8 工作台验收见 LOG-054–LOG-059。当前已生成并实际安装验证 macOS ARM64 **0.2.0-preview.1 未签名 DMG**；Windows、签名/公证、维护版本和完整外部服务验收仍未通过。见 [发行验收](./docs/release-acceptance.md)、[使用与排错](./docs/user-guide.md)、[版本说明](./docs/release-notes.md)。

供应商列表及模型选择器包含 357 个本地品牌 SVG，按域名、名称和模型系列识别，未知配置显示通用图标；不依赖远程图片。来源和匹配边界见 [供应商图标](./docs/provider-icons.md)。

设置按模型供应商、外观、默认模型、权限与限额、开发者分组，右侧只显示当前分类，切换保留未保存输入；偏好保存只提交当前分类，见 [设置分组说明](./docs/ui-components.md)。

项目执行检查：`pnpm verify:execution-host`（macOS 原生边界）、`pnpm verify:execution`（临时项目/SQLite/审批/命令/异常重启）、`pnpm verify:execution-ui`（桌面按钮与历史）。阶段 7 的开发/包内本地 Worker、保存和 Diff 检查与显式 A09 操作见编辑器说明；CI 只运行本地检查，不使用个人 Key 或自动请求第三方服务。

## 阶段 11 扩展

[附件、网页与本地自动化](./docs/web-and-automation.md) 记录当前实现和边界：受限文本/图片附件、独立搜索凭据及精确审批、隔离静态预览、每回合浏览器/真实截图、默认停用的本地只读定时任务。SQLite 追加至 v15；模型 Key 不进入 Renderer。网页容器不等于 OS 沙箱，搜索真实端点按用户确认另行联调，本轮视觉/模型响应使用本地协议夹具；最终验证状态见工作计划与日志。
