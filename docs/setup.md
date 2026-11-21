# 工程搭建与验证记录

> 本文记录已发生的搭建事实，不代表当前主路线仍依赖 Codex。用户已确认第三方 API + 自研 Agent 方向，后续执行以 [工作总表](./work-plan.md) 为准，完成证据追加到 [工作日志](./work-log.md)。

## 已实现的范围

- Electron + electron-vite + React + TypeScript 工程，main、preload、renderer、shared 分层。
- pnpm 锁文件、Volta 项目版本、Tailwind CSS、Lucide、Zustand 和 AI Elements 配套依赖。
- 受限 IPC、主进程来源校验、Zod 参数校验，Renderer 禁用 Node 集成并启用隔离与沙箱。
- 桌面工作台、打开项目目录、当前项目内存状态、真实本机环境检测。
- 原版 Conversation、Message、Tool、Commit、Code Block，以及同一上游版本的 shadcn/ui 基础组件。
- SQLite、PTY、Monaco、测试和打包依赖安装；原生模块构建与运行验证。
- 开发、构建、原生模块、Codex 协议及桌面检查脚本。

AI 组件来源为 `vercel/ai-elements` 提交 `ca8be600bfd01b3131f9bf6134b51602a71f4374`，具体来源和本地修改见 [源码记录](../src/renderer/src/components/ai-elements/SOURCE.md)。

## 本机基线

| 项目 | 实际版本或环境 |
| --- | --- |
| 开发机 | macOS / Apple Silicon |
| 开发 Node.js | 24.7.0 |
| pnpm | 10.34.9 |
| Electron | 39.8.10 |
| Electron 内置 Node.js | 22.22.1 |
| React / React DOM | 19.3.1 |
| electron-vite / Vite | 4.0.1 / 7.3.8 |
| Tailwind CSS | 4.3.5 |
| better-sqlite3 / node-pty | 12.11.1 / 1.1.0 |
| AI SDK 类型依赖 | ai 6.0.333 |
| Codex CLI | 0.169.0-alpha.11.1，本机已有安装 |

这是一组本机搭建验证过的开发版本，不代表已经通过正式版本所需的平台、安全更新和长期兼容性验收。完整依赖解析以 `pnpm-lock.yaml` 为准。

本机原默认 pnpm 启动器指向缺失文件。未修改用户全局安装，项目通过 package.json 的 Volta 配置选择已有 Node.js 24.7.0 与 pnpm 10.34.9，项目目录中已验证 `node` 和 `pnpm` 命令可用。

## 启动和验证

```bash
pnpm dev
```

独立执行检查：

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm verify:native
pnpm verify:codex
pnpm verify:desktop
```

`verify:desktop` 启动应用，验证真实环境 IPC 与组件渲染；目录选择测试替换原生选择对话框的返回值，再通过真实 IPC、路径解析和文件系统检查处理所选路径。它不等于已经人工验证所有原生对话框交互。

本次完成的验证：

- 类型检查、ESLint、格式检查通过；基础 IPC 参数契约测试通过。
- main、preload、renderer 生产构建通过。
- Electron 内置 Node 中 SQLite 内存数据库查询通过。
- PTY 创建、输出读取、退出状态检查通过。
- 本机 Codex App Server 初始化握手通过；没有开始模型回合、没有执行代码修改。
- 构建产物桌面窗口、preload IPC、Renderer 无 Node require、目录选择结果、原 AI Elements 渲染检查通过。
- 打包后的 macOS 应用也通过了桌面窗口、环境 IPC、目录选择结果和原版组件渲染检查。
- 截图在 `output/`，包含工作台、AI 组件和 Commit 预览；演示数据明确标注。

## macOS 应用目录

本机未签名应用目录：`release/mac-arm64/Devly.app`。

当前是开发验证产物，没有生成正式 DMG、签名或公证。打包使用本机已安装的 Electron 分发文件，避免再次下载。`pnpm run pack` 与 `pnpm dist` 按当前主机的平台和架构使用该文件；跨平台分发需要在对应目标构建环境执行。

## 后续仍需实现

- 第三方 API 配置、凭据、协议适配、自研 Agent 会话、工具循环、流式任务、审批和取消。
- 项目与会话持久化、SQLite Repository 和迁移。
- Monaco 资源配置及真实文件编辑和 Diff。当前已安装依赖，尚未挂载编辑器。
- PTY 后台服务和交互终端。当前只完成底层原生能力验证。
- Git 服务与真实 Commit 数据；当前 Commit 页面明确使用演示数据。
- 明亮/跟随系统主题、完整面板布局和快捷键。
- Windows 安装包、平台运行与原生依赖验证。
- 正式分发前的依赖维护版本评估、性能优化、签名和完整验收。

因此，本次完成的是安装与工程搭建，不将开发计划中的阶段 0–2 全部标为完成。
