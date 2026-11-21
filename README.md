# Devly

支持第三方模型 API 的本地桌面 AI 编程工作台，目标对齐 Codex 类似的编程与任务交互能力。采用 Electron、React、TypeScript、原版 AI Elements、Tailwind CSS、Lucide React 与 Zustand；主路线为自研 Agent 与 Provider 适配层。

当前已接入 **普通聊天、流式文本、停止/重新发送、会话模型绑定、历史分页与重启续聊**，并保留供应商配置/诊断、项目、设置与系统保护凭据。阶段 4 代码及本地 HTTP/桌面检查通过；隔离环境复用原受保护密钥返回 CREDENTIAL，真实端点尚待正常系统凭据环境验收。Agent、工具执行、审批、编辑器和终端业务仍未接入。见 [聊天说明](./docs/chat.md)、[Provider API](./docs/provider-api.md) 和 [本地数据](./docs/local-data.md)。

## 启动

工具版本：开发机 Node.js `24.7.0`，pnpm `10.34.9`。package.json 中的 Volta 配置会在项目目录中选择该版本。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

已安装依赖的当前工作区可直接运行 `pnpm dev`。安装过程会通过 electron-builder 为目标 Electron 重建原生模块；不同系统和架构需要分别安装验证，不复制已有 node_modules 跨平台使用。

## 常用命令

| 命令                             | 作用                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                       | 启动 Electron 开发应用                                      |
| `pnpm build`                     | 类型检查并构建 main、preload、renderer                      |
| `pnpm start`                     | 启动构建产物                                                |
| `pnpm check`                     | 统一运行类型、Lint、格式、关键测试、文档、原组件与生产构建  |
| `pnpm audit:dependencies`        | 生成本机安装依赖与许可证清单                                |
| `pnpm verify:vendor`             | 离线核对原 AI Elements/UI 来源哈希                          |
| `pnpm typecheck`                 | TypeScript 检查                                             |
| `pnpm lint`                      | ESLint 检查                                                 |
| `pnpm test`                      | 基础契约测试                                                |
| `pnpm format:check`              | 格式检查                                                    |
| `pnpm verify:no-codex`           | 在隔离 PATH 中验证无 Codex 启动与 Provider 入口             |
| `pnpm verify:data`               | Worker/SQLite 数据、迁移与存储集成检查                      |
| `pnpm verify:persistence`        | 真实桌面双项目重启、设置与系统凭据检查                      |
| `pnpm verify:provider`           | Electron 供应商界面与本地 HTTP 协议替身验证（非供应商实测） |
| `pnpm verify:model-picker`       | 首页原版模型选择、搜索、重启与项目隔离，确认不发送 API 请求 |
| `pnpm verify:chat`               | SQLite/独立聊天运行时、取消/错误/上下文/迁移与恢复检查      |
| `pnpm verify:chat-ui`            | 实际输入、HTTP 文本流、会话隔离、分页、滚动与重启续聊       |
| `pnpm verify:icons`              | 357 个离线品牌 SVG、目录及 MIT 通知完整性检查               |
| `pnpm verify:provider-icons`     | 图标匹配、深浅主题、包内资源加载与零外部请求检查            |
| `pnpm verify:native`             | 在 Electron Node 中验证 SQLite 和 PTY                       |
| `node scripts/smoke-desktop.mjs` | 启动桌面应用，检查 IPC、目录选择和 AI 组件，生成截图        |
| `pnpm run pack`                  | 构建当前平台应用目录                                        |
| `pnpm dist`                      | 构建当前平台安装包                                          |

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

首页使用原版 AI Elements ModelSelector 选择已保存模型，支持按模型/供应商搜索；无项目时保存应用默认值，有项目时保存该项目默认值，重启保留。选择器提供供应商管理入口，侧栏设置仍可管理配置；环境检查和原 AI 组件预览收进开发者选项。供应商连接诊断与普通聊天已接入，Agent 工具循环待后续阶段。正常启动不探测 Codex，不要求安装 Codex 或登录 ChatGPT；独立握手脚本保留为可选技术储备。见 [产品入口](./docs/provider-entry.md)。

后续按 [工作总表](./docs/work-plan.md) 推进，每项完成后在 [工作日志](./docs/work-log.md) 记录实现与验证；仓库执行约定见 [AGENTS.md](./AGENTS.md)。

参见 [文档入口](./docs/README.md)、[搭建与验证记录](./docs/setup.md) 和 [开发计划](./docs/development-plan.md)。

Renderer 的模块职责与检查范围见 [feature 边界](./docs/renderer-structure.md)。

桌面通信协议见 [B02 契约](./docs/ipc-contracts.md)，本地与双平台 CI 入口见 [B04 检查计划](./docs/quality-checks.md)，维护版本、许可证与发行阻断见 [V01 依赖评估](./docs/dependency-review.md)。

阶段 2 已验收；阶段 3/P05 真实验收保留待验证。按用户要求推进的阶段 4 已实现并通过本地验收，当前下一项为正常系统凭据环境下的真实消息与重启续聊验收；阶段 5 尚未开始。

供应商列表及模型选择器包含 357 个本地品牌 SVG，按域名、名称和模型系列识别，未知配置显示通用图标；不依赖远程图片。来源和匹配边界见 [供应商图标](./docs/provider-icons.md)。
