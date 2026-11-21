# B04：自动化检查与目标系统构建计划

实施日期：2026-11-21。此项交付检查入口和 CI 定义，不等于两平台最终发行验收。

## 统一入口

`pnpm check` 顺序执行以下检查，首个失败立即退出非零；本机与 CI 使用相同脚本。

| 检查 | 入口 | 目的 |
| --- | --- | --- |
| 类型 | `pnpm typecheck` | Main、Preload、Renderer、共享契约和测试的 TS 检查 |
| Lint | `pnpm lint` | 代码规则、Hooks 和 Renderer/展示层平台访问边界 |
| 格式 | `pnpm format:check` | 仓库格式；沿用现有 docs/上游 AI 组件排除规则 |
| 关键测试 | `pnpm test` | 路径契约、IPC 参数/归属、错误和订阅清理 |
| 文档结构 | `pnpm check:docs` | 本地链接、代码围栏、106 个唯一任务 ID、连续日志号 |
| 原组件完整性 | `pnpm verify:vendor` | 固定提交的 14 份 AI/UI/许可证文件本地 SHA-256，完全离线 |
| 生产产物 | `pnpm build:bundle` | 构建 main、沙箱 preload 和 renderer；不重复运行类型检查 |
| 本地数据集成 | `pnpm verify:data` | 构建后以 Electron Node 运行真实 SQLite Worker、迁移、分页、日志、凭据引用检查 |

`pnpm build` 仍独立执行类型检查 + bundle，适合单独构建。`pnpm verify:native` 在 Electron 的 Node 中真实加载 SQLite、创建 PTY 并检查输出与退出；`pnpm verify:desktop` 通过 Playwright 启动 Electron，检查契约、UI、组件预览、取消/错误、项目状态并输出截图。

B03 后正常启动不再探测 Codex；v1 的 codex 字段保留并返回 null。pnpm verify:no-codex 在子进程空 PATH 中验证 Codex 确实不可执行，再检查启动和模型选择和设置入口，已加入 CI；不把开发机工具安装当作产品前提。

## CI 配置

文件：`.github/workflows/check.yml`。推送 main、PR、手动触发均运行；最小只读仓库权限、同分支旧运行取消、两平台独立执行且互不掩盖失败，每项作业限时 30 分钟。

| 目标 | Runner | Node / pnpm | 顺序 |
| --- | --- | --- | --- |
| macOS ARM64 | `macos-14` | 24.7.0 / packageManager 固定 10.34.9 | frozen install → check → native → 开发产物桌面 smoke → 无 Codex smoke → 未签名目录打包 → 包内桌面 smoke |
| Windows x64 | `windows-2022` | 同上 | 同上；使用 win-unpacked/Devly.exe |

每个平台分别安装，不共享 node_modules 或原生编译产物。pnpm store 缓存以锁文件为依据；postinstall 重建 SQLite/PTY。关闭自动发现签名身份，仅生成目录；失败时仍保存可获得的截图与 builder 配置证据。CI 不请求模型、不需要第三方 API Key，也不发布发行版本。

本机复现：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm verify:native
pnpm verify:desktop
pnpm verify:no-codex
pnpm run pack --config.mac.identity=null
DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly pnpm verify:desktop
```

最后两行是 macOS 示例。Windows 在 PowerShell 设置 `$env:DEVLY_EXECUTABLE='release/win-unpacked/Devly.exe'` 后运行相同检查；需要该系统的原生编译工具。CI 尚未运行成功前，工具链与权限问题都应视为待验证，不能凭 YAML 存在声称通过。

## 当前证据与后续门槛

本次本机 macOS ARM64 的命令与结果见 [LOG-009 至 LOG-011](./work-log.md)。Windows 实际运行、GitHub Actions 的远端执行结果、Linux、macOS Intel 均不据本机结果自动判通过。

V02/V03 仍需在已安装应用中验证业务能力、原生模块、中文/空格路径、首次启动和迁移；V04 负责签名、公证和安装包；B04 的基础 smoke 不能代替上述验收。依赖安全与许可证发行门槛见 [V01 评估](./dependency-review.md)。

阶段 2 增加 `pnpm verify:persistence`，在隔离的临时 userData 检查真实窗口的多项目重启、会话、设置/主题、系统 safeStorage 与原生导出；可以用 DEVLY_EXECUTABLE 指向打包应用。系统安全后端不可用时明确失败，不回退明文。CI 与平台结果仍需实际执行，见 [本地数据说明](./local-data.md)。
