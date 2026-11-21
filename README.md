# Devly

支持第三方模型 API 的本地桌面 AI 编程工作台，目标对齐 Codex 类似的编程与任务交互能力。采用 Electron、React、TypeScript、原版 AI Elements、Tailwind CSS、Lucide React 与 Zustand；主路线为自研 Agent 与 Provider 适配层。

当前已完成工程初始化、依赖安装、基础桌面界面、打开本地项目、环境检测和 AI Elements 组件预览。**第三方 API、真实 Agent 对话、工具执行、审批、编辑器和终端业务尚未接入**；相关底层依赖已安装。项目选择目前保存在内存中，尚未持久化。

## 启动

工具版本：开发机 Node.js `24.7.0`，pnpm `10.34.9`。package.json 中的 Volta 配置会在项目目录中选择该版本。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

已安装依赖的当前工作区可直接运行 `pnpm dev`。安装过程会通过 electron-builder 为目标 Electron 重建原生模块；不同系统和架构需要分别安装验证，不复制已有 node_modules 跨平台使用。

## 常用命令

| 命令                             | 作用                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                       | 启动 Electron 开发应用                               |
| `pnpm build`                     | 类型检查并构建 main、preload、renderer               |
| `pnpm start`                     | 启动构建产物                                         |
| `pnpm typecheck`                 | TypeScript 检查                                      |
| `pnpm lint`                      | ESLint 检查                                          |
| `pnpm test`                      | 基础契约测试                                         |
| `pnpm format:check`              | 格式检查                                             |
| `pnpm verify:native`             | 在 Electron Node 中验证 SQLite 和 PTY                |
| `node scripts/smoke-desktop.mjs` | 启动桌面应用，检查 IPC、目录选择和 AI 组件，生成截图 |
| `pnpm run pack`                  | 构建当前平台应用目录                                 |
| `pnpm dist`                      | 构建当前平台安装包                                   |

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

Codex CLI 检测与初始化握手仅为已有的可选技术储备，第三方 API 主路线不要求安装 Codex。当前界面的 Codex 占位提示尚待迁移；下一批工作优先实现 Provider 配置、受保护凭据、API 适配与自研 Agent。

后续按 [工作总表](./docs/work-plan.md) 推进，每项完成后在 [工作日志](./docs/work-log.md) 记录实现与验证；仓库执行约定见 [AGENTS.md](./AGENTS.md)。

参见 [文档入口](./docs/README.md)、[搭建与验证记录](./docs/setup.md) 和 [开发计划](./docs/development-plan.md)。

Renderer 的模块职责与检查范围见 [feature 边界](./docs/renderer-structure.md)。
