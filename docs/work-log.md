# Devly 工作日志

本日志记录真实完成事项和验证范围，任务状态统一维护在 [工作总表](./work-plan.md)。既有工作首次整理于 2026-11-21；历史验证不冒充本轮重新运行。后续条目继续追加，不删除失败或范围调整记录。

## LOG-001｜工程与 IPC 底座（已有工作整理）

- 任务：D01、D02；日期：截至 2026-11-21。
- 实际完成：创建 Electron/React/TypeScript 工程，main/preload/renderer/shared 分层，pnpm 锁文件与 Volta 配置，格式、类型、Lint、测试和打包脚本。
- 涉及文件：package.json、pnpm-lock.yaml、electron.vite.config.ts、tsconfig.json、src/main/index.ts、src/preload/index.ts、src/shared/contracts.ts。
- IPC 只有 getEnvironment/openProject 两项能力，主进程校验发送方，路径通过 Zod 与 realpath/stat 处理。
- 验证：此前构建与桌面 smoke 通过；本轮静态与基础测试见 LOG-005。
- 边界：没有通用 Agent 事件总线、错误契约、数据库服务或真实任务生命周期。项目版本选择没有改写用户全局工具安装。
- 下一步：B02/B03，然后配置与凭据。

## LOG-002｜基础工作台和原 AI Elements（已有工作整理）

- 任务：D03、D04、D05；日期：截至 2026-11-21。
- 实际完成：暗色工作台、导航、打开目录、当前项目内存状态、真实环境检测、组件预览。
- 原组件：Conversation、Message、Tool、Commit、Code Block，来源为 vercel/ai-elements 提交 ca8be600bfd01b3131f9bf6134b51602a71f4374；配套基础 UI 同步引入，保留许可证与 SOURCE.md。
- 涉及文件：src/renderer/src/App.tsx、store.ts、styles.css、components/ai-elements/、components/ui/。
- 历史验证：桌面脚本验证窗口、preload、环境查询与原组件渲染，并生成截图；目录选择测试替换原生对话框的返回，再走真实 IPC 与文件系统检查。
- 边界：输入区域是静态占位，按钮禁用；没有历史会话、API 连接、Agent、编辑器或真实 Git 数据。顶部设置图标尚不可操作。目录选择没有持久化。
- 下一步：原 Prompt Input、Provider 设置和真实消息接入，按任务依赖推进。

## LOG-003｜原生依赖和可选 Codex 握手（已有工作整理）

- 任务：D06、D07；日期：截至 2026-11-21。
- 原生验证命令：pnpm verify:native。历史结果：Electron Node 内存 SQLite 查询通过；PTY 创建、读取输出与退出检查通过。
- 握手验证命令：pnpm verify:codex。历史结果：本机 Codex App Server initialize/initialized 通过，没有开始模型回合。
- 涉及文件：scripts/native-smoke.cjs、verify-native.mjs、verify-codex.mjs。
- 边界：不代表持久化、交互终端、模型授权、聊天、审批或真实代码任务已完成。握手只写入请求并结束进程，不声称服务端已处理后续真实任务。
- 方向更新：Codex 验证保留为可选引擎储备；直接第三方 API 需要新建 Provider 和自研 Agent。

## LOG-004｜macOS 应用与品牌图标（已有工作整理）

- 任务：D08、D09；日期：截至 2026-11-21。
- 实际完成：生成 release/mac-arm64/Devly.app；开发与打包运行使用自定义 PNG，包内配置 ICNS；左上角替换为用户提供的标志。
- 图标调整：用户确认黑色底板、圆角、接近相邻 Dock 的大小，随后要求增加内部留白。当前资源为 resources/branding/devly-app-icon-dark-v5.png，保留旧版本供追溯。
- 主要文件：electron-builder.yml、src/main/index.ts、src/renderer/src/App.tsx、build/icon.png、build/icon.icns、resources/branding/README.md。
- 历史验证：生产构建、未签名目录打包、窗口运行检查通过；最后图标修改后对包内 PNG/ICNS 与 build 文件作 SHA-256 一致性检查，并重开应用。
- 本轮复核：包内两项图标资源与当前 build 文件仍一致。用户尚未对最后内部留白明确反馈通过，不把它记录为已取得最终视觉批准。
- 边界：未生成正式 DMG、未签名/公证，没有 Windows 验证；图标外框接近前版而非逐像素不变。

## LOG-005｜当前代码盘点与检查（本轮执行）

- 任务：D10；日期：2026-11-21。
- 实际核查：遍历当前源文件与脚本，确认主进程只有环境检测与目录选择，前端只有项目/页签内存状态，发送按钮仍禁用，数据库/Agent/Provider/Git/终端业务尚不存在。
- 命令与结果：pnpm typecheck 退出 0；pnpm lint 退出 0；pnpm test 退出 0，1 个测试文件、1 项路径契约测试通过。
- 附加检查：build/icon.png、build/icon.icns 与 .app 包内资源 SHA-256 一致。
- 未重复验证：本轮没有重新安装依赖、重新请求模型、重新执行完整桌面 smoke 或 Windows 测试；此前对应证据保留为历史。
- 下一步：先完成文档目标校准，然后按工作总表进入 B03/B02。

## LOG-006｜第三方 API 目标校准与工作管理（本轮执行）

- 任务：D11；日期：2026-11-21。
- 用户确认：目标是具备 Codex 类似功能、可以接第三方 API 的工具，不能只做 Codex 引擎客户端。
- 实际变更：将主路线改为 Provider 适配器 + 自研 Agent + 本地执行；先做 Chat Completions 兼容协议，再做 Responses 与 Anthropic 原生适配。UI 库、技术底座和品牌资源保持既有选择。
- 产物：docs/work-plan.md（现状、功能矩阵、任务 ID/依赖/验收）、docs/development-plan.md（阶段与节点）、docs/architecture.md（六张当前架构图）、docs/tech-stack.md（当前选型）、本日志及根目录 AGENTS.md（开工与记录约定）。
- 历史保留：原架构、阶段计划、选型复制到 docs/archive/codex-app-server-*.md，并注明不再作为当前路线。
- 文档纠正：撤销旧路线 40–59 工作日估算的当前承诺；修正 README 的 pnpm run pack 命令与当前能力描述；更新文档导航。
- 验证：文档完成后检查本地链接、任务 ID 唯一性、依赖引用与 Mermaid 代码块完整性；具体结果以本条末尾的复核记录为准。
- 边界：本次没有实施 Provider、请求任何第三方模型或安装新的 API SDK；计划不等于产品功能已经完成。没有创建后台目标或定时任务。
- 下一步：B03/B02 → L01/L03/L04 → P01/P02/P03/P04；真实联调依赖用户在产品内配置端点与有效凭据。
- 文档复核结果：104 个唯一任务 ID（11 项既有基础/文档工作完成、93 项后续工作待开始）；依赖引用存在且无环；6 条初始工作记录、6 张当前架构图；12 份文档的本地链接和代码围栏检查通过。

## LOG-007｜工作表改为逐阶段、逐步骤执行

- 日期：2026-11-21；任务 ID：D12（本次计划调整）；下一项业务实现：阶段 1 / 步骤 1.1 / B03，仍为待开始。
- 用户要求：重新调整 work-plan.md，按阶段一步步做。
- 实际变更：保留 11 项既有 D 记录和全部 93 项旧待办，新增 D12 文档完成记录与 T12 Windows 隔离任务。将模块分类重排为阶段 0 基线和阶段 1–12 的顺序步骤，补充每阶段的进入条件、产物、验收清单和完成后位置更新。
- 依赖修正：U02 文本聊天不再依赖后面的 Agent 参数解析；U05 的跨重启继续由阶段 9 的 R02 验收控制；T07/T11 在阶段 6 验证 macOS，Windows 实测由 T12 和 X05 在阶段 12 完成。功能未删除，旧 ID 不重排。
- 保护条件：写工具在权限/审批/取消共同验收前不启用；阶段未通过不跨阶段开发；阶段通过后不额外设置用户批准步骤。B03 在阶段 1 只迁移概念和设置入口，正式配置/保存与实际 API 调用留在阶段 2、3，避免验收前置矛盾。
- 涉及文件：docs/work-plan.md、docs/development-plan.md、docs/README.md、docs/archive/work-plan-by-module.md、AGENTS.md、本日志。
- 历史保留：修改前的模块表复制到 archive，不覆盖已有 LOG-001–LOG-006。
- 验证：检查所有任务只出现一次、旧任务不丢失、步骤编号连续、前置项存在且位于更早阶段或本阶段更早步骤，检查本地链接与文档围栏；实际结果见下方复核。
- 未覆盖范围：仅修改文档和执行约定，没有开始 B03，没有改变代码或依赖，没有重新运行应用、模型任务或业务测试。
- 当前位置：阶段 0 已归档既有基础；阶段 1 待开始；第一步 B03。后续阶段全部待开始。
- 本次复核结果：106 个唯一任务 ID（12 项基础/文档记录、94 项后续任务）；原 104 个 ID 全部保留，新增 D12/T12；12 个开发阶段的步骤连续，所有前置均位于更早阶段或更早步骤；13 份文档本地链接与代码围栏检查通过。

## LOG-008｜B01：拆分 Renderer feature 边界并同步仓库

- 日期：2026-11-21；阶段 1 / 步骤 1.2 / B01；用户明确指定本次先完成该项，B03 保持待开始。
- 实际完成：App.tsx 改为装配层，拆出 app shell/header、workspace、environment、component-preview；展示组件接收数据和回调；window.devly 访问集中到 platform/desktop.ts，目录选择和环境生命周期归属各 feature hook。
- 细节：保留原 UI、原 AI Elements、品牌和演示说明；环境 hook 增加过期请求/卸载保护；ESLint 约束展示组件与 Renderer 的平台访问边界。
- 涉及文件：src/renderer/src/App.tsx、app/、features/、platform/desktop.ts、store.ts、eslint.config.js、scripts/smoke-desktop.mjs、docs/renderer-structure.md 与计划/README。
- 验证结果：pnpm typecheck、pnpm lint、pnpm test（原有 1 项）、pnpm build、pnpm format:check 均退出 0；桌面 smoke 退出 0，覆盖环境刷新、目录选择成功/取消/错误、原组件渲染、预览关闭与返回后的项目状态、Renderer 隔离。
- 未覆盖范围：没有实现 B03、Provider、模型对话、持久化、Git 或终端业务，没有 Windows 验证；未重新生成安装包。原生目录对话框由测试替换返回值，其后仍走实际 IPC 与路径检查。
- 任务状态：B01 待开始 → 完成；阶段 1 为进行中而非全部完成；下一项仍为 1.1/B03。
- Git 同步目标：https://github.com/WONISHI/Devly.git。原目录继承父仓库（指向另一项目），已只在 Devly 目录建立独立 Git 仓库；远端当前为空，因此首次同步包含现有项目基线和本次 B01 修改，不接触父仓库。
- 同步结果：首次代码提交 `431bbe4dca58d494fb409ce4dbe8c6c20b91a820` 已通过 `git push --set-upstream origin main` 推送至 GitHub；随后 `git ls-remote origin refs/heads/main` 返回相同哈希，确认远端实际收到。此记录与任务表排版随后以独立文档提交同步。

## 追加记录模板

```text
## LOG-下一编号｜工作名称
- 日期：
- 阶段 / 步骤 / 任务 ID：
- 用户需求/任务目标：
- 实际完成内容：
- 涉及文件：
- 验证命令与退出码/实际结果：
- 人工场景与证据：
- 未覆盖范围、遗留问题与权限/数据影响：
- 任务状态变化：待开始 → …
- 下一步：
```

仅代码完成但验收未通过时，工作总表使用“待验证”或“部分完成”。错误与受阻也追加记录，写清需要的外部条件，不能用笼统“已测试”代替执行证据。
