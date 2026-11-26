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
| 原组件完整性 | `pnpm verify:vendor` | 固定提交的 26 份 AI/UI/许可证文件本地 SHA-256，完全离线（含 ModelSelector/ScrollArea） |
| 生产产物 | `pnpm build:bundle` | 构建 main、沙箱 preload 和 renderer；不重复运行类型检查 |
| 聊天运行时集成 | `pnpm verify:chat` | 真实 SQLite Worker、回合/取消/上下文授权/错误/Key 回显/分页/重启/迁移，HTTP 响应为替身 |
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

阶段 3 新增 `pnpm verify:provider` 与 CI 步骤：真实 Electron、临时 userData、loopback HTTP 协议替身，覆盖供应商 CRUD、模型列表 404/手工兜底、SSE 增量、工具往返、独立能力、401/403/429/500、超时/断流/取消及报告重启/失效。这里的“CI 不请求模型”指不请求外部模型；替身不构成真实供应商接通证据。支持 DEVLY_EXECUTABLE 指向包内程序。阶段 3 首次 `pnpm test` 为 56 项，新增适配器与生命周期测试见 tests/providers.test.ts。真实端点验收单独记录，见 [Provider API](./provider-api.md)。

首页选择修正新增 `pnpm verify:model-picker` 与 CI 步骤：原版选择器、搜索/键盘、应用/双项目默认选择和重启、编辑/删除后的选择处理，验证端点收到请求数为 0。支持包内 DEVLY_EXECUTABLE。新增 4 项模型选项边界测试后 pnpm test 共 60 项。

LOG-035 新增 pnpm verify:icons，纳入 pnpm check，离线检查 357 个 SVG、目录和 MIT 通知。新增 5 项匹配测试后 pnpm test 共 65 项。pnpm verify:provider-icons 已加入 CI，使用隔离资料目录核对实际 SVG 加载、30px 尺寸、中文名称/模型回退/未知图标、深浅主题、网关优先与编辑刷新、选择器图标和零外部请求；支持 DEVLY_EXECUTABLE 指向包内应用。本机结果见工作日志，Windows/远端 CI 仍待实际验证。

阶段 4 新增 verify:chat（纳入 check）与 verify:chat-ui（纳入 CI）。70 项单元/契约测试、真实 Electron/loopback HTTP 中的输入、两会话/两项目、页面刷新、停止/重发、模型历史确认、20 条历史分页、上滚/回到底部和应用重启都需实际执行；支持 DEVLY_EXECUTABLE 做包内复核。人工真实端点与系统保护凭据的结果另记 LOG-039，不把替身当作供应商已接通。

阶段 4 当前检查包含 70 项单元/契约测试、verify:chat 的真实 SQLite Worker/回合生命周期集成和 verify:chat-ui 的 21 次本地 HTTP 界面请求，详见 LOG-036–LOG-039。原组件清单现为 26 份。没有让 CI 读取个人 Provider/密钥或调用外部模型；复制密文的真实尝试失败记录单列，不作为 CI 输入。

阶段 7：`pnpm check` 为 127 项通过、2 项主机检查默认跳过，原组件固定清单为阶段 6 的 32 份；新增 8 项文件/监听/缓冲区检查。`verify:editor` 在 macOS 用实际 SQLite/隔离保存/Git 检查，`verify:editor-ui` 支持 Vite 开发、本地构建与 DEVLY_EXECUTABLE 包内检查；CI 新增 macOS 开发/包内入口，远端执行结果仍未验证。真实 API 的 `verify:editor-live` 只在显式指定既有配置时手工运行，不能加入 CI；范围、证据和限制见 [编辑器说明](./editor-and-diff.md) 与 LOG-050/LOG-051。
