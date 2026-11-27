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

## LOG-009｜B02：统一请求、事件、错误契约与订阅清理

- 日期：2026-11-21；阶段 1 / 步骤 1.3 / B02；用户指定与 B04、V01 一次完成，B03 保持待开始。
- 实际完成：共享 v1 请求/响应/事件 Schema；固定方法白名单、严格参数和结果检查、UUID 关联、进行中重复 ID 拒绝；统一 INVALID_REQUEST/FORBIDDEN/INTERNAL_ERROR/INVALID_RESPONSE/TRANSPORT_ERROR，不返回内部堆栈或异常文本。
- 归属与清理：Main 验证当前 WebContents、主 frame、页面 generation；异步完成后复核归属；订阅按页面隔离，最多 32 个；窗口/页面完整导航、崩溃、销毁时清理；Preload 只传业务数据，取消函数同步移除监听，处理重复取消及确认前取消的竞态。
- 桥接细节：通过 contextBridge 返回显式 OperationResult DTO，避免 Error 自定义属性丢失；Renderer 网关解包后重建 ContractError，业务 hook 调用方式保持不变。Zod 在沙箱 preload 中打包，不放宽 sandbox/contextIsolation。
- 涉及文件：src/shared/contracts.ts、src/main/request-router.ts、src/main/index.ts、src/preload/desktop-client.ts、src/preload/index.ts、src/renderer/src/platform/desktop.ts、electron.vite.config.ts、tests/ipc.test.ts、scripts/smoke-desktop.mjs、docs/ipc-contracts.md。
- 验证：pnpm check 退出 0，其中 2 个测试文件 / 22 项测试通过（21 项新增）；覆盖非法输入、未授权 owner、旧页面异步响应、并发乱序关联、错误脱敏、事件隔离/取消归属、重复取消、生命周期清理、订阅限额、确认前事件/取消、失败后的 listener 清理。类型/Lint/生产构建通过。
- 桌面证据：开发产物与未签名 Devly.app 的 pnpm verify:desktop 均退出 0；真实 IPC 事件到达并在清理后停止，错误 DTO 的 INTERNAL_ERROR 码穿过桥接仍保留，内部异常原文未泄露；目录取消/失败/成功、原组件预览、状态保留和 Renderer 隔离回归通过。
- 边界：导航/崩溃的 owner 清理由单元测试及主进程生命周期接线覆盖，未注入真实崩溃；订阅停止不等于取消已开始的本机操作，没有实现 Agent 任务取消、文件写入或命令执行。事件暂存最多 32 条，没有持久化/重放保证。
- 状态：B02 待开始 → 完成。下一步：本批 B04；批次结束后唯一下一项恢复 B03。

## LOG-010｜B04：统一检查入口与目标平台构建计划

- 日期：2026-11-21；阶段 1 / 步骤 1.4 / B04。
- 实际完成：pnpm check 顺序运行类型、Lint、格式、关键测试、文档结构、原组件哈希和生产 bundle，任一失败非零退出；保留独立 build。增加 docs/quality-checks.md、scripts/check.mjs、check-docs.mjs 及 CI workflow。
- CI 定义：main 推送/PR/手动触发 macos-14 ARM64 和 windows-2022 x64 独立作业；固定 Node/pnpm、frozen install、原生模块检查、开发桌面检查、未签名应用目录和包内桌面检查；只读仓库权限、限时、同分支取消、截图和 builder 证据上传。
- 可移植性：桌面脚本允许 Codex CLI 检测为空，项目名由 cwd 推导；没有把该检查调整冒充 B03 的 Provider 设置入口实现。检查脚本支持 Windows cmd 调用 pnpm；原生 smoke 已分别选择 cmd.exe 或 /bin/sh。
- 涉及文件：package.json、.github/workflows/check.yml、scripts/check.mjs、scripts/check-docs.mjs、scripts/smoke-desktop.mjs、eslint.config.js、.prettierignore、README.md、docs/quality-checks.md。
- 验证：pnpm check 最终退出 0；pnpm run pack --config.mac.identity=null 退出 0，生成 release/mac-arm64/Devly.app；开发及包内 verify:desktop 均退出 0；pnpm verify:native 退出 0，SQLite SQL 与 PTY 输出/退出通过。
- 发现与修复：首次统一检查发现临时 .cache 脚本被 Lint 扫描，以及文档链接使用了错误文件名；已排除生成目录、统一链接到 quality-checks.md，再运行通过。既有 bundle 仍有大 chunk 和上游 Zod 注释警告，退出 0 不代表已优化体积。
- 未验证：本轮未推送或触发 GitHub Actions；远端 CI、Windows、Linux、macOS Intel 尚未运行。未签名目录不是 DMG/NSIS、未做签名公证。原生 smoke 对开发依赖树运行，包内桌面检查不替代未来真实数据库/终端业务验收。
- 状态：B04 待开始 → 完成（检查入口与平台计划完成）。下一步：本批 V01；双平台最终验收仍归 V02/V03。

## LOG-011｜V01：维护版本、许可证、原组件与兼容性评估

- 日期：2026-11-21；阶段 1 / 步骤 1.5 / V01。
- 实际完成：docs/dependency-review.md 记录全部 58 个直接依赖的实际版本/许可证、22 个范围外新版本、920 个本机安装包的许可证表达式统计、全部审计公告、兼容性与升级决策、正式发行阻断。scripts/dependency-inventory.mjs 可复现清单，不把本机清单称为跨平台或安装包 SBOM。
- 唯一版本调整：jest-dom 6.10.0 被 npm 元数据标记为错误 minor 及破坏性变更，按上游建议改为 6.9.1，最终 package.json 和 lockfile 精确固定；没有一次性升级其他主版本。
- 调整前验证：类型/Lint、22 项测试、生产构建、开发桌面 smoke、Electron SQLite/PTY 均通过。调整后验证：pnpm check（含 22 测试、文档、14 份原组件哈希、bundle）、开发/包内桌面 smoke、未签名目录打包、native 均退出 0；pnpm install --lockfile-only --offline --ignore-scripts --frozen-lockfile --store-dir .pnpm-store 退出 0，确认 manifest/锁文件匹配，不将此命令称为全新安装验证。
- 来源核查：固定 vercel/ai-elements 提交 ca8be600bfd01b3131f9bf6134b51602a71f4374；5 个原 AI 文件、8 个同仓 UI、1 份 Apache-2.0 LICENSE 与允许的别名替换/格式化结果完全一致；记录 resources/vendor/ai-elements.json 的上游/本地 SHA-256，并补充 UI 来源说明。连接曾 ECONNRESET，使用 curl 缓存/重试后全部完成；离线 verify:vendor 通过。
- 许可证核查：khroma 的元数据缺字段，但随包 license 原文为 MIT；MPL、CC-BY、Python、双许可证与最终第三方通知分别记录，未擅自选择 Devly 自身许可证，也未声称 renderer bundle 的分发通知已完整。
- 维护风险：官方支持政策与 registry 记录确认 Electron 39、ESLint 9 已超支持范围。pnpm audit --json 调整前后均退出 1，仍为 low 4 / moderate 9 / high 7 / critical 2，共 22 项审计计数（部分公告涉及多个包或依赖路径）；没有伪称修复。升级受支持主线、处理安全公告、完整分发通知和双平台业务验收继续阻断正式发行。
- 涉及文件：package.json、pnpm-lock.yaml、scripts/dependency-inventory.mjs、scripts/verify-vendor.mjs、resources/vendor/ai-elements.json、src/renderer/src/components/ui/SOURCE.md、docs/dependency-review.md、README/选型/阶段计划/工作表。
- 未覆盖：没有执行 Electron/ESLint/Vitest 等新主线的兼容升级，没有 Windows 或远端 CI 成功证据，没有真实模型调用；Windows installer 构建脚本 allowlist、最终通知、签名/安装包与首装迁移仍需后续验收。
- 状态：V01 待开始 → 完成（评估及局部修正完成，不等于全部风险消除）。阶段 1 为 4/5 项完成，保持进行中；唯一下一项为 1.1/B03，完成后复核阶段验收再进阶段 2。本批改动在本地工作区，未提交/推送 GitHub。

## LOG-012｜B03：Provider/Agent 入口迁移与阶段 1 验收

- 日期：2026-11-21；阶段 1 / 步骤 1.1 / B03。用户指出该项仍未完成，本轮补齐；不将此前的检查可移植性改动视为 B03 已实现。
- 实际完成：工作台改为 Provider/Devly Agent 概念，“Provider · 未配置”为可点击入口；侧栏模型供应商、顶部设置按钮进入同一供应商状态页，标题和当前导航状态同步；返回后保留项目和环境内存状态。
- 设置状态：明确显示供应商未配置、配置功能待接入、Agent 待接入；没有 API Key 输入、保存、连接测试、登录或安装入口，不发起模型请求。正式表单/持久化/受保护凭据/协议适配仍留在阶段 2、3。
- 检测调整：正常环境查询不再执行 Codex 或读取 DEVLY_CODEX_PATH；环境面板第四项改为运行平台；Git 不存在时返回 null，允许继续使用工作台。保留独立 verify:codex 技术脚本及 v1 codex 字段，正常启动该字段固定为 null，不伪称已运行可选探测。
- 边界维护：新页面沿用已有 shadcn Button/Badge、Lucide 与样式；只接收导航回调，不访问 Node/preload。扩展 WorkspaceTab/App 装配和展示层 Lint 边界，未修改原 AI Elements 源码或已确认品牌图标。
- 主要文件：src/renderer/src/features/provider-settings/、App.tsx、store.ts、app/AppHeader.tsx、features/workspace/components/、features/environment/components/EnvironmentPanel.tsx、styles.css；src/main/index.ts、src/shared/contracts.ts、package.json、eslint.config.js；scripts/smoke-desktop.mjs、scripts/verify-no-codex.mjs、.github/workflows/check.yml；docs/provider-entry.md、工作计划/阶段计划/Renderer/检查/选型/README。
- 自动检查：pnpm check 退出 0，类型/Lint/格式、22 项契约测试、文档结构、14 份原组件哈希、生产 bundle 通过。后续文档补充与 smoke 脚本完善后再运行 Lint/格式/文档检查，均通过；没有新增或请求模型 SDK。
- 无 Codex 证据：pnpm verify:no-codex 退出 0；脚本为子 Electron 创建空 PATH，先实际执行 codex --version 并验证 ENOENT，再启动真实应用走 IPC/UI；环境返回 git:null、codex:null。不是直接替换环境响应，也不卸载开发机工具或修改宿主 PATH。脚本结束后清理临时目录。
- 桌面与打包证据：正常 PATH 下 pnpm verify:desktop 退出 0；pnpm run pack --config.mac.identity=null 退出 0，更新未签名 Devly.app；DEVLY_EXECUTABLE 指向包内程序后 verify:no-codex 退出 0。覆盖三个设置入口、无密钥输入、明确待接入说明、导航返回状态、原目录选择/错误/取消、事件订阅清理和原组件预览。另检查 960×680 内容区无横向溢出，并观察实际截图；用 setContentSize 避免不同系统窗口边框造成断言偏差。
- 截图：output/providers.png、providers-no-codex.png、providers-compact.png；已检查设置页实际渲染，截图前等待测试产生的错误 toast 隐藏，避免混淆真实页面状态。
- 阶段 1 验收逐条复核：① 无 Codex 可启动且可进入供应商设置，未实现功能清楚标明，通过；② 类型/Lint/原有及新增契约测试/生产构建通过，非法 IPC 与订阅清理已有证据，通过；③ V01 维护、来源、许可证和平台边界有记录，通过。
- 未覆盖与剩余风险：Windows/远端 CI 尚未运行；未签名 .app 不是正式安装包；没有 Provider 表单、真实 API、Agent、数据库或凭据业务。V01 的失维护依赖、安全公告与分发通知等发行阻断仍未解除，本轮没有将其自动关闭。全部改动仍在本地，尚未推送 GitHub。
- 状态：B03 待开始 → 完成；阶段 1 的 B01/B02/B03/B04/V01 全部完成并验收；工作总表/阶段总览/当前执行位置同步为阶段 2 待开始。唯一下一项为 2.1/L01：建立 app userData 下的 SQLite 数据库 Worker 和迁移版本；本轮未提前实施该项。

## LOG-013｜B01/B03 修正：清理工程演示内容，收敛任务首页

- 日期：2026-11-21；阶段 1 已完成项 B01/B03 的用户指定界面修正；阶段 2/L01 仍待开始。
- 用户反馈：此前只改文案和入口，界面变化不明显，无用内容过多。本次按任务操作重新组织页面，未跨到数据库或模型业务。
- 首页：移除营销式两行大标题、英文口号、介绍段、环境面板、技术栈/阶段说明、AI 组件演示按钮；改为居中任务空状态，保留任务输入占位、项目选择、模型选择和禁用发送，仅留一条模型连接待接入提示。
- 侧栏/框架：保留品牌、新任务、项目和底部设置；项目完整路径转为 title 提示；删除 PREVIEW/LOCAL 标签、重复工程提示及 UTF-8/TypeScript 底部状态栏。品牌资源与 Dock 图标不变，删除不用的页面样式。
- 设置：删除大段规划说明、协议/地址/密钥介绍表和 Agent 占位大卡片，供应商只显示未配置/配置功能待接入。环境面板和原 AI Elements 预览保留在默认折叠的开发者选项，预览关闭返回设置。
- 功能边界：新任务是回到任务空状态，不伪造持久化任务；输入与发送保持禁用，没有收集密钥、调用模型、增加数据库或冒充 Agent 可用。
- 涉及文件：App.tsx、app/AppHeader.tsx、app/AppShell.tsx、features/workspace/components/、features/provider-settings/ProviderSettingsPage.tsx、styles.css、scripts/smoke-desktop.mjs、README.md、docs/provider-entry.md、renderer-structure.md、quality-checks.md、work-plan.md。
- 验证：pnpm check 退出 0，类型/Lint/格式、22 项契约测试、文档、14 份原组件哈希、生产 bundle 通过。pnpm verify:desktop 退出 0；更新已有 smoke 场景而未为纯样式另写实现镜像测试，覆盖首页无工程面板、设置折叠默认关闭、折叠后环境刷新、原组件预览与返回、项目取消/失败/选择、状态保留、IPC 错误和订阅清理。
- 打包：pnpm run pack --config.mac.identity=null 退出 0，更新 release/mac-arm64/Devly.app；DEVLY_EXECUTABLE 指向包内程序的 pnpm verify:no-codex 退出 0，实际隔离 PATH 并验证 ENOENT 后仍可启动、选项目、进入精简设置和开发者选项。
- 视觉证据：检查 output/workspace-empty.png、workspace.png、workspace-compact.png、providers-no-codex.png 的实际渲染；960×680 内容区无横向溢出，1440×960 正常。截图中首页不含工程信息，设置默认只有供应商行和折叠项。
- 活动实例：只读确认用户现有实例来自本项目 electron-vite dev；未强制退出用户开发服务。独立 smoke 实例和本机应用目录已更新验证，不把自动化窗口截图称为已附着检查原活动窗口。
- 未覆盖：Windows/远端 CI 未运行，未签名目录不等于正式发行；V01 的维护/安全发行阻断仍在。改动尚未推送 GitHub。
- 状态：B01/B03 保持完成并追加本次修正证据；唯一下一项仍是阶段 2 / 2.1 / L01，不因视觉改造标记后续业务已完成。

## LOG-014｜L01：SQLite Worker、生命周期与迁移

- 日期：2026-11-21；阶段 2 / 2.1 / L01。
- 完成：app userData/storage 下 SQLite + WAL；better-sqlite3 在 worker_threads 中运行，Main 通过有界请求队列访问；15 秒超时/退出拒绝 pending，不自动重放写操作。应用单实例锁、正常退出排队关闭/checkpoint，启动失败保留旧库并向界面返回错误。
- 迁移：v1 基础数据、v2 会话/记录/日志表；版本事务和升级前 SQLite backup；新版本数据库拒绝降级读取。保留最近 3 个迁移备份。
- 文件：src/main/data/client.ts、database-worker.ts、migrations.ts、store.ts；src/main/index.ts、electron.vite.config.ts。
- 验证：verify:data 在 Electron ABI 中启动真实 Worker，threadId>0；65 个会话写入期间主线程 heartbeat 持续；关闭重开后数据不丢；故意制造 v2 表冲突时版本仍为 v1、旧项目仍在、部分 DDL 回滚、备份存在，移除冲突后升级成功。命令退出 0。
- 边界：没有验证所有进程/电源故障组合；Worker 异常不自动恢复或删库，必要时重启/人工恢复。Windows 未运行。
- 状态：L01 待开始 → 完成；后续 L02。

## LOG-015｜L02：最近项目 Repository 与持久化切换

- 日期：2026-11-21；阶段 2 / 2.2 / L02。
- 完成：目录选择后 realpath 去重入库，最近项目、活动项目持久化；侧栏显示多项目、切换、移除和路径失效状态；移除仅软隐藏记录，保留真实目录与会话，重开同目录复用项目 ID。
- 文件：data/store.ts、service.ts、Main openProject、Renderer store.ts、use-open-project.ts、WorkspaceSidebar.tsx。
- 验证：verify:data 的中文/空格路径、去重、失效目录、移除不删目录/重开历史通过；开发和包内 verify:persistence 验证两个真实临时项目的 IPC 选择、切换、重启及项目记录，退出 0。
- 边界：系统目录对话框由脚本替换返回，后续真实 IPC/文件系统/DB 均执行；尚无目录移动自动追踪，不删除用户文件。
- 状态：L02 待开始 → 完成；后续 L03。

## LOG-016｜L03：Provider 元数据与系统保护凭据引用

- 日期：2026-11-21；阶段 2 / 2.3 / L03。
- 完成：Provider Repository（名称、协议、地址、模型、credential_ref）；严格拒绝明文 Key 字段及带用户名/密码/query 的 Base URL；Main Native 隐藏输入 → safeStorage → UUID 密文文件，数据库只存引用，Renderer 只收到 hasCredential/保存结果。写新文件后切换引用、删除旧文件，取消保持原值；孤立密文启动时回收。
- 文件：data/vault.ts、native-credential.ts、service.ts、store.ts；shared/data-contracts.ts；设置页既有 Provider 的凭据操作。
- 验证：verify:data 使用注入 AES 引擎检查保存、读取、替换、删除、原引用清理、密文文件、DB/WAL 与 DTO 不含测试明文、安全后端不可用时拒绝保存；verify:persistence 在真实 macOS Main 使用 safeStorage 加密→写盘→解密，available/roundTrip 为 true、plaintextPresent 为 false。恶意明文字段在 Renderer IPC 边界被拒绝；扫描临时 userData/日志未发现测试秘密前缀。全部退出 0。
- 边界：上述两类证据分别成立，不把注入引擎叫作真实 Keychain。原生输入框不自动填写用户 Key，Windows 控件/DPAPI 未实测；Linux basic_text/unknown 拒绝使用。当前 Electron 39 同步 API 与 unsigned 包的钥匙串授权限制在 local-data.md 明确记录。没有 Provider 编辑表单或模型连接（仍归 P02–P04）。
- 状态：L03 待开始 → 完成；后续 L04。

## LOG-017｜L04：设置读写、主题与无凭据导出

- 日期：2026-11-21；阶段 2 / 2.4 / L04。
- 完成：Settings v1，应用默认值/项目覆盖；主题、默认供应商/模型、项目权限、Token 与费用限额。严格校验、不合法数据不替换旧值；浅色/深色/系统主题可保存并清理系统监听。Main 原生保存对话框只导出数据库中的严格 Settings，原子写文件，不导出凭据引用/密文。
- 文件：data-contracts.ts、data/store.ts、service.ts、Main 原生保存；SettingsEditor.tsx、feature hooks、App.tsx、styles.css。
- 验证：30 项契约测试包含非法版本/权限/负限额/秘密字段/端点拒绝；verify:data 确认失败不覆盖旧设置；开发/包内 verify:persistence 验证 A/B 默认模型隔离、Token 保存、light/dark 重启恢复和原生导出 JSON 不含凭据，退出 0。
- 修复：首次桌面导出使用 Blob URL 未触发 Electron 下载事件（30 秒 timeout），改为受控 Main 原生保存并轮询文件原子出现，复跑通过。
- 边界：目前限额/权限仅为已持久化策略，未接 Agent/执行器/计费，不能声称已经执行限制；系统主题改变的监听实现不等于每个桌面主题环境均已验证。
- 状态：L04 待开始 → 完成；后续 L05。

## LOG-018｜L05：会话、消息分段与执行记录结构

- 日期：2026-11-21；阶段 2 / 2.5 / L05。
- 完成：sessions、turns、messages、message_parts、tool_calls、approvals、events、blobs，采用自有 UUID；复合外键保证会话/项目、回合/消息/工具/审批/事件/日志关联不混用；消息分段和独立分页索引。
- 文件：data/migrations.ts、store.ts、shared/data-contracts.ts。
- 验证：verify:data 对跨项目回合、跨会话消息/工具/审批/事件的实际 SQL 写入要求 FOREIGN KEY 拒绝；分段文本写入后可分页读回，30 项边界测试及数据集成均通过。
- 边界：只建立数据结构和受信任内部记录能力，没有模型生成消息、工具执行、审批决策或真实回合恢复；不依赖 Codex threadId。
- 状态：L05 待开始 → 完成；后续 L06。

## LOG-019｜L06：会话新建、重命名、归档、分页与恢复

- 日期：2026-11-21；阶段 2 / 2.6 / L06。
- 完成：项目内新建空会话、行内重命名、归档/恢复、活动/归档列表；按时间+UUID 的 keyset 分页，侧栏每次 20 条按需加载；每项目活动会话持久化。旧异步响应不能覆盖新的项目状态。
- 文件：data/store.ts、data-contracts.ts、Renderer store.ts、WorkspaceSidebar.tsx、WorkspacePage.tsx。
- 验证：verify:data 的 65 会话按 11 条遍历，数量/唯一性正确；项目越权拒绝。包内 verify:persistence 用多于 20 个临时会话实际点击“加载更多”，并检查 UI 新建/重命名/归档/恢复、重启选中元数据与两项目隔离，通过。
- 修复：新增分页场景发现重复“加载更多”入口，删除重复按钮、重建 .app 后完整复跑通过。
- 边界：会话仍无真实模型响应，任务输入和发送禁用；内部 fixture 数据只在临时测试 userData 中，未伪造真实会话内容。
- 状态：L06 待开始 → 完成；后续 L07。

## LOG-020｜L07：大日志与附件文件、索引、限额与清理

- 日期：2026-11-21；阶段 2 / 2.7 / L07。
- 完成：Main 原生选择授权文件，Worker 流式落盘至 UUID.bin，SQLite 只存索引；单文件 64 MiB/总索引 256 MiB，流中计数、文件同步、原子 rename/失败清理；按区间最多读 64 KiB 并返回 truncated。读路径真实目录核对与 NOFOLLOW（支持的平台）防符号链接绕行。
- 保留策略：指定会话的未引用旧日志可 prune；附件不自动过期，消息/事件引用由外键保护。原文件不删除，孤立 .tmp/.bin 启动回收。
- 文件：data/store.ts、service.ts、data-contracts.ts；scripts/data.integration.mjs、smoke-persistence.mjs。
- 验证：真实数 MiB 日志流式复制、1 KiB 分段/truncated、65 MiB 文件拒绝、跨项目访问拒绝、prune/孤立文件清理与 macOS 符号链接替换拒绝通过；包内 Native 文件选择返回后走真实导入/读取，通过。
- 修复：补充的 symlink 场景首次缺少测试脚本 rename 导入，补全后独立 verify:data 退出 0；不是产品读取逻辑失败。
- 边界：没有附件预览、模型上传、命令日志生产或后台自动保留任务；Windows 路径/ACL/符号链接语义未实测。
- 状态：L07 待开始 → 完成；后续阶段验收。

## LOG-021｜阶段 2 验收与下一执行位置

- 日期：2026-11-21；阶段 2 / L01–L07 收口。
- 验收 ①：两个临时真实项目切换、分别保存设置/会话后关闭应用，再以同一 userData 重启；项目、模型/Token/主题和活动会话独立恢复，通过。
- 验收 ②：凭据生命周期由注入引擎数据测试验证；真实系统 safeStorage 加密写盘/解密往返另行通过；数据库/DTO/导出与日志扫描不含保存后的测试明文。未使用用户真实凭据或请求模型，通过当前阶段的保护存储边界验收。
- 验收 ③：Worker heartbeat、真实 SQLite 迁移失败回滚/备份与重试、65 会话 keyset 分页、UI 多页、消息分段、大日志/附件索引/限额/读取/清理，均有实际脚本记录，通过。
- 命令：pnpm check（类型/Lint/格式、30 项契约测试、文档、14 原组件哈希、bundle、Electron verify:data）通过；最终代码后分别复核 Lint/格式、verify:data、生产构建。pnpm run pack --config.mac.identity=null 退出 0；包内 DEVLY_EXECUTABLE 的 verify:persistence 与 verify:no-codex 均退出 0，确认 Worker/原生模块可在 asar 应用内加载。
- 截图：output/settings-persisted.png、sessions-persisted.png；实际渲染已检查。所有验收数据位于随机临时目录，正常应用仍使用 app userData，不将测试替身当真实 API 对话。
- 文档：local-data.md 给出目录、进程、迁移、密钥、表约束、分页/配额/保留/错误边界；同步工作总表、阶段计划、README、Renderer 与检查说明。
- 未覆盖：Windows/远端 CI 未执行；原生密钥输入框未自动填写；没有模型调用、Provider 编辑表单、Agent、真实消息生成或正式安装包；V01 的旧依赖/安全公告/分发通知和签名门槛仍未解除。没有新增依赖或推送 GitHub。
- 最终收口复核：pnpm check 退出 0，30 项契约测试、19 份文档/106 个任务 ID/21 条日志、14 份原组件哈希、生产 bundle 与最新 verify:data 均通过；git diff --check 通过。
- 状态：阶段 2 的 7/7 项及阶段验收通过；当前执行位置更新为阶段 3 待开始，唯一下一项 3.1/P01。未提前实施阶段 3。

## LOG-022｜L04 界面补充：macOS 标题栏颜色统一

- 日期：2026-11-21；用户指定的主题/窗口外观修正，阶段 3/P01 仍待开始。
- 问题：macOS 原生浅色标题栏与深色工作区不一致，修改页面 CSS 无法影响原生条。
- 完成：macOS BrowserWindow 使用 hidden titleBarStyle，保留原生红黄绿按钮；AppShell 增加 32px 可拖动标题行，分别复用侧栏/主区主题变量，分界与 232px/210px 响应式侧栏宽度一致。浅色/深色随已保存主题同步；窗口初始底色同步主区深色。Windows/Linux 原生标题栏配置未改。
- 边界：preload 只读 platform 经 desktop 网关和环境 hook 传给展示层，不开放 Node 或新增任意 IPC；原生窗口控制保留，不另造窗口按钮。
- 文件：src/main/index.ts、shared/contracts.ts、preload/index.ts、renderer/src/platform/desktop.ts、features/environment/hooks/use-environment.ts、App.tsx、app/AppShell.tsx、styles.css；工作表与 Renderer 说明。
- 验证：typecheck、Lint、格式、build 退出 0；一次性桌面检查在开发产物和打包 .app 各退出 0。实际计算颜色为深色侧栏 rgb(21,22,24)/主区 rgb(28,29,31)，浅色侧栏 rgb(240,241,243)/主区 rgb(250,250,250)，标题栏两段与对应区域完全相同。检查 drag 区、原生按钮位置 x12/y10、movable/closable/minimizable 标志及隐藏原生条后的内容边界。
- 检查修正：初次脚本误用不存在的 getTrafficLightPosition，按当前 Electron 类型改为 getWindowButtonPosition 后复跑通过。未为低影响样式新增永久单元测试。
- 打包：pnpm run pack --config.mac.identity=null 退出 0，更新 release/mac-arm64/Devly.app；包内深浅主题检查通过。观察 output/titlebar-dark.png、titlebar-light.png 的实际页面渲染；页面截图不包含原生按钮图层，不把它称为原生按钮鼠标点击验收。
- 未覆盖：未手工点测原生交通灯和 OS 拖动手势、Windows/Linux 未实测；未签名目录不是正式安装包，未推送 GitHub。
- 状态：用户指定修正完成；阶段状态不变，唯一下一项仍为阶段 3/3.1/P01。

## LOG-023｜Git 交付范围与提交前复核

- 日期：2026-11-21；用户明确要求完成后提交。
- 范围：B02/B03/B04/V01、完整阶段 2 的 L01–L07、任务首页收敛及 macOS 标题栏颜色修正，连同实现文档、工作表和验收记录一起提交；阶段 3/P01 仍待开始。
- 仓库：Devly 独立仓库 main，origin 为 WONISHI/Devly；提交前 ls-remote 确认远端仍为 a44fe99d1ae97cac9b41d9f176ced1850daae23a，与本地基线一致，使用普通快进推送，不改写历史。
- 本轮复核：git diff --check、check:docs、verify:vendor、30 项契约测试通过；未发现常见格式的私钥/API Token 文件。此前的 Worker/系统凭据/双项目重启/包内标题栏验证见 LOG-014–LOG-022，本轮不重复声称执行这些 GUI 场景。
- 排除：node_modules、out、release、output、.cache、临时数据库和本地环境文件保持忽略；不提交测试用户数据、密文或构建产物。
- 边界：本条随交付提交保存，具体提交 ID 和远端推送回执由 Git 记录及最终回复报告；Windows 与 GitHub Actions 未获得新通过状态，不改变已有发行风险记录。
- 下一步：阶段 3 / 3.1 / P01。

## LOG-024｜B01/L04 修正：统一使用 shadcn/ui + Radix 基础控件

- 日期：2026-11-21；用户指出项目大量使用原生控件，与已确认 UI 选型不一致。本次为既有界面修正，阶段 3/P01 保持待开始。
- 核查：此前确有 Button 和原 AI Elements 接入，但设置的 input/select/label/details，以及侧栏原生按钮没有统一；没有把“安装了组件”当成“业务使用一致”。
- 完成：业务按钮统一 Button；设置与会话重命名使用 Input/Label；输入占位使用 Textarea；设置的主题/供应商/权限/作用域使用现有 Radix Select，SelectField 只组合原有组件；开发者折叠区改为 Collapsible。保留精简布局与真实功能边界，没有引入另一套 UI 或迁移 AI patterns。
- 来源：Input/Textarea/Label 来自 vercel/ai-elements 固定提交 ca8be600bfd01b3131f9bf6134b51602a71f4374 同仓配套 UI，只做别名替换/既有格式化；17 份来源/本地哈希核对通过（5 AI + 11 UI + LICENSE）。原有 14 份未改，不增加 npm 依赖。
- 约束：AGENTS.md 明确基础控件/AI 组件分工，ESLint 禁止 App/features 直接书写原生 button/input/textarea/select/option/label/details/summary。组件实现层和正常 HTML 布局不受此业务层限制。
- 文件：components/forms/SelectField.tsx、components/ui/{input,textarea,label,SOURCE}、SettingsEditor.tsx、ProviderSettingsPage.tsx、WorkspaceSidebar.tsx、WorkspacePage.tsx、App.tsx、styles.css、eslint.config.js、scripts/verify-vendor.mjs 与 vendor 清单、两个桌面脚本及 docs/ui-components.md。
- 验证：类型/Lint/生产构建/格式检查通过，30 项契约测试通过，17 份来源校验通过；verify:desktop 和 verify:persistence 退出 0，覆盖真实 combobox/option 选择、Collapsible 默认关闭、保存/导出、主题、项目/会话操作、重启持久化和原 AI 组件预览。Escape 关闭并恢复触发器焦点、侧栏无横向溢出通过。
- 视觉复核：检查 output/settings-persisted.png、ui-select-options.png 的实际渲染。首次替换为 Button 后发现其 shrink-0 默认值引起项目行横向溢出，调整项目按钮 flex/宽度并复跑通过，未删改基础 Button 上游源码。
- 边界：任务输入/发送仍按未接模型状态禁用；AI Elements 仍在开发预览，真实 Prompt Input/消息/Agent 按后续任务接入。Windows/远端 CI 未实测，V01 的维护/发行风险不变。
- 状态：现有基础控件统一完成；按用户此前的提交要求交付本次修正，具体 hash/推送回执由 Git 和最终回复报告；下一项仍为 3.1/P01。
- 打包：pnpm run pack --config.mac.identity=null 退出 0，更新本机 Devly.app；包内 verify:persistence 退出 0，确认组件选择、键盘焦点、设置/会话与系统凭据回归通过。
- 未覆盖：Windows/远端 CI 未运行；没有推进 API/Agent 或 Prompt Input 业务，没有改动品牌/标题栏配色或解除已有发行风险。
- 状态：本次 UI 统一修正完成；按用户此前要求提交本次修正，具体哈希与推送回执见 Git 和最终回复。唯一下一项仍为阶段 3/P01。

## LOG-025｜阶段 3 / 3.1 / P01：统一 Provider 契约

- 日期：2026-11-21。状态：完成。
- 变更：新增 ProviderAdapter、统一消息/图片/工具调用与结果、用量、Completion 和 text/tool/usage/finish 流事件；能力可为 unknown/supported/unsupported，未知用量为 null。业务组件只接收标准检查 DTO，不使用供应商 choices/delta/function 结构。
- 文件：src/shared/provider-contracts.ts、data-contracts.ts、src/main/providers、feature hooks。
- 验证：pnpm typecheck、pnpm lint 退出 0；pnpm test 56/56 通过，其中 26 项新增 Provider 测试覆盖参数边界及响应归一化。没有新增 npm 依赖或改动原 AI Elements/UI 源码。
- 边界/下一步：本阶段 Renderer 使用有界快照轮询展示诊断流，尚未接入任务聊天消息；继续 P02。

## LOG-026｜阶段 3 / 3.2 / P02：供应商编辑与安全凭据操作

- 日期：2026-11-21。状态：完成。
- 变更：供应商增删改、名称/协议/Base URL/手工模型 ID，删除二次确认，已有系统原生密钥设置/替换/清除接入编辑页。Base URL 拒绝非 HTTP(S)、URL 账号、查询和片段；输入说明明确 API 根路径与 HTTP 明文影响。Responses/Anthropic 明确暂未接入。
- 文件：features/provider-settings/{ProviderManager,ProviderSettingsPage,hooks}、styles.css、shared/data-contracts、data/{service,store,migrations}。
- UI：基础控件复用现有 shadcn/ui + Radix；兼容参数默认折叠，保留精简工作台与开发者选项。没有把 Key 输入放进 Renderer。
- 验证：verify:provider 在真实 Electron 中完成新建/编辑/保留删除/确认删除、模型手工兜底、重启读取；verify:data 完成密钥设置/替换/清除、引用与报告失效检查。OS 保护的独立验证见既有 verify:persistence；本轮不会用注入 AES 冒充真实 Keychain。
- 边界/下一步：Windows 密钥输入控件未实测；继续 P03。

## LOG-027｜阶段 3 / 3.3 / P03：Chat Completions 适配器

- 日期：2026-11-21。状态：完成（本地协议验证），真实供应商仍待阶段验收。
- 变更：Main 原生 fetch，实现非流式文本、SSE、多个交错工具调用分片、工具结果 ID 映射、finish/usage 标准化；JSON Schema 和图片块按显式兼容声明映射。要求完整 finish + [DONE]，拒绝不完整工具 JSON、重复/缺失 ID 和超限响应。
- 文件：src/main/providers/chat-completions.ts、shared/provider-contracts.ts、tests/providers.test.ts。
- 验证：56 项测试通过，覆盖 UTF-8 每字节分片、CRLF/注释、交错工具、usage 尾帧、非流式多工具与结果、截断/坏 JSON/HTML/2 MiB 上限；verify:provider 通过实际 loopback fetch 与桌面增量渲染、固定诊断工具结果往返。
- 边界/下一步：工具探测没有运行本地文件或命令；不是 Agent 循环。没有有效供应商/模型通过证据，不声称已接通真实服务；继续 P04。

## LOG-028｜阶段 3 / 3.4 / P04：网络生命周期和归属清理

- 日期：2026-11-21。状态：完成（本地 HTTP 验证）。
- 变更：每个 runId 绑定窗口 document owner，Abort 总超时、用户取消、组件卸载 release、页面导航/销毁取消和配置更换取消；区分认证/权限/限流/服务错误、网络/断流/超时/取消。解析 Retry-After，不自动重试、重定向或切供应商。
- 限制：4 个并发、单供应商 1 个、32 个有界快照；结束记录 10 分钟后在新检查时清理。输出不含原始错误正文/异常，Key 回显在诊断输出过滤。Main 不打印请求头或秘密。
- 文件：providers/{runtime,errors,chat-completions}、request-router、main/index、data/service、feature hooks。
- 验证：单测跨 owner 读取/取消拒绝、重复 start/并发竞争、owner 销毁取消、timeout/cancel/config changed 与旧响应写回拦截通过；真实 Electron/本地 HTTP 的 401/403/429/500、断流、1 秒超时、用户取消和关闭编辑器通过，19 个请求中观测 3 个关闭/取消路径。错误正文没有进入页面。
- 边界/下一步：真实服务的网络差异仍需联调；没有回放副作用或 Agent 取消实现；继续 P05。

## LOG-029｜阶段 3 / 3.5 / P05：连接、模型列表与独立探测

- 日期：2026-11-21。状态：待验证，代码与本地检查已完成，缺有效端点实测。
- 变更：连接检查依次验证文本、流式、工具请求及固定结果回传；每种能力有独立证据，文本成功不推导工具/流式。模型列表 GET /models 尝试失败后可手工模型 ID，单独结构化输出检查。流式预览最多 4096 字符，检查时可取消。
- 持久化：SQLite v3 增加兼容配置/修订号/检查报告；修改模型、URL、参数或凭据会清空证据。WHERE revision 条件写回拒绝陈旧结果；报告保存时间、协议所在配置、模型、固定错误和真实用量，不保存响应正文/Key。
- 验证：verify:provider 退出 0，覆盖模型列表 404 后手工文本成功、独立能力、JSON Schema、报告重启持久化和修改后的失效；verify:data 退出 0，v2→v3 保留旧模型/密钥引用，ALTER 中途失败整次回滚、版本/旧行/备份保持且可重试。
- 用户条件：用户已回复有有效端点和模型，会稍后在 Devly 内配置并联调；没有要求将 Key 发到聊天。当前本地服务明确命名“本地协议测试替身”，不能作为真实供应商通过记录。
- 下一步：完成本轮 P06 和本地收尾后，等待用户在应用内配置并对有效端点执行文本/SSE/工具往返，记录协议/模型/时间/结果；P05 仍待验证。

## LOG-030｜阶段 3 / 3.6 / P06：兼容参数与能力表

- 日期：2026-11-21。状态：完成（本地检查），阶段关闭仍依赖 P05 真实验收。
- 变更：显式选择 max_tokens / max_completion_tokens / 不发送、可空 Temperature、include_usage、工具开关、视觉/结构化输出声明和上下文数值；手工声明与测试结果区别显示。工具禁用时直接拒绝，不静默删除 tools/tool_choice；未声明视觉支持时拒绝图片；结构化输出“不支持”时禁止检查。
- 文件：ProviderManager、provider-contracts、ChatCompletionsAdapter、ProviderRuntime、数据库 v3。
- 验证：兼容参数请求正文检查、禁用能力在 fetch 前拒绝、未知能力保持未知、结构化探测与报告分离通过；实际 UI 持续使用现有组件，无新 vendored 源码或依赖组合。
- 边界：视觉与上下文窗口本阶段不做真实能力推断；手工声明不是实测。P06 的本地检查可独立完成，不绕过 P05 的真实验收条件；下一步阶段 3 核对。

## LOG-031｜阶段 3：本地收尾与待真实端点验收

- 日期：2026-11-21。状态：待验证，不进入阶段 4。
- 已有证据：类型/Lint/生产构建通过；56/56 测试、SQLite/Worker 数据检查、Electron Provider 本地 HTTP 检查通过。实际截图 output/provider-local-fixture.png 已复核，展示独立能力表、手工未知项和诊断预览；截图属于替身测试数据。
- 自动检查：新增 pnpm verify:provider 和 CI 对应步骤；用独立用户目录与 loopback HTTP 服务，不依赖外部模型、用户目录或真实凭据。异步 smoke 通过新 runId 和状态等待结束，避免将点击后尚未运行当成成功。
- 文档：新增 docs/provider-api.md（实际数据流图、能力表、错误表、协议边界与使用步骤），同步工作总表/阶段计划、README、入口、通信、本地数据、架构和技术选型。
- 交付：本机未签名 Devly.app 已生成；最终静态/回归/包内检查结果在本条继续补录。Windows/远端 CI 尚未执行，不消除既有依赖维护和发行阻断。
- 未完成验收：尚无有效第三方端点文本、SSE 与工具调用/结果的实测通过记录，不能把本地固定响应当作接通。用户稍后在 Devly 内配置端点/模型/系统保护密钥后继续 P05，完成真实验收后再将阶段 3 改为完成并定位阶段 4/P07。
- 补充加密链路：verify:provider 已通过实际 OS safeStorage 加密/替换测试密钥，Main 通过 SQLite 引用读取密文并为原生 fetch 认证，重启后继续认证，最终通过 UI 清除；扫描整个隔离 userData 不含测试密钥前缀明文。只有 Main 的原生 prompt 回调使用固定测试注入，Renderer 从未接收明文，真实 OS 输入交互由用户配置时联调。
- 最终本地检查：pnpm check 退出 0（类型、Lint、格式、56 项测试、21 份 Markdown/106 唯一任务 ID/31 连续日志、17 原组件文件、生产构建、Worker 数据）；verify:desktop 退出 0，原 AI Elements 预览、IPC 归属/订阅、紧凑窗口、项目与设置导航无回退。
- 回归与包内：verify:persistence 退出 0，双项目/会话/设置、系统保护与导出保持正确；pnpm run pack --config.mac.identity=null 退出 0，更新 release/mac-arm64/Devly.app；DEVLY_EXECUTABLE 指向该程序的 verify:provider 退出 0，包括实际 OS 密文、重启后 API 认证、清除与明文扫描。打包仍是未签名应用目录，Windows/远端 CI 未获通过状态。
- Git 交付沿用用户此前“完成后提交”的要求；构建、测试 userData、密文及截图保持忽略。具体提交与远端回执由 Git 和最终回复报告，不把提交当成真实供应商验收。

## LOG-032｜阶段 3 / P02、P05 修正：添加时设置密钥并测试连接

- 日期：2026-11-21。用户指出新增表单没有测试按钮，随后追问 API Key 入口；本轮修正接入流程，阶段 3/P05 真实端点验收仍待完成。
- 实际变更：API Key 状态与设置/替换/清除按钮移入添加表单，首次设置可自动保存元数据并进入系统原生输入；取消输入保留已有密钥。保存按钮旁增加“测试连接”，首次添加/修改后自动保存再发真实文本请求，按钮和行内结果显示运行中、成功、固定错误或取消；修改草稿后不再将旧成功当成当前配置通过。未改变配置时复用同一 Provider，不清除其他能力证据。
- 生命周期：诊断 hook 提升到 ProviderManager，配置保存/密钥替换导致编辑器重建不会丢掉测试；切换/关闭编辑器会 reset/release，设置页卸载也会释放；异步 start 的前后均检查存活与 runId，防止卸载后的迟到请求继续轮询。原有详细流式/工具检查保留，文本成功不标记工具能力。
- 文件：features/provider-settings/{ProviderManager.tsx,hooks.ts}、styles.css、scripts/smoke-provider.mjs、docs/provider-api.md、work-plan.md。
- 已有验证：类型/Lint/格式与 56 项契约/Provider 测试通过；开发版 verify:provider 退出 0，覆盖新建时密钥入口、Main 原生 prompt 回调取消/设置/替换、实际 OS 密文与认证、表单自动保存测试、成功/401 失败、草稿失效、无认证端点、重复测试不重复建 Provider、原有流式/工具/模型/取消/重启。只在测试 Main 中替换原生 prompt 回调，不把明文传入 Renderer，没有增加生产测试开关；输出目录截图已实际复核。
- 边界：上述 HTTP 端点是明确标注的本地替身，不是 DeepSeek 或用户端点实测。当前 DeepSeek 思考模式、固定 128 Token 诊断预算和 JSON Schema 差异仍需兼容工作，不把诊断失败一概当成 Key 错误；本轮没有扩大协议/参数实现范围。Windows/远端 CI 未实测。
- 下一步：更新本机应用并复核包内流程；用户配置有效端点与受保护密钥后继续 P05 的真实文本/SSE/工具往返验收，阶段位置保持阶段 3。
- 最终包内验证：pnpm run pack --config.mac.identity=null 退出 0；DEVLY_EXECUTABLE 指向新版 Devly.app 的 verify:provider 退出 0，覆盖 26 次本地请求、4 次关闭/取消路径，含表单“取消测试”、首次设置 Key 的取消/替换/清除及 OS 密文/认证/明文扫描；格式/类型/Lint、17 份原组件校验与文档结构检查通过。应用已更新，尚无真实供应商验收结论。

## LOG-033｜B01/B03/P02 界面修正：单层 ScrollArea 与窗口滚动边界

- 日期：2026-11-21。用户要求修复设置页双滚动条并使用 ScrollArea；本轮仅修正滚动和布局，阶段 3/P05 真实端点验收状态保持待验证。
- 根因证据：实际 Electron 中 innerHeight=859，设置页自身 scrollHeight=1297，同时根文档 scrollHeight=1086；Radix Select 的隐藏原生 select 使用 absolute 定位，静态坐标超出视窗（底部约 1086），缺少定位/根滚动边界使它额外撑高文档。不是两条相同滚动条简单重复绘制。
- 修正：html/body/root 限制为窗口尺寸，desktop-frame 建立定位边界；AppShell 在标题下统一使用 ScrollArea，设置/工作台/组件预览移除页面级 overflow:auto。测量层使用限定宽度、可随内容增高的弹性布局，保留 Radix 对长表单变化的测量；按 tab 重建滚动视图，页面切换回到顶部。标题栏/侧栏仍固定，局部消息/日志/侧栏滚动不混入主窗口。
- 组件来源：新增 scroll-area.tsx 来自现有 vercel/ai-elements 固定提交 ca8be600bfd01b3131f9bf6134b51602a71f4374 的配套 shadcn-ui；只替换别名并格式化，Apache-2.0 原通知保留。使用现有 radix-ui，没有增加 npm 依赖。校验清单从 17 更新到 18，原有组件哈希校验仍通过。
- 文件：App.tsx、app/AppShell.tsx、styles.css、components/ui/{scroll-area.tsx,SOURCE.md}、vendor 清单与 verify-vendor、smoke-desktop、ui-components/quality-checks、工作计划及 AGENTS。
- 已验证：类型/Lint/生产构建通过；verify:desktop 退出 0，960×680 长表单实际滚轮只移动 ScrollArea、标题/侧栏坐标固定、打开/关闭主题下拉后根文档无纵横溢出、唯一主滚动条和底部开发者入口可达，原 IPC/项目/组件预览回归通过。已检查 output/settings-scrollarea-compact.png 与 workspace-compact.png 的真实渲染，无第二根窗口滚动条，工作台布局可用。
- 边界/下一步：继续供应商表单回归与包内复核、更新本机应用；Windows/远端 CI 尚未实测，不改变真实模型或正式发行验收结论。
- 最终交付复核：开发版 verify:provider 退出 0，密钥/测试/流式与取消等既有 26 次替身请求保持通过；pnpm run pack --config.mac.identity=null 退出 0，更新本机 Devly.app；该包内 verify:desktop 退出 0，单层 ScrollArea/固定标题与侧栏/底部可达、项目与 AI 组件预览均通过。格式、类型/Lint、18 份组件来源校验和 21 份 Markdown/106 ID/33 连续日志检查通过；按此前要求提交同步，具体 hash/回执由 Git 和最终回复报告。
- Git 交付：修复本地提交为 7585304。三次普通快进推送（含 HTTP/1.1 重试）均因 GitHub 网络低速超时失败，错误为 Operation too slow，未获得远端成功回执；没有改写历史或回滚修复。本机新版应用与验证结果不受影响，网络恢复后执行 git push origin main 即可同步剩余提交。

## LOG-034｜L04/P02 首页修正：已保存模型可选与默认选择持久化

- 日期：2026-11-21。用户指出添加供应商后首页仍无法选择模型；这是原按钮仅打开设置、没有实现真实选项和保存动作导致的缺口。
- 实现：使用用户指定的原版 AI Elements ModelSelector，支持模型/供应商搜索、键盘选择、Escape 取消、当前选择标识与管理供应商入口；新保存的 Provider/模型立即可选，首页按钮显示选中模型。按 Provider UUID 与模型 ID 组合区分不同端点的同名模型；无模型 ID 或未实现协议禁用，未设 Key 的无认证端点仍允许明确选择。
- 持久化：无项目时保存应用默认 Provider/模型，有项目时保存当前项目默认值，并保留该作用域其他设置。保存完成后刷新真实状态，不用乐观显示冒充落库；编辑供应商默认模型不会暗中替换用户已选 ID，删除供应商后清空失效选择，不自动换到其他端点。没有新增 API 请求或转发代码上下文。
- 来源/依赖：ModelSelector 及配套 Dialog/Command 来自既有固定提交 ca8be600bfd01b3131f9bf6134b51602a71f4374，仅别名替换/配套格式化；6 AI + 14 UI + LICENSE 共 21 份哈希核对通过。新增 cmdk 精确版本 1.1.1（MIT，React 18/19 peer），锁文件只新增该包及对既有 Radix/React 的引用，未升级其他依赖。来源/许可证与兼容性记录已同步，不据此宣称正式可发行。
- 文件：WorkspaceModelPicker.tsx、model-options.ts、WorkspacePage/App/store/index、styles.css、原组件与来源清单、package/lock、tests/model-options.test.ts、smoke-model-picker、desktop smoke/CI，以及 README、入口、UI、Provider/依赖/检查文档。
- 已验证：类型/Lint/生产构建通过；pnpm test 60/60（新增 4 项同名模型、去重/未知协议、保留旧选择与删除不自动替换）；verify:model-picker 退出 0，实际界面新建配置后立即可选、搜索/键盘/Escape、两次重启、应用/双项目隔离、配置编辑与删除检查通过，端点收到请求数为 0。verify:desktop 退出 0，空选择器管理入口、单层 ScrollArea、既有 IPC/项目/AI 组件预览回归通过。output/workspace-model-picker.png 实际截图已复核。
- 边界：本轮修复默认选择入口，未实现 P07 的会话绑定、模型消息生成或工具运行，不把选择成功当成 API 文本/工具验收通过；阶段 3/P05 仍待有效端点实测。Windows/远端 CI 未获通过结论。
- 下一步：更新本机应用并做包内选择恢复复核，然后按此前要求提交同步。真实端点验收与阶段 4 仍按工作表执行。
- 最终交付复核：pnpm check 退出 0（类型/Lint/格式、60 项测试、21 原组件/许可证校验、21 份 Markdown/106 ID/34 连续日志、生产构建及 Worker 数据检查）。pnpm run pack --config.mac.identity=null 退出 0，更新本机 Devly.app；包内 verify:model-picker 退出 0，应用/项目选择与两次重启均通过，端点请求仍为 0。截图已复核，不把测试模型名称当成真实服务可用证明。

## LOG-035｜阶段 3 / P02 界面补充：离线品牌图标与自动识别

- 日期：2026-11-21。用户要求收集 AI 公司图标并在供应商列表截图 1 号位置解析显示。
- 实现：从固定 @lobehub/icons-static-svg 1.104.0 提取 357 个品牌 SVG，每个优先彩色；设置列表名称前为 30px 图标/12px 间距，首页 ModelSelector 触发与选项复用。优先域名、再名称/中文别名、再有边界的模型系列，未知配置使用通用图标。已知 OpenRouter/SiliconFlow 等网关优先于托管模型，模型回退悬停显示“模型系列”；没有改变协议、能力、凭据或调用行为。
- 来源：固定源码提交 5c966bad55cda839d0db663e02a2df169003ff4e、npm tarball SHA-512、各 SVG/目录/许可证 SHA-256 均保留，MIT 原文随应用 extraResources 分发。未新增 npm 包或升级锁文件，没有引入另一套 UI。资源由 Vite 打包本地 URL，彩色保持原色、单色随深浅主题调整，不请求远程图标。
- 文件：assets/provider-icons、lib/provider-brand.ts、components/provider-brand-icon.tsx、ProviderManager/WorkspaceModelPicker/styles、资源清单/通知、provider-icons 与 smoke-provider-icons 脚本、5 项单元测试、check/CI/打包配置，以及 README/UI/依赖/检查/图标文档与计划。
- 已验证：类型/Lint/生产构建、65/65 单元测试和 357 SVG 离线完整性检查通过；开发版 verify:provider-icons 退出 0，实际 Electron 验证本地加载、30px 宽高、DeepSeek/中文 Qwen/模型 Claude/通用回退、网关优先、编辑刷新、选择器复用及深浅主题，外部请求为 0，根文档无额外溢出。output/provider-brand-icons-dark.png 与 light.png 已实际查看，图标位于名称左侧且与两行文本居中。
- 边界：357 个是此版本收录的品牌（含模型/应用/基础设施），不宣称全世界全部公司；目录名称可识别全部 357 ID，域名和模型规则覆盖明确列出的常用来源，未知网关可能按用户名称/模型回退。图标识别不证明端点归属或 API 能力。没有使用用户真实 Key/端点，阶段 3/P05 仍待有效端点验收；Windows/远端 CI 未验证。
- 下一步：完成统一检查、更新本机应用并做包内图标和模型选择回归；随后按既有要求提交同步。阶段顺序保持不变。

- 最终交付复核：pnpm check 退出 0（类型/Lint/格式、65 项测试、22 份 Markdown/106 ID/35 连续日志、21 份原组件校验、357 SVG/目录/MIT 校验、生产构建和 Worker 数据检查）。pnpm run pack --config.mac.identity=null 退出 0，新版 release/mac-arm64/Devly.app 的 verify:provider-icons 与 verify:model-picker 均退出 0；包内深浅主题/资源加载、选择持久化和重启回归通过，外部请求为 0，许可证原文与包内文件逐字一致。已实际复核深浅主题截图；没有新增运行时依赖、没有调用真实模型。Windows/远端 CI 与阶段 3 真实端点仍待验证。

## LOG-036｜阶段 4 / 4.1 / P07：独立会话模型绑定与历史授权

- 日期：2026-11-22；用户明确要求完成阶段 4，优先于原顺序，阶段 3 的真实验收缺口仍保留。
- 实际变更：SQLite v4 给会话保存 Provider UUID/model，新会话从项目设置取初值；已有会话不被默认设置暗中替换。回合记录实际 Provider/model/revision，旧回合不被切换改写；生成中拒绝改绑定。旧版无绑定会话要求明确选模型。
- 历史处理：原 ModelSelector 组合层提供取消、保留历史并切换、新建会话使用三种结果；Main 再校验 allowHistory。切换本身没有 HTTP；下一次发送才使用明确授权后的成功历史，不自动发项目文件或切换其他端点。
- 文件：shared/chat-contracts/data-contracts、main/chat/repository、data/{migrations,store,service}、features/chat/ChatWorkspace、App/store 组合及 chat.md。
- 验证：类型/Lint、pnpm verify:chat 和实际 Electron verify:chat-ui 通过；已有历史切换不授权被拒、旧回合身份保持、弹窗取消/保留/新建和零切换请求、两项目/会话隔离均有实际检查。数据库迁移保留旧数据并先处理旧活动记录再创建唯一索引。
- 收口保护：会话绑定与项目默认模型在同一事务保存；发送携带 expectedProviderId/expectedModel，旧界面与实际绑定不一致时发 HTTP 前拒绝。切换期间导航不会写入另一项目的设置。
- 状态：P07 本地实现完成；阶段真实端点仍待正常凭据环境验收。下一步进入本阶段 A01，不展开阶段 5。

## LOG-037｜阶段 4 / 4.2 / A01：独立聊天回合与持久化生命周期

- 日期：2026-11-22。Main ChatRuntime 管理每会话单活动回合、最多四个后台生成；Renderer 只读本地快照，切换页面/重载不会移交归属或重发。共享 phase 定义准备、执行、停止、失败和完成，等待审批/工具状态只预留，不伪造执行。
- 开始在 Worker 事务中写回合/用户消息/助手占位与 text 分段；累计文本约 80ms 保存，结束保存状态、finish 和供应商实际用量。输出参数用项目 maxTokens，缺少用量保留 null，不计算虚构费用。上下文只取完整成功回合，超过条数/字节上限明确拒绝，不静默截断。
- 网络/凭据：Abort、120s 上限、配置变化取消、固定 Provider 错误；明文仅 Main 解密使用。SecretRedactor 在发布/入库前处理跨分段的 Key 回显；异常响应体不返回 Renderer。接受后的任务不因 UI 刷新错误重复发送。
- 恢复与关闭：停止保留部分文本，重发新建回合；正常退出等任务终结后关闭数据库，启动将旧运行记录标 INTERRUPTED，不自动续发。归档/移除项目先停止相应任务，作用域复合检查防止跨项目取消。
- 文件：src/main/chat/、data/service/store/migrations、main/index、共享契约、electron.vite.config、scripts/{chat.integration,verify-chat}、tests/chat-contracts。
- 验证：pnpm test 70 项通过；Electron ABI 的 SQLite Worker/ChatRuntime 集成通过，覆盖配对写入、历史绑定/上下文、并发、取消、401/断流/意外工具、凭据回显、分页、重启和 v3 升级恢复；原 verify:data 外键检查适配新增唯一约束后通过。等待审批和工具循环未启用，费用预算/复杂 Agent 恢复仍为后续任务。
- 状态：A01 本地实现完成；下一步 U01/U02 的界面与验收。

## LOG-038｜阶段 4 / 4.3 / U01：原版 Prompt Input 与发送/停止策略

- 日期：2026-11-22。任务空状态和会话底部接入用户指定的原 PromptInput/Body/Textarea/Footer/Submit；文字可编辑，空白不发送，Enter 提交、Shift+Enter 换行，组合输入遵守上游 composing guard。生成期间当前输入锁定，显示停止；保存/请求准备失败保留受控草稿。
- 来源：固定 vercel/ai-elements ca8be600bfd01b3131f9bf6134b51602a71f4374 新增 Prompt Input 及 DropdownMenu/HoverCard/InputGroup/Spinner；只替换既有别名/配套格式化，7 AI + 18 UI + LICENSE 共 26 份来源哈希通过。Apache 通知随包分发。
- 依赖：nanoid 精确 3.3.20，沿用已有传递版本、MIT；离线安装只增加锁文件 importer 引用，没有下载/升级其他依赖或运行生命周期，不声称旧主版本是最新维护线。
- 附件边界：保留明确禁用的入口，粘贴/拖入文件提示当前纯文本，不把本地附件索引能力说成模型输入已支持；附件发送归阶段 11。
- 文件：原组件/来源清单、features/chat、WorkspacePage/App/AppShell、styles、package/lock 和 smoke-desktop/model-picker。
- 验证：类型/Lint/格式与生产构建、26 份原组件校验通过；实际 Electron 检查空输入、键盘发送/换行、锁定/停止、恢复输入和原项目/设置入口。真实系统中文输入法尚无单独人工验收，组合期间的避免提交遵循原组件实现。
- 状态：U01 本地实现完成；继续 U02 验收和包内复核。

## LOG-039｜阶段 4 / 4.4 / U02：消息历史、局部 ScrollArea 与重启续聊

- 日期：2026-11-22。ChatHistory 复用原 Conversation/Message/MessageResponse，消息区通过同源 Radix ScrollArea + ScrollBar 接入原底部跟随上下文，不修改上游文件；外层 AppShell 保持固定边界。首次读 20 条、按游标加载更早消息，主动上滚不被新分段拉回，回到底部恢复跟随。
- 生命周期：useChat 按明确项目/会话轮询最新回合，卸载清定时器并拒绝迟到结果；新回合接受后较旧快照不能回退状态。首次发送自动建会话，标题用输入摘要；历史消息、错误/取消状态与实际模型可重启读取并继续，不展示假计划/工具/测试结果。
- 文件：features/chat/{use-chat,ChatHistory,ChatWorkspace}、纯 WorkspacePage、AppShell/styles、scripts/smoke-chat、CI/check 入口，以及 README、chat/架构/数据/入口/契约/组件/检查/阶段/依赖文档。
- 验证：开发版 verify:chat-ui 退出 0，21 次 loopback HTTP 请求覆盖连续上下文、两会话/项目、渲染重载不重发、取消/重发、模型历史授权/新建、20 条分页、长分段上滚和回到底部、应用退出重启继续；verify:desktop 通过原导航/IPC/组件/单层页面滚动回归。实际复核聊天页与切换确认截图，修正工具栏项目名被不必要截短；包内最终结果随后记录。
- 真实尝试：只读检查到已保存 DeepSeek / chat-completions / deepseek-v4-1-flash-261017；隔离验收目录仅复制必要元数据及受保护密文，未输出 Key、未发送项目文件或更改原资料。Provider 文本检查返回 CREDENTIAL，聊天准备未获接受，因此没有真实端点通过记录；此结果不等于 HTTP 401。一次性密文复制检查未加入产品或 CI，不尝试削弱系统保护。
- 滚动复核：包内首次滚动检查失败；该检查未等待滚轮落地，绝对位移断言也无法区分继续上移与向下回拉。改为先等待真实上移，再验证新分段不向下拉回；Radix 视口同时明确将向上滚轮/翻页键接入原上下文 stopScroll，避免混合 overflow 样式下仅依赖原库查找滚动祖先的差异。不修改原组件。最终包内结果随后记录。
- 状态：U02 本地实现完成，P07/A01/U01/U02 小项可交付；阶段 4 整体验收为待验证，真实消息与正常凭据环境下的重启续聊不勾选。阶段 3/P05 仍待真实文本/流式/工具验证，阶段 5 未开始。
- 最终交付复核：最终源码 pnpm check 退出 0（类型/Lint/格式、70 项测试、23 份 Markdown/106 ID/39 连续日志、26 份原组件校验、离线品牌资源、生产构建、SQLite Worker 与 30 次注入协议请求的聊天集成）。最终未签名 macOS 应用目录打包退出 0；包内 verify:chat-ui、verify:model-picker、verify:persistence、verify:provider 均退出 0。聊天 21 次 loopback 请求与两次启动、模型选择零请求、Provider 26 次替身请求/4 次取消、实际 OS 密文替换与重启读取均通过；没有把这些当作真实供应商验收。
- 包内滚动证据：滚轮前 scrollTop=1700，主动上滚后=500，后续分段后仍=500；960×680 输入与模型入口可达、根窗口无溢出，实际紧凑截图已复核。原 AI 与品牌许可证和包内文件逐字一致。新版应用位于 release/mac-arm64/Devly.app，非签名安装包；Windows/远端 CI 未据本机结果标为通过。
- Git 交付：功能提交 a56cfd0 已生成；首轮 GitHub HTTPS 推送返回 Operation too slow，正在重试，未将本地提交误标为远端成功。能力矩阵同时校正为同协议切换/聊天历史/中断核对已实现，多协议与 Agent 恢复未实现；最终远端回执由 Git 和回复报告。
- 唯一下一步：在正常 Devly 系统授权环境使用可读 Key 完成真实消息与重启续聊验收，记录结果；不能把本地替身、复制密文失败或 .app 构建当成真实供应商通过。

## LOG-040｜L04/B01 设置界面修正：功能分组与快速导航

- 日期：2026-11-22。用户要求“设置进行分组”；本次调整设置布局与分类，不推进新的业务阶段。
- 实际变更：设置分为模型供应商、外观、默认模型、权限与限额、开发者五组，增加带图标和选中状态的固定分类导航。点击后只滚动原 AppShell ScrollArea 到相应组，不新增整页滚动；删除重复的供应商概览装饰，组内保留完整编辑与诊断入口。
- 状态与保存：SettingsGroup 为纯布局，ProviderManager 和偏好表单保持挂载，分组定位不丢未保存草稿。应用/当前项目范围、原保存/导出、原生 Key 与连接操作继续使用现有实现。工具权限/费用限额的提示明确为后续生效，不将未保存草稿说成已保存。
- 文件：features/provider-settings/{ProviderSettingsPage,SettingsEditor,SettingsGroup}.tsx、styles.css、scripts/smoke-desktop/smoke-persistence，以及 README、work-plan、provider-entry、ui-components。
- 验证：类型/Lint/生产构建通过；开发版 verify:desktop 和 verify:persistence 均退出 0，五个分类定位、未保存默认模型往返保留、原项目/设置/组件入口、960×680 无根溢出/单层滚动、设置保存/主题/导出/重启和真实 OS 加密往返通过。分组标题与输入同名后，将测试定位明确为 textbox，避免把 region 误当输入；没有为布局添加实现镜像单元测试。实际复核 output/settings-groups.png。
- 最终复核：pnpm check 退出 0（70 项测试、23 份 Markdown/106 ID/40 连续日志、26 份原组件、品牌资源、生产构建及数据/聊天集成）。未签名 macOS 应用目录更新成功；包内 verify:desktop、verify:persistence、verify:provider 全部退出 0，分组/草稿/单层滚动/960×680、真实 OS 密文往返和原供应商 26 次替身请求/4 次取消保持通过。设置界面实际截图已复核；应用目录为 release/mac-arm64/Devly.app。
- 边界：无新增依赖、无主进程/数据库变更；阶段 4 的真实 API 验收仍待正常凭据环境完成，Windows/远端 CI 不据本机检查自动判通过。后续进行包内复核并按既有要求提交同步。

## LOG-041｜P03/P04/A01/U02：火山方舟流式帧兼容修复与真实验收

- 日期：2026-11-22；用户报告已添加供应商、非流式测试连接成功，聊天却显示 INVALID_RESPONSE。本次为阶段 3/3.3/P03、3.4/P04、3.5/P05 与阶段 4/A01/U02 的兼容修复及验收收尾，不扩展 Agent 功能。
- 根因与实测：在原资料只读核对失败回合的状态/错误码后，用独立临时资料启动包内 Devly；Main 读取选定 Provider 的受保护密钥，仅发送固定诊断文字。火山方舟返回 HTTP 200、text/event-stream，7 个安全帧摘要显示中间帧省略 finish_reason，最后一帧返回 stop，再有 [DONE]；原 chunkWire 要求字段存在，因此首帧被拒绝。没有输出原始响应、思考内容、Key 或 Authorization；非流式连接检查通过不能替代 SSE 检查。
- 实际修改：仅流式 chunk 的 finish_reason 改为可省略；只有非 null/undefined 的结束原因才进入终态。非流式结束字段要求保持；流式仍要求明确语义终态与 [DONE]，保留终态后正文拒绝、类型/单 choice/工具 ID 与参数校验。没有自动重试、改变模型/供应商、增加依赖或绕过凭据保护。
- 回归：providers.test.ts 新增 5 项，覆盖省略字段的思考帧到正文/终态、UTF-8 拆分、工具参数组装、仅 [DONE] 或 EOF 无终态、非法字段类型及终态后正文。聊天 Worker 集成和桌面 loopback 的默认中间帧改为省略字段，原测试继续覆盖 null 形式。
- 真实验收：协议 chat-completions（OpenAI-compatible Chat Completions）；端点 https://ark.cn-beijing.volces.com/api/v3；模型 deepseek-v4-1-flash-261017；使用用户明确选择且已保存的配置、临时空项目，不读取项目文件。包内 ProviderRuntime 的 text、streaming、tools 三项均 ok；tools 包含模型生成固定诊断调用、Main 返回固定结果后再次请求，不执行本地业务工具。普通聊天收到指定标记；关闭再启动后历史保留，再询问上一轮标记得到匹配回复，数据库共 4 条用户/助手消息。一次性联调脚本与安全结果留在忽略的 .cache，不纳入自动检查，不复制密钥到代码或文档；原用户资料/会话未改写。
- 涉及文件：src/main/providers/chat-completions.ts、tests/providers.test.ts、scripts/chat.integration.mjs、scripts/smoke-chat.mjs；README.md、docs/chat.md、docs/provider-api.md、docs/development-plan.md、docs/work-plan.md、docs/work-log.md。
- 验证命令与结果：pnpm check 退出 0（类型/Lint/格式、75 项测试、原组件/图标校验、生产构建、SQLite Worker 和 30 次注入协议聊天请求）；pnpm exec electron-builder --dir --config.electronDist=node_modules/electron/dist --config.mac.identity=null 退出 0；DEVLY_EXECUTABLE 指向 release/mac-arm64/Devly.app 的 verify:chat-ui 退出 0（21 次本地 HTTP、两次启动、会话/项目隔离、停止/重发、分页、上滚保持及历史续聊）。包内一次性真实联调退出 0，text/streaming/tools 与 firstStream/restartContinuation 全部 passed。
- 状态变化：P05 待验证 → 完成；阶段 3、4 各项验收有独立证据后改为完成并归档，下一项阶段 5/5.1/T01，待开始。真实结果仅对上述端点/模型/当次配置成立；工具探测不是 Agent 闭环，视觉/结构化/其他协议、Windows、远端 CI、签名/公证和正式发行仍未验收。本轮不实现阶段 5。
- 本机应用：release/mac-arm64/Devly.app 已更新为修复版本，当前运行中的旧进程需要退出后重开才能载入 Main 改动；没有强制关闭用户窗口。按既有要求提交并同步 GitHub，最终提交哈希和推送回执见 Git。

## LOG-042｜L02/L06/U02：项目与最近聊天独立、新建入口

- 日期：2026-11-22；用户要求会话和分组分开，随后提供“新聊天 / 项目 / 最近”侧栏参考。本轮按截图实现独立项目区和跨项目最近聊天，而非自定义分组实体。
- 实际修改：顶部固定“新聊天”；项目区分别提供原生“新建项目”和“打开项目”；最近聊天全局按更新时间分页，点击后切换所属项目并恢复会话。项目区、最近区使用同源 ScrollArea，根窗口/设置按钮保持固定；新建期间禁用重复入口。空会话默认“新会话”，原“新任务”默认标题仍兼容首次消息命名。SessionRow 保留重命名、归档与恢复。
- 无项目聊天：sessions.general 在私有存储中建立 managed 的内部归属；用户可直接新建或发送普通聊天，无需选文件夹，该归属不显示成项目。Main 拒绝对 managed 归属启动只读 Agent；普通聊天不读取文件。真实项目仍由用户原生选择或创建，移除只删记录。跨项目最近列表各操作按 session.projectId 核对，避免对当前项目错发重命名/归档。
- 数据与文件：SQLite v6 的 projects.managed 保留原项目 ID；新增 sessions.recent、sessions.general、projects.create 严格契约。涉及 data-contracts、DataStore/LocalDataService、Main 原生提示、WorkspaceSidebar、store、App、ChatWorkspace/use-chat、use-create-project、样式和桌面脚本。
- 验证：类型与静态检查通过；此前隔离桌面 persistence 检查已通过项目/最近区、新建项目、跨项目选择、重命名/归档/分页/重启、960×680 有界布局及 OS 凭据往返。新增通用聊天的最终回归和最终包内结果在本日志末尾追加；不把代码存在当作已运行。截图 output/sidebar-projects-recent-compact.png 已复核，并修正 Radix viewport 子层 table 导致的长标题撑宽。
- 边界：新建项目只在用户原生对话框确认后创建空目录，不覆盖已有路径，不是模型工具；不增加自定义分组表。当前进程的显式模式选择只记到对应会话，重启默认普通聊天；工具历史保留。原用户资料不用于桌面替身测试，不强制关闭用户应用。

- 最终复核：修正旧测试仍预期“新聊天弹选目录”的脚本后，最终包内 verify:persistence 退出 0，独立通用聊天、原生新建项目、跨项目最近选择、分页/归档/重启、OS 密文往返及 960×680 布局通过。verify:chat-ui 退出 0，22 次 loopback 请求含无项目首条聊天、会话隔离和历史续聊；根与侧栏无溢出。应用已更新，侧栏与工具实际截图复核完成。LOG-042 事项完成。

## LOG-043｜阶段 5：只读工具、上下文、多轮 Agent 与真实验收

- 日期：2026-11-22；用户要求完成阶段 5，按 5.1–5.9 实现 T01/T02/T03/T09/A02/A03/A04/A05/U03。本记录覆盖各步骤实现与验收，完整机制和使用见 read-only-agent.md。
- 5.1/T01：独立只读注册表仅暴露 list_files/read_file/search_text；Zod strict 参数及 JSON Schema，原始模型字符串不进入命令或任意函数执行。未知 write_file/__proto__、未知字段、错类型、无效 JSON 均验证拒绝。
- 5.2/T02、5.3/T03：canonical 项目根、相对路径/16 层限制、逐层符号链接拒绝、最终 NOFOLLOW、inode/大小/mtime 及读后检查；UTF-8/二进制/256 KiB 文件边界、行号/分页、12000 字符正文；字面量搜索、500 文件/2000 项/16 层上限及明确截断。固定敏感目录/文件和根/嵌套 .gitignore 过滤，当前 Key 与常见秘密文本拒绝发送。
- 5.4/T09：流式参数 proposed、实际执行 running、真实完成/失败/取消记录；参数、结果脱敏后写 SQLite payload。完整脱敏工具输出落 UUID blob，卡片保留摘要、截断标志和日志引用；超存储配额/写失败明确返回本地错误。沿用 256 MiB 总配额、分页读取/显式 prune，日志清理后提示失败，不伪造恢复。没有未脱敏“原始秘密备份”。
- 5.5/A02：只读系统策略优先于当前用户任务和低可信项目资料；根及选中文件祖先 AGENTS.md 有路径/作用域顺序，read_file 动态附带嵌套约定。项目文件/工具输出不升级成 system。历史数据库有界摘录、最近消息、明确标注的旧历史摘要、选中文件和工具来源可追踪；当前请求不静默截断。
- 5.6/A03、5.7/A04：模型 SSE → 完整调用与参数校验 → 顺序执行只读工具 → 对应 toolCallId 回传 → 再次模型请求，直到真实终答。支持多个调用和参数分片；未收到有效终态 + [DONE] 不派发。思考模式 reasoning 在 Main 回合内回放，保持 API 兼容，不混入 Renderer 正文/工具日志。重复调用 ID、断流、坏 JSON 不执行。
- 5.8/A05：应用/项目 agentLimits 约束轮数、调用次数、模型/工具循环时间、累计文本/工具输出、上下文字节；maxTokens 是累计输出额度，每轮最多预留 2048，缺用量则保守扣预留，真实用量未知保持 null。较早历史/工具结果压缩为显式不完整摘录，保留本地记录和调用关联；不足时明确停止。费用 USD 仍是偏好，未宣称计费硬上限。
- 5.9/U03：显式模式开关、发送范围/选中文件、原 Message/Tool 卡片、调用 ID、参数/结果、脱敏日志查看、错误/取消状态均接入真实运行记录。工具卡片重启恢复；活动回合/调用在重启标中断，不重放。普通聊天不自动调用文件工具；通用聊天由 Main 拒绝 Agent 文件范围。
- 文件：src/main/agent/{tools,context,runner}.ts，chat/runtime/repository，providers/chat-completions，data/{store,service,migrations}，shared/agent/chat/data/provider 契约；Renderer AgentTrace/ChatWorkspace/ChatHistory/use-chat/SettingsEditor 与 sidebar/store；agent-tools.test、agent.integration、verify-agent、smoke-agent、verify-agent-live/live-agent-seed、check/package/lock、打包许可证及说明文档。
- 本地验证：新增 9 项工具/上下文单测，现共 84 项；verify:data、verify:chat（30 次注入请求）、verify:agent（17 次注入请求）通过。Agent 集成检查真实适配器/SQLite Worker、搜索→读取→回答、参数半包与坏 JSON、未知写工具拒绝、日志和重启、取消/超时/调用/轮数/Token/输出限额；verify:agent-ui 的 4 次 loopback 请求通过原 Tool、日志查看、重启不重放、半包取消与紧凑布局。普通聊天 21 次旧替身回归通过；通用聊天及最终应用的复核结果末尾追加。
- 真实验收：火山方舟 https://ark.cn-beijing.volces.com/api/v3，chat-completions，deepseek-v4-1-flash-261017。显式选定受保护配置，在独立临时 profile/自动生成的样例项目完成 3 轮、2 次工具调用：search_text completed → read_file completed → 随机口令匹配；两次调用 ID 对应且都有本地日志引用，重启恢复工具与回复。原项目代码与原会话未发送/改写，Key 只在包内 Main 解密，不进入输出。一次性脚本必须显式给 profile/Provider UUID/包路径，不纳入 check/CI；返回安全结果，不记录口令、Key 或原始响应。
- 新依赖：固定 ignore 7.0.16，MIT，离线复用缓存，Git 忽略语义测试通过；原许可证打入应用 licenses/ignore.LICENSE。依赖盘点 61 个直接依赖、922 个 name@version；没有将此盘点冒称远程安全审计或消除旧发行阻断。
- 边界与下一步：本阶段只读，无写入、命令、审批或 OS 沙箱完成承诺；应用层路径检查不代替后续平台隔离。Windows、远端 CI、签名、公证/正式安装包仍未验收。最终包内回归完成后归档阶段 5，唯一下一项阶段 6/6.1/T04，不在本轮展开。

- 最终交付复核：最终源码 pnpm check 退出 0（类型/Lint/格式、84 项测试、24 份 Markdown/106 ID/43 连续日志、26 份原组件与品牌资源校验、生产构建、verify:data、verify:chat 30 次注入请求、verify:agent 17 次注入请求）。最终未签名应用目录打包退出 0，包内 verify:agent-ui（4 次 loopback）、verify:persistence、verify:chat-ui（22 次 loopback）全部退出 0；ignore 许可证包内文件与原文 cmp 一致。最终包再次真实验收退出 0：chat-completions / deepseek-v4-1-flash-261017，3 轮/2 工具、随机口令匹配、两条完整日志引用和重启恢复通过。原项目未用作真实 API 样例，没有输出 Key 或原始供应商响应。
- 额外边界修正：输出额度不足或日志保存失败时，已读取但尚未持久化终态的工具统一收尾为明确失败，避免卡片残留“执行中”；新增 no-output-left 集成用例，17 次请求验证额度不足后的失败状态与空日志引用。JSON 属性形式的秘密及 Unicode 转义 Key 也有脱敏/拒绝回归，单测总数仍为 84。
- 工具终态修正后复核：最新源码类型/Lint/格式通过，生产构建和 17 次 Agent 注入请求通过；最新包的 verify:agent-ui 及真实 API 验收再次退出 0，仍为 3 轮/2 次成功工具、日志引用与重启恢复，打包 ignore 许可证逐字一致。普通聊天/项目桌面回归在工具终态修正前通过；修正后的包内复核覆盖 Agent 与真实 API。
- 最终状态：阶段 5 的 9/9 项及 3 条阶段验收完成并归档；当前唯一下一项阶段 6/6.1/T04，待开始。本轮没有启用写入、命令或审批。release/mac-arm64/Devly.app 已更新；用户需完全退出旧进程后重开。按既有要求提交同步，哈希/推送回执见 Git。

## LOG-044｜L04/B01：设置分类独立显示与按组保存

- 日期：2026-11-22；用户指出所有配置仍堆在一起，要求各组只能看到对应配置。本次替换 LOG-040 的滚动定位方案，不推进阶段 6。
- 实际修改：模型供应商、外观、默认模型、权限与限额、开发者五组变为独立内容切换；任一时刻仅当前组可见。隐藏供应商/开发者面板保留内部状态，偏好组件保留字段草稿，只渲染当前组控件；设置范围与保存/导出不在供应商或开发者页出现。分类切换复位现有 ScrollArea，不新增主滚动层，移除末组多余顶部间距。
- 保存行为：外观仅保存主题，模型仅保存默认供应商/模型，权限仅保存权限/Token/费用偏好/agentLimits；其余值取最新持久化基线。跨组未保存值继续保留，隐藏非法数字不阻断其他组保存，也不会被提交。成功/错误关联发起组；仅清除仍匹配提交值的草稿。导出沿用当前作用域的已保存完整偏好，不导出草稿或秘密。
- 文件：ProviderSettingsPage.tsx、SettingsEditor.tsx、SettingsGroup.tsx、styles.css；smoke-desktop/smoke-persistence；README、provider-entry、ui-components、work-plan 与本日志。
- 验证：pnpm check 退出 0，84 项测试、类型/Lint/格式、构建与既有 Worker/协议检查通过。开发版 verify:desktop、verify:persistence 退出 0，五组唯一可见、模型/供应商草稿往返、隐藏 Token=0 不阻断外观保存、模型草稿不被外观保存提交、之后分组保存与双项目重启/主题/导出通过。沿用真实 OS 密文往返检查，未使用真实 API 或用户密钥。
- 状态与边界：本次分类修正完成；阶段 5 保持已验收、阶段 6/T04 待开始。无依赖、IPC、数据库或模型协议变更；Windows、远端 CI、签名与正式安装包不依据本机检查判通过。最终应用目录与包内复核在下方追加。

- 最终交付复核：未签名 macOS 应用目录更新成功；包内 verify:desktop、verify:persistence、verify:provider 全部退出 0，覆盖 5 组唯一可见/高亮一致、草稿与按组保存、双项目重启、OS 密文往返、960×680 主滚动边界，以及供应商 26 次 loopback 请求/4 次取消。实际复核 output/settings-category-developer.png 与 appearance.png，截图等待颜色过渡结束。pnpm check:docs 检查 24 份 Markdown/106 ID/44 连续日志通过；工作位置仍为阶段 6/T04 待开始。release/mac-arm64/Devly.app 已更新，用户完全退出旧进程后重开；按既有要求提交同步，哈希见 Git。

## LOG-045｜供应商用量、预算与可查询账户额度

- 日期：2026-11-22。
- 阶段 / 步骤 / 任务 ID：用户指定补充 U06（部分完成）、L01/L04/P06；阶段 6 写入/命令主线不因本次补充而跳过验收。
- 用户目标：同时展示本地已用 Token、本地预算剩余与可查询的第三方账户额度。
- 实际完成：第六个设置分类“用量与额度”独立显示；按供应商汇总输入/输出/累计 Token 和已上报回合覆盖数，区分缺失与 0、已确认下限和剩余上限。预算独立保存、校验、清空、重启恢复及从现在重新计数；不删除历史、不阻止请求。Main 接入 DeepSeek 官方金额余额查询，精确匹配配置域名，禁止跳转、超时/大小/并发受限、归属取消、配置变更抑制和固定错误；火山/代理显示未接入而非虚构剩余 Token。
- 涉及文件：shared/usage-contracts.ts 与 data-contracts.ts；Main 的 data migrations/store/service 和 providers/account-usage.ts；设置 UsagePanel/usage-hooks/SettingsGroup/ProviderSettingsPage、styles；usage.test.ts、usage.integration.mjs、smoke-usage.mjs，以及原有 data/chat/desktop 验证入口；README、usage-and-budget、local-data、provider-api、architecture 与本计划/日志。
- 已完成验证：pnpm typecheck、pnpm lint 退出 0；pnpm test 106 项通过；pnpm build:bundle 和 verify:data 退出 0。SQLite Worker 实际验证累计/未知/零值、预算非法参数不覆盖、重启、独立供应商与重新计数、移除预算保留历史。新 smoke 首次定位器使用“设置”而现有按钮 aria-label 为“打开设置”，修正测试定位器后 verify:usage-ui 退出 0：两次 loopback 聊天、精确/上限/超额预算、切换供应商、重启、账户未接入/无 Key 提示与 960×680 根边界。账户测试初次配置变更 fixture 共享了可变对象，改为模拟 Worker 的结构化拷贝后测试通过。
- 人工证据：检查 output/usage-local-budget.png、usage-compact.png 与最终包内 usage-ark-account.png，确认独立分类、统计卡片、≥ 下限、至多剩余、账户未接入说明和主滚动布局。截图均是隔离替身数据，不是用户真实账户或计费证据。
- 未覆盖：未使用真实 DeepSeek 官方账户 Key 验证余额接口；火山管理鉴权与其他账户适配器未实现，账户级累计/剩余 Token 无通用来源。连接测试和跨设备消耗不纳入本机聊天统计，现有 Agent 缺失轮次不反推用量。U06 的回合上下文占用/未知费用界面仍未完整验收。
- 最终检查：pnpm check 全部退出 0，含 106 项单测、25 份 Markdown/106 ID/45 连续日志、26 原组件校验、图标校验、生产构建和 data/chat/agent 集成。electron-builder --dir（identity=null）成功更新 release/mac-arm64/Devly.app；包内 verify:usage-ui 和 verify:desktop 均退出 0，覆盖两次 loopback 聊天、预算重启与六组唯一可见，Renderer 无 pageerror。
- 状态与下一步：本次新增用量界面完成；U06 总项保持部分完成，阶段 6 原主线仍待开始。用户须完全退出旧 Devly 进程后重开更新的应用目录；按既有授权提交同步，哈希以 Git 为准。Windows/远端 CI/签名和正式安装包不依据本轮 macOS 验证判通过。

## LOG-046｜阶段 6 首批基础：Git 基线与未开放的执行/审批原型

- 日期：2026-11-26；任务：6.1/G02、6.2/T04、6.3/T05、6.4/T06、6.5/T07、6.6/T08。阶段 6 整体进行中，未验收，禁止进入阶段 7。
- G02：只调用系统 Git 的只读 root/HEAD/status 命令，禁用 fsmonitor/可选锁与交互，输出和时间受限；支持非 Git/未首次提交的项目。Agent 准备和 finally 收尾保存前后状态至既有 agent_info，历史恢复和界面可查看初始状态数量。状态差异明确只作观察，不把用户原有变更归因 Agent；指纹是 Git 状态指纹，不是文件内容版本。
- T04 原型：严格参数、内容摘要预期版本、项目路径/符号链接/硬链接/大小限制、新文件 no-replace 发布、项目级串行、逐文件成功/冲突/失败/取消。临时文件 flush 后发布；部分结果不伪装事务。尚缺完整 diff 预览、审批绑定；既有文件在最终 hash 检查到 rename 间仍存在非协作写入竞态，父目录替换也需进一步约束，因此只标部分完成且不注册工具。
- T05/T07 原型：只继承明确 PATH/locale，不继承 Provider 环境；macOS deny-default sandbox-exec、cwd 限定、stdout/stderr/信号/退出码、时间/输出预算、进程组 TERM/KILL。为防跨分段秘密泄漏，目前缓冲后脱敏返回，不声称实现实时流输出。缺少受限配置成功验收、逃逸进程树验证和完整敏感目录拒绝规则；不存在无沙箱降级。
- T06/T08 原型：审批 ID 绑定项目/会话/回合/调用及参数 digest，单次消费、拒绝/过期/取消/关闭收尾均有检查。尚未连接数据库审批表、Renderer 请求、原 Confirmation/Plan/Task，不能作为持久化审批闭环完成证据。
- 文件：main/agent/{git-baseline,patch-executor,command-executor,approval-broker}.ts、context/runner、chat/runtime；shared agent/chat/data 契约默认兼容旧历史；AgentTrace；execution-foundation/host-execution 测试及 agent.integration；work-plan、execution-foundation、README、architecture。
- 初步检查：类型/Lint 退出 0；单测 115 通过，1 项原生检查默认跳过。首次四项补丁测试因 macOS /var → /private/var 别名误判失败，修正为拒绝根节点符号链接并基于 canonical 路径串行后通过。默认跳过原生检查不等于主机验收通过。
- 原生失败证据：显式 DEVLY_VERIFY_HOST_EXECUTION=1 检查在外层沙箱内得到 sandbox_apply: Operation not permitted；经授权在外层之外运行后，受限配置中的 /bin/sh 仍异常终止，exitCode=null 且无输出。允许默认配置的固定文本探针成功，说明受限 profile 仍需修正；补齐系统 metadata/配置读取后仍未通过。未通过的命令能力没有开启，没有发送真实第三方 API 请求、执行用户命令或修改用户项目。
- 门禁与状态：仅 G02 可标完成；T04/T05/T06/T08 部分完成，T07 待验证；A06/A07/U04/U05/T11 等保持未完成，U06 仍部分完成。readOnlyTools 仍恰好三个只读入口，用户界面/IPC 未增加可写模式。原本未提交的 work-plan 排版改动保留。
- 下一步：6.2/T04 的预览/审批绑定与写入竞态加固；随后修复原生命令边界、持久化审批与 Renderer 接入，再验证停止/串行/预算并逐项验收。完整统一检查结果在下方追加。

## LOG-047｜阶段 6：隔离执行、持久审批、停止与原组件闭环

- 日期：2026-11-26。
- 阶段 / 步骤 / 任务 ID：阶段 6，6.1/G02、6.2/T04、6.3/T05、6.4/T06、6.5/T07、6.6/T08、6.7/A06、6.8/A07、6.9/U04、6.10/U05、6.11/U06、6.12/T11。
- 实际变更：修复 LOG-046 的原生启动失败。系统拒绝日志表明 dyld 缺少根目录本身的读取权限；增加 literal 根目录读取后，严格 profile 可运行，未改为 allow-default。Git 改在只读 Seatbelt 中查询，隔离本地配置/过滤器的写入和网络副作用；Git 不可用不阻断非 Git 项目。
- 写入与命令：完整文件 contentHash、逐文件结果与冲突，原 inode 恢复路径；固定 Node 补丁助手与 shell 均在 deny-default Seatbelt 内。cwd/环境/输出/时间受限，UTF-8 增量解码与跨块脱敏，完整行可在进程结束前显示。超时/取消清理普通进程组；清理失败显示执行状态未知并停止循环。保留已有修改，没有自动回滚/重放。
- 审批与调度：Main 绑定项目/会话/回合/调用、approval UUID、参数 digest、60 秒有效期；响应不能替换参数，单次消费；拒绝回传模型。SQLite v8 增加 approvals.payload/index，异常重启使待审批失效。全局单修改操作保护嵌套项目；不同会话只读工作可并行，排队取消立即收尾，活动进程等待清理。
- 界面：新增项目 Agent 模式，权限为 ask 且实际系统预检通过才执行；其余模式不扩权。原 Confirmation/Plan/Task/Shimmer 与配套 Alert/Card 固定来源接入；update_plan 完成项需关联本回合成功调用。审批自动展开并禁用已提交按钮。取消状态、状态未知与未开放跨重启续跑明确显示；可写回合不自动重发副作用。上下文显示字符估算，费用未知时不计价，maxCost 不冒充硬停止。
- 文件：main/agent 的 git-baseline、patch-core/patch-executor/patch-worker/isolated-patch、command-executor、approval-broker、execution-tools、plan、runner、context；chat/runtime/repository；shared agent/chat/data 契约；data/migrations；ChatWorkspace/use-chat/ChatHistory/AgentTrace、store、SettingsEditor/styles；原组件/来源清单；electron-vite/Builder；package/lock；execution/host/contract 测试、execution.integration/execution-crash.fixture/smoke-execution/verify-execution、verify-vendor、chat.integration 和 CI；README、架构、选型、数据/聊天/用量/依赖/执行说明及计划。
- 新依赖：motion 12.42.0，锁定 framer-motion 12.43.0、motion-dom 12.43.0、motion-utils 12.39.0，均 MIT、React 18/19 peer；四份许可证纳入构建资源。verify:vendor 从 26 扩至 32 个固定提交文件；本机依赖盘点 62 直接/926 已安装包，旧 UNKNOWN 与维护/安全发行限制不解除。
- 已有验证：pnpm test 为 118 通过、2 项原生检查默认跳过；显式 verify:execution-host 为 13 项通过，包含实际 Git 基线、目录/秘密/符号链接/网络拒绝、输出上限、跨块脱敏、命令退出与进程组取消。verify:execution 使用实际 Electron ABI/SQLite/隔离文件与命令，验证审批前无写入、错误归属/digest/重复拒绝、外部编辑冲突、拒绝回传、待审批/进程取消与无延迟写入、重启历史，以及进程突然退出后旧审批失效；HTTP 为本地注入替身。
- 桌面验证：smoke-execution 实际点击允许/拒绝、读取真实文件与命令结果、停止待审批、重启恢复与根布局；截图 output/execution-approval-pending.png、output/execution-completed.png 已查看，完整参数与按钮可见。后续增加模型计划与完整打包检查的最终结果归档于下一条。
- 发现与修正：首轮统一检查的并发用例误将获得锁顺序写死，改为只断言一成功一冲突及胜者内容。桌面测试先误断言空输入按钮应启用，修正为输入可编辑；同时发现真实 UI 在轮询刷新前能再次点旧审批，增加已答 ID 锁定，Main 本已拒绝重复。普通聊天在 mode 缺省时被错误套用压缩上下文，完整聊天集成捕获，恢复仅两种 Agent 模式压缩；数据库版本断言改随 migrations.length。Git profile close 回调的 Lint 表达式已修正。新增大小写路径规则时，原生检查发现 JSON 双重转义使 Seatbelt regex 未匹配 `.env`，已恢复常量 regex 字面量的正确转义；最终边界结果以后续显式复核为准。
- 未覆盖与边界：没有调用用户真实 API、读取真实明文 Key、修改用户项目或代用户执行真实命令。真实 API + 编辑器/Diff 样例由阶段 7/A09 验收；Windows 由阶段 12/T12 实测。不是 VM，脱离进程组的后台进程不在已验证清理保证内；最终检查到 rename 的非协作竞态不能冒充原子 CAS，原 inode 保留以便核对；个人工具链/任意构建命令未全覆盖。现有发行限制不解除。
- 状态：阶段 6 代码与当前 macOS 关键检查已落地；最后统一检查、模型计划 UI 和包内助手检查后统一收口，不将此前失败记录抹除。下一步 6.12/T11 最终验收，未进入阶段 7 开发。

## LOG-048｜阶段 6 验收归档：当前 macOS 执行链与包内复核

- 日期：2026-11-26。
- 阶段 / 步骤 / 任务 ID：阶段 6，6.1/G02 至 6.12/T11，共 12 项：G02、T04、T05、T06、T07、T08、A06、A07、U04、U05、U06、T11。
- 结果：当前 macOS 范围验收完成。LOG-046 的未开放原型与失败是中间记录，LOG-047 的执行链实现经本条最终检查收口。没有展开阶段 7 开发。
- 最终代码补充：敏感路径按大小写匹配并用 Seatbelt 正则字面量，实际 `.env` 与混合大小写 `.aWs` 拒绝通过；Git 基线只读系统约束通过。UTF-8 BOM 原先被文本解码移除会导致文件摘要不符，修正为保留 BOM 并验证 read_file → SHA-256 → 有版本替换；原始恢复字节保留。拒绝不完整 Unicode 内容，避免提案和写入内容不一致。全局修改并发 1，包含嵌套项目；审批排队超过有效期不能执行。
- 验证命令与结果：`pnpm check` 退出 0，覆盖类型/Lint/Prettier、119 项通过和 2 项默认跳过的测试、文档、32 个原组件校验、357 个图标校验、生产构建、SQLite/Worker、聊天与只读 Agent 集成；`pnpm verify:execution-host` 退出 0，14 项通过（含前述两个实际主机用例及执行基础用例）；`node scripts/verify-execution.mjs` 退出 0，7 组实际 Electron/SQLite/文件/命令/取消/重启行为。常规通过不掩盖默认跳过的主机检查，两者分开记录。
- 桌面与打包：`node scripts/smoke-execution.mjs` 在隔离开发配置通过；增加真实 update_plan 初始/完成状态，完成计划引用 read-call、patch-call、command-call，原 Plan/Task/Confirmation 可见，模型计划不是演示任务。`pnpm exec electron-builder --dir --config.electronDist=node_modules/electron/dist` 退出 0，生成 release/mac-arm64/Devly.app；设置 DEVLY_EXECUTABLE 指向该 .app 后再运行 smoke-execution 退出 0，确认 asar 内补丁助手、命令、逐次审批、拒绝、停止、重启历史与根窗口边界可用。四份 motion 系列许可证已在应用 Resources/licenses 核对。
- 截图与人工核对：output/execution-approval-pending.png、execution-completed.png、execution-plan.png；已查看完整参数、允许/拒绝按钮和计划调用关联，未增加外层滚动。截图/测试数据明确为本地协议替身，只使用自动清理的受控项目；没有发送真实 API 请求、读取用户明文 Key 或修改用户项目。
- 阶段验收核对：① 用户原有修改有基线，外部编辑冲突保留，逐文件结果/恢复版本可定位；② 审批前无执行，错作用域、错误 digest、重复、过期、拒绝、取消/重启均不扩大授权；③ HTTP、队列、审批、普通进程组的停止通过，状态未知不会伪装成功，已有修改保留且没有自动副作用重试；④ 当前 macOS 文件/敏感路径/网络/进程边界检查通过，Windows 明确留 T12。
- 边界与未覆盖：不是 VM 或通用原子 CAS；旧 inode 的恢复路径保留用于非协作竞争核对；脱组/双重 fork 后台进程未覆盖，界面明确未知范围，不授权常驻程序。系统 PATH 以外的个人工具链、外置 worktree 元数据、任意项目构建未全覆盖。Token 上下文为明确标注的字符估算，费用未知、maxCost 不承诺美元硬停止；账户覆盖范围沿用 LOG-045。真实 API + 编辑器/Diff 编程样例留阶段 7/A09，跨重启续跑留 R02，Windows 留 T12。未签名、未公证、无 DMG；旧依赖维护/安全发行阻断仍保留，远端 CI 未运行。
- 涉及文件：LOG-047 所列执行链、契约、原组件/许可证、构建与测试入口；另有 BOM/计划/审批契约回归、SettingsEditor 的费用/执行提示、CI macOS 原生和包内检查步骤；同步 README、architecture、tech-stack、local-data、chat、read-only-agent、usage-and-budget、dependency-review、execution-foundation、文档入口、development-plan 和 work-plan。开工前 work-plan 排版修改保留；没有提交或推送其他仓库。
- 状态变化：阶段 6 全部步骤与阶段验收改为完成（当前 macOS 范围），阶段总览/当前执行位置/唯一下一步已同步。下一步：阶段 7 → 7.1/G01 文件树按需展开、变化监听、忽略与安全刷新。

## LOG-049｜阶段 7 开工：文件服务、监听与本地编辑器初步接入

- 日期：2026-11-26；阶段 / 步骤 / ID：阶段 7，7.1/G01 起，关联 G03/G04/G05 的接口准备。
- 实际变更：Main 项目文件服务与严格 editor.* 契约，目录单页 100 项、按展开目录监听、owner/watch UUID 清理、删除/忽略/秘密/二进制/编码/大小限制；Renderer 文件工作区、项目内文件标签、Monaco 本地实例和内联 Worker、项目隔离的内存缓冲区、版本保存、原生未保存离开提示、HEAD→磁盘 Git Diff；保持原聊天和默认折叠文件区。
- 证据：editor-files.test 的 4 项文件/版本/范围/监听/状态解析检查通过；verify-editor 的实际 Electron/SQLite/受控 Git 文件检查通过，包含保存原版本、外部修改冲突、新增/删除/暂存重命名/二进制与监听降级。类型、Lint 和构建初步通过，原生成功不代表完整桌面流程已完成。
- 发现与处理：单测 stub 的 /var 路径不是数据库实际使用的 canonical 路径，修正 fixture，未放宽主路径检查。Monaco 公开 ScriptTarget 不导出 ES2022，使用其公开 ESNext 常量。桌面检查发现在 Diff 返回编辑/重新载入时，React wrapper 复用旧模型但没同步新值；已在 onMount 同步缓冲区并按文件实例化，待复核。目录删除不再阻止其他文件刷新；监听释放记录 tombstone 防晚到请求重建句柄；保存任务在退出前等待收尾。
- 文件：shared/editor-contracts 与 data-contracts、main/editor/{service,git}、agent/tools、data/service、main/index；Renderer features/editor、App/AppHeader/AgentTrace/styles；Vite Worker 配置；editor-files 与 editor.integration/verify-editor/smoke-editor。
- 状态/限制：G01/G03/G04/G05 尚待最后桌面与包内检查；A09 尚未通过真实 API 样例。没有扩大权限到目录外、没有把内存草稿当作崩溃恢复或 R02。开工前阶段 6 的所有未提交文件保留。
- 下一步：复核桌面模型与未保存流程，运行开发及包内离线 Worker 检查，再用既有 DeepSeek 配置在生成项目做 A09；不请求在聊天中提供 Key。

## LOG-050｜阶段 7 文件树、编辑保存与 Diff 本机验收

- 日期：2026-11-26；阶段 / 步骤 / ID：7.1/G01、7.2/G03、7.3/G04、7.4/G05。
- 实际变更：项目文件树按目录分页、忽略/敏感范围复用、按展开目录和打开文件父目录监听及降级刷新；项目隔离的 20 个内存文件缓冲区；Monaco 实例/五类 Worker 本地加载；CtrlCmd+S、版本保存、外部修改冲突、未保存比较和离开确认；真实 HEAD→磁盘 Diff、新增/删除/暂存重命名/二进制状态，以及 Agent 工具记录文件定位入口。
- 文件：LOG-049 所列 editor 服务/契约、Renderer features/editor、App/AppHeader/AgentTrace、Main 退出清理、Vite/Builder；新增 editor-buffers.test、verify-editor-live、Monaco MIT 通知，package 与 CI 编辑器检查入口；editor-and-diff.md、选型、依赖说明、文档入口与工作计划。
- 验证：`pnpm check` 退出 0，127 项测试通过、2 项主机检查默认跳过；包含新增 8 项文件/监听/模型并发检查，106 个任务 ID 与连续日志、32 原组件、357 图标、构建及 SQLite/聊天/只读 Agent 集成通过。`node scripts/verify-editor.mjs` 退出 0，实际 Electron/SQLite/隔离保存与 Git 的 4 组检查通过。默认跳过检查沿用阶段 6 的独立主机证据，本次不把跳过当通过。
- 开发/包内桌面：`DEVLY_EDITOR_VITE_DEV=1 node scripts/smoke-editor.mjs` 和 `DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly node scripts/smoke-editor.mjs` 均退出 0；实际 TS 诊断、Worker 响应、跨文件/项目草稿、保存/外部冲突/BOM/CRLF、取消重载/关闭脏标签/原生关闭窗口、文件删除与四类 Diff、固定根布局均通过。开发 Worker 为 localhost HTTP、包内为 blob；无远程 Renderer 请求、无 Worker 错误、无未处理页面错误。`electron-builder --dir` 退出 0，Resources/licenses 三份 Monaco 系列 MIT 通知存在。
- 发现与修正：桌面脚本返回项目后目录折叠，修正脚本显式展开 src。实际 Monaco wrapper 在挂载时不自动同步已缓存模型，增加缓冲区同步；Diff 默认先释放模型后销毁 widget，改为实例 URI 和销毁后释放；Monaco 0.52 的同词高亮 Delayer 在销毁时产生未处理 Canceled，关闭 occurrencesHighlight 自动高亮，保留类型诊断与其他编辑能力。没有过滤测试错误或隐藏通用页面异常。监听释放/晚到 setup 的竞态新增回归通过；保存后继续输入与旧刷新覆盖由缓冲区测试覆盖。
- 人工核对：已查看 output/editor-conflict.png（真实磁盘 5 与本地 4）、editor-git-diff.png（新增 JSON 与实际更改列表），布局有界、标签与按钮可见。测试项目均临时生成并清理，普通桌面检查没有请求第三方 API。
- 边界：当前 macOS ARM64；其他平台只读预览和后续 T12，未签名未公证、无 DMG。语言服务只覆盖打开模型；未实现 LSP/项目 tsconfig、草稿崩溃恢复、Git 提交/交互终端或持久布局。单块含 Worker 约 22.9 MB，延迟加载不等于已优化首次打开性能。保存沿用阶段 6 外部竞态/恢复版本边界。没有修改用户项目或既有 Provider。
- 状态变化：G01/G03/G04/G05 → 完成（当前 macOS 范围）；A09 → 待验证。下一步：只使用已保存的指定 DeepSeek 配置，在生成项目完成真实搜索→读取→审批补丁→审批测试→实际 Diff；不把本地替身当作真实编程验收。

## LOG-051｜阶段 7 真实编程 MVP 与阶段验收归档

- 日期：2026-11-26；阶段 / 步骤 / ID：7.5/A09，阶段 7 全部 G01/G03/G04/G05/A09 收口。
- 实际运行：`DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly DEVLY_LIVE_SOURCE_PROFILE=<既有 userData> DEVLY_LIVE_PROVIDER_ID=<用户已保存的 DeepSeek UUID> node scripts/verify-editor-live.mjs` 退出 0。真实协议 chat-completions，Base URL 为 https://ark.cn-beijing.volces.com/api/v3，模型 deepseek-v4-1-flash-261017；没有记录 Key、密文或凭据引用，没有改变源配置和既有会话。
- 样例与审批：生成独立临时 Git 项目、错误的 src/total.sh、固定 tests/verify.sh 和项目约定；仅复制指定 Provider 元数据及保护密文到临时 userData，由包内 Main 正常解密。真实模型按要求 search_text 搜索、read_file 读取源代码与测试，提出仅将减号换加号的单文件 apply_patch；操作员通过实际原 Confirmation 按钮仅批准匹配当前哈希/预期内容的补丁，再批准精确 `/bin/sh tests/verify.sh`。未发送用户项目代码、用户既有会话或任意目录内容；其他提案不授权。
- 真实结果：回合 completed，8 轮、9 次工具调用；搜索成功，3 次读取成功，补丁成功，命令成功且真实 exitCode=0，stdout 中随机测试证明匹配，测试文件字节保持不变。HEAD 原文件、实际磁盘文件和 editor.diff 返回内容一致，通过补丁卡“查看更改：src/total.sh”打开真实 Monaco Diff；output/editor-live-mvp.png 已查看，减号→加号、实际工具输入、允许结果和项目范围说明可见。
- 失败保留：9 次调用中 2 次 update_plan 为 failed、1 次为 completed；没有把两次失败重标成功，也没有用计划文字作为测试证明。A09 的文件修改/固定测试/Diff 验收独立核对通过，模型计划质量不作为所有调用成功的声明；本样例不证明任意模型、复杂项目或所有工具组合均可用。
- 其他最终验证：LOG-050 的 `pnpm check`（127 通过、2 默认跳过）、原生 editor 集成、Vite 开发与未签名 .app 内 Worker/保存/Diff 全部通过。新增包内 `DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly node scripts/smoke-execution.mjs` 退出 0，既有允许/拒绝、原 Plan/Task、停止待审批、重启审批历史和根布局回归通过。实时 API 只由本条手工脚本调用，CI 不使用个人配置。
- 文件与文档：新增 verify-editor-live 与 editor-and-diff.md；实现文件见 LOG-049/LOG-050。同步 README、架构、选型、依赖评估、数据说明、Renderer 边界、质量入口、文档入口、development-plan、work-plan；Builder 保留 Monaco 三份 MIT 通知，CI 增加 macOS 原生/开发/包内编辑器入口，远端 CI 尚未运行。本轮未新增依赖或数据库迁移。
- 阶段验收逐条：① Monaco/Worker 在实际 Vite 开发与打包 file:// 中本地运行，有响应且没有远程 Renderer 请求/未处理错误，文件/项目切换、保存与未保存提示通过；② 新增/删除/Git 已识别重命名/二进制、失效目录和外部冲突明确显示，内容来源于真实磁盘/Git；③ 指定真实 API 完成搜索→读取→审批修改→审批测试→实际 Diff，退出码与界面一致。
- 边界与剩余：当前 macOS ARM64、指定协议/端点/模型和受控样例，Windows 留阶段 12/T12；.app 未签名、未公证、无正式 DMG。项目级 LSP、草稿崩溃恢复、交互 PTY、Git 历史/暂存/提交和持久布局尚未实现；上游维护与安全发行阻断不解除。秘密保护沿用既有路径/内容规则，不把未知内容检测当作任意秘密识别保证；保存和子进程边界沿用阶段 6。已清理临时项目/配置；本轮未提交或推送，保留开工前阶段 6 未提交修改。
- 状态变化：A09 → 完成，阶段 7 → 完成（上述范围）；阶段总览、三项验收与当前执行位置同步，唯一下一步为阶段 8/8.1/G06 真实 Git 历史与原 Commit 组件。本次没有展开阶段 8 开发。

## LOG-052｜阶段 7 收尾：目录分页刷新保留与最终复核

- 日期：2026-11-26；阶段 / 步骤 / ID：阶段 7，7.1/G01，关联 G03/G04/G05 的桌面回归。
- 实际变更：最终静态复核发现，目录“加载更多”之后，定期/监听刷新可能只取第一页。WorkbenchPanel 现在记录每个目录已经请求的页范围，刷新重新读取该范围；逐目录请求序号拒绝较早响应覆盖新结果。没有增加全项目递归扫描。桌面 fixture 新建 105 个文件，加载第二页后外部新增第 106 个，要求监听刷新可见新增文件并保留原第二页。
- 文件：features/editor/ProjectWorkbench.tsx、scripts/smoke-editor.mjs；docs/setup.md 的旧“尚未实现”清单明确标为搭建历史快照，并链接当前计划；编辑器/数据说明明确敏感内容检测边界。
- 验证命令与结果：最终 `pnpm check` 退出 0（127 通过、2 默认跳过；类型/Lint/格式、27 份 Markdown、106 个任务 ID、当时 51 条日志、32 原组件、357 图标、构建及 SQLite/聊天/只读 Agent 集成）。`pnpm build`、`pnpm lint`、`electron-builder --dir` 均退出 0；重新生成当前 release/mac-arm64/Devly.app。实际 Vite 开发与该最终包的 smoke-editor 均退出 0，包含新分页/外部新增场景和此前全部保存/冲突/Diff/本地 Worker 场景；开发 HTTP 与包内 blob Worker 无错误、无远程 Renderer 请求。
- 未覆盖与影响：仅改变 Renderer 文件树分页，未改供应商/凭据/Agent 执行。A09 沿用 LOG-051 已通过的真实 8 轮/9 调用证据，没有为列表修复重复调用计费 API。macOS/平台、未签名和恢复边界不变；源配置/用户项目未改，远端 CI 未运行，未提交或推送。
- 状态：阶段 7 保持完成，G01 页范围刷新收尾通过；下一步仍为 8.1/G06。本次阶段 8 未开发。

## LOG-053｜按用户要求提交阶段 6、7 实现

- 日期：2026-11-26；阶段 / 步骤 / ID：阶段 6 的 G02/T04–T08/A06/A07/U04–U06/T11 与阶段 7 的 G01/G03/G04/G05/A09，提交收尾。
- 用户要求：完成后提交。当前 main 工作区包含此前未提交的阶段 6 执行/审批基础与本次阶段 7 编辑器/真实编程 MVP，依赖关联完整，一起纳入一次本地提交。
- 范围：已记录的 Main 执行和编辑服务、共享契约、Renderer 原组件接入和编辑工作区、测试/脚本、依赖锁定与许可证、CI/构建及同步文档；构建产物、临时配置、真实凭据与截图目录由既有 ignore 排除。没有新增业务或展开阶段 8。
- 验证依据：沿用 LOG-048/LOG-050–LOG-052 的实际检查和真实 A09 证据；本次代码未再变更，不重复调用计费 API。提交前复核 git diff --check、文档连续编号与格式；提交结果/哈希以 Git 输出和最终回复为准。
- 状态与下一步：阶段 6、7 保持已验收，当前唯一下一项仍为 8.1/G06；本次只做本地 commit，未请求远端推送。

## LOG-054｜阶段 8：真实 Git 工作区与本机关键验收

- 日期：2026-11-26；阶段 / 步骤 / ID：8.1/G06、8.2/G07、8.3/G08、8.4/G09。
- 实际变更：严格 git.* 契约与 GitService，按第一父提交分页真实历史、实际作者/hash/文件状态和增删行数；原 Commit 组件投影这些数据。暂存/取消暂存只操作所选路径，提交展示完整暂存范围、说明和本次作者；HEAD/状态/index 内容摘要令牌变化则拒绝。分支创建/切换/非强制删除、脏工作区和未合并冲突保护；不提供推送、自动 stash、强制删除或丢弃修改。
- 边界：仅本地用户操作；与编辑/Agent 共用串行队列，操作前再核对项目。Git 写操作需打开完整仓库根目录；禁用 hooks、签名、自动维护和已配置外部过滤器，受限环境与系统约束，输出/时间/数量有界；未覆盖 worktree 外置元数据和子模块完整操作，其他平台待 T12。检查令牌不是任意外部 Git 进程参与的原子事务，失败后明确刷新，不自动重试副作用。
- 文件：shared/workbench-contracts、editor/project 和 editor/git、git/service、data/service；GitPanel、编辑区 Git 入口/页头、样式；git-workspace.test、git-workspace-host.test、git-workspace.integration、verify-git-workspace、smoke-workbench。
- 验证：类型/Lint 与生产构建通过；2 项 Git 契约/记录解析测试通过。显式主机检查 15 项通过，包含中文/空格目录中的 Git 和阶段 6 敏感路径/网络/命令/取消边界回归。verify-git-workspace 的 3 组实际 Electron/SQLite/Git 检查通过：空/非仓库、中文路径、根提交数据、初始 index 取消暂存、旧令牌拒绝、目录越界、保护路径已暂存拒绝、分支失败/脏工作区保留和真实 unmerged index 拒绝提交。smoke-workbench 实际点击原 Commit、暂存/提交审查、创建分支/脏目录拒绝通过；output/git-history-real.png 已查看，实际作者、hash、中文路径与 +1 显示正常。开发/本机结果不代替最终包内检查或远端 CI。
- 失败与修正：首次原生中文路径快照失败；精确 stderr 表明 iconv_open(UTF-8,UTF-8-MAC) 失败，系统 /usr/share/i18n 的字符映射 .db 被全局敏感扩展名规则误拒。只对这个系统只读目录设置例外，未允许任意临时写入、网络或项目数据库；中文 Git 与原执行边界回归通过。试加动态库映射未解决问题，已撤回。stderr 仅 Main 内部有界持有，不把任意 Git stderr 当产品返回或写日志；临时 fixture 调试输出已撤除。
- 状态变化：G06/G07/G08/G09 → 完成（当前 macOS，最终阶段包内复核仍需进行）；下一步 8.5/X01。当前阶段未完成，尚未展开阶段 9。原版新增 Terminal/Test Results/Stack Trace 从既有固定提交读取，依赖安装初次因 store 不一致退出；改用项目既有 store，结果随后记录。

## LOG-055｜阶段 8：真实 PTY 服务与进程归属

- 日期：2026-11-26；阶段 / 步骤 / ID：8.5/X01。
- 实际变更：Main TerminalService 与严格 terminal.* 契约，原生 node-pty + 项目内受限 zsh -f，环境不继承 Provider/个人 Shell 配置；每项目最多 4 个、每 owner 最多 8 个终端，project/owner/UUID 配对校验，resize 与输入边界、256 Ki 字符有界环形输出和截断游标。关闭收集普通后代 PID/进程组、TERM/KILL、实际进程检查；不能确认则 unknown，窗口释放和应用退出收尾。已退出会话不再按旧 PID 发信号，避免误杀复用 PID。
- 验证：verify-terminal 在真实 Electron/SQLite/PTY 中 5 组检查通过：canonical cwd 与不继承私密环境、stty 实际 30×100、双项目/owner 读写拒绝、Ctrl+C 中断真实 sleep 后继续输入、敏感 .env 内容拒绝、300000 字符输出被截断、关闭清理普通后台 sleep、owner 清理另一项目终端。无真实 API 请求，临时项目已删除。
- 发现与修正：首次 Shell 能输入但 tty pgrp 与 stty TIOCGETD 被拒；只在 PTY profile 增加 pseudo-tty 和 /dev/tty、ttys 数字节点、ptmx 的 file-ioctl/读写，未对 Agent 命令扩大 tty/网络/目录权限。修复后 resize 与 Ctrl+C 通过。
- 文件：terminal/service、data/service、workbench-contracts、command-executor、terminal.integration/verify-terminal；后续 xterm 组件与可收起底部面板正在接入，尚未把原生成功算作桌面 X02 完成。
- 原组件准备：Terminal/Test Results/Stack Trace 从固定 ca8be600 官方提交下载，只有既有别名适配；verify-vendor 扩至 35 份通过。新增 ansi-to-react 6.2.6、直接复用已锁定的 Radix use-controllable-state 1.3.0；首次 pnpm store 路径不一致，随后显式使用项目 .pnpm-store 安装成功。许可证/完整依赖盘点与最终构建随后收口。
- 边界：当前 macOS；受限交互 Shell 不开放网络/个人工具链或目录外写入，主动输入才执行，和 Agent 命令日志分离。普通前后台子进程已验证，脱组/双重 fork/退出后的脱离任务不承诺全部可追踪；失败时不显示已停止。没有持久化终端进程或自动重放输入。
- 状态变化：X01 → 完成；下一步 8.6/X02 实际 xterm 输入/切换/尺寸和关闭 UI 验收，本阶段仍进行中。

## LOG-056｜阶段 8：xterm 交互终端桌面检查

- 日期：2026-11-26；阶段 / 步骤 / ID：8.6/X02。
- 实际变更：延迟加载 xterm/FitAddon、本地 CSS、可收起底部终端和多标签；Shell 输入与 Agent 日志分离。Main 只接受所属项目/窗口的输入，Renderer 串行发送且不自动重发；resize 跟随容器，输出用游标拉取到 xterm，截断时提示，关闭等待实际进程检查结果。隐藏/切换保留 Main 进程；窗口销毁关闭所属终端，不恢复重放旧输入。
- 文件：features/terminal/{TerminalPanel,store}、features/desktop/DesktopWorkbench、App/AppHeader、styles；smoke-workbench 扩展实际 xterm 键盘输入与独立 PTY 读取对照。
- 验证：生产构建通过；smoke-workbench 退出 0，实际 xterm 输入固定文本、Ctrl+C 中断真实 sleep 后继续输入、窗口缩至 1100×800 后实际列数改变、第二终端输出不进入第一终端、关闭后 Main 列表只剩一项均通过。Git 界面流程同时回归通过，未发生远程 Renderer 请求或页面错误。原生双项目/错 owner/错项目拒绝已有 LOG-055 证据，最终阶段还会补跨项目桌面与包内复核。
- 未覆盖与限制：当前 macOS 开发构建，包内/最小窗口/主题/持久布局待阶段后续步骤；进程边界沿用 LOG-055。接下来 Agent 只读日志将用原 Terminal，不能把用户交互 Shell 标签当作模型工具执行结果。
- 状态变化：X02 → 完成（上述范围，最终阶段复核继续）；下一项 8.7/X03，关联随后 X04 的真实执行记录/测试/堆栈。阶段 8 仍进行中。

## LOG-057｜阶段 8：原执行日志、结构化测试与实际堆栈

- 日期：2026-11-26；阶段 / 步骤 / ID：8.7/X03、8.8/X04。
- 实际变更：Main 从实际命令退出码/输出构建有界 execution 记录，随 tool_calls.payload 持久化，旧记录默认空，不新增数据库版本。原 Terminal 展示只读 Agent 输出/流和真实退出码/耗时，和 xterm 用户输入分离；移除命令的重复 JSON 输出。严格 TAP v13 完整性/顺序/退出码对照，完整报告接原 Test Results，普通 exit 0 仍标测试未验证，半包/中断/报告冲突不伪装通过。实际 JS 风格堆栈或 Python traceback 转为原 Stack Trace 展示，原始输出保留；项目内路径与行号可定位 Monaco，目录外不打开。
- 文件：shared/execution-records、agent-contracts、main/agent/validation/execution-tools/runner、features/chat/CommandResult/AgentTrace、editor store/EditorPane、样式；validation-records.test、smoke-results；原组件/依赖/来源清单见 LOG-055。
- 验证：类型/构建通过；3 项解析/一致性/实际 traceback 形状与截断检查通过。smoke-results 在真实 Electron/SQLite 中使用本地协议替身调度，三个命令都经实际原 Confirmation；执行 /usr/bin/python3 中真实 unittest 的成功与失败，退出码依次 0、1、0，TAP 成功/失败各一条，第三个普通 printf 明确未验证。原 Terminal/Test Results/Stack Trace 可见，Python AssertionError 的实际 src/check.py:5 跳转 Monaco 并定位行，页面重读后 execution 记录保留；无页面错误。output/agent-test-results.png 已查看，失败用例保持失败，不把本地协议替身称真实供应商。
- 发现与处理：新增 execution 字段后 Runner 初始工具记录缺默认值，类型检查捕获并补 null。原 Stack Trace 的组合 Error 容器不自带文字，补入其原 ErrorType/Message；长绝对路径导致消息 Radix table 包装撑宽，业务样式改为有界 block/可换行，最终复核再查最小窗口和包内表现。只复用原组件，没有改上游逻辑或过滤页面错误。
- 边界：当前解析 TAP v13，不宣称覆盖 Jest/JUnit/所有测试框架；未知格式保留真实进程结果和原始日志。报告由项目命令生成，执行成功不是测试设计正确的证明；只有完整、一致结果展示测试统计。命令/日志/报告预览有上限；超限明确截断。真实第三方 API 的既有阶段 7 证据不因本地 fixture 自动扩大。
- 状态变化：X03/X04 → 完成（本机开发范围，阶段末包内复核待进行）；下一步 8.9/U07 三种主题与持久化，再到 8.10/U08 布局/快捷键。阶段 8 仍进行中，阶段 9 未展开。

## LOG-058｜阶段 8：主题同步、可调整布局与重启恢复

- 日期：2026-11-26；阶段 / 步骤 / ID：8.9/U07，8.10/U08 代码及开发检查。
- 实际变更：沿用 L04 主题持久化，Monaco 使用继承原语言色彩的 Devly 深/浅调色，xterm 从应用 CSS 变量取背景/前景/光标并监听主题。侧栏鼠标/键盘调整、编辑宽度/文件区/终端高度分隔条；layout.* 严格参数把版本 1 的有界尺寸与展开状态按项目保存到既有 app_state 命名空间，不新增数据库迁移（仍 v8），不保存终端输入、Key 或进程。前端合并早于读盘返回的用户改动、串行去抖写入、拖动结束刷盘及失败提示；终端高度/侧栏在小窗有自适应约束。
- 快捷键：工作台 Cmd/Ctrl+J 切换终端，Cmd/Ctrl+L 聚焦任务输入，Cmd/Ctrl+Shift+E 打开文件区、Shift+G 打开 Git；侧栏分隔条可用左右/Home/End。编辑器原 Cmd/Ctrl+S 保留，Ctrl+C 仍发送至真正的 PTY。未改确认的 v5 品牌图标。
- 文件：desktop/{layout-store,use-layout,DesktopWorkbench}、app/AppShell/AppHeader、App、editor store/ProjectWorkbench/Monaco/EditorPane、terminal store/TerminalPanel、data/store/workbench-contracts、样式及 smoke-workbench、desktop-layout.test。原组件来源与新依赖许可随阶段最终归档补齐。
- 验证：类型/Lint/构建通过；布局早期修改/迟到读取合并与非法尺寸/秘密字段拒绝两项检查通过。完整 smoke-workbench 退出 0，真实设置页保存浅/深/系统主题，读取 Monaco/xterm 颜色与应用一致；模拟系统变化后颜色切换但保存值仍 system。鼠标和键盘调整侧栏、编辑/目录/终端尺寸，Cmd/Ctrl+L 与 J 输入焦点/切换通过；960×680 下任务输入、新建终端、保存均完整在视口中，根窗口没有横/纵向溢出。实际关闭并重新启动 Electron 后，浅色、侧栏、展开面板恢复，终端进程列表为空且没有重放命令。已查看 output/workbench-light.png、workbench-minimum.png，调色和底部输入可见。
- 失败与处理：首次截图发生一次超时；下一轮脚本用“设置”查找实际 aria-label 为“打开设置”的按钮，修正测试选择器后完整流程通过。补充分支删除原生用例前，fixture 仍保留前项故意保留的脏文件，服务正确拒绝创建测试分支；已让该生成 fixture 在确认保留结果后恢复，再复核删除和分页，尚未以本条声称这些补充检查已通过。
- 边界：当前 macOS 开发构建，完整原生补充、跨项目桌面与最终包内检查继续；页面重读/窗口离开前仍需等待正常写入完成，存储失败明确显示未保存。仅保存布局而非文件草稿/终端续跑，不把 R02 提前标完成。工作区终端仍受限，个人工具链/网络/脱组程序边界沿用 LOG-055。
- 状态变化：U07 → 完成；U08 → 待验证（开发界面通过，阶段末复核未收口）。当前唯一下一步仍阶段 8/U08；阶段 9 未开发。

## LOG-059｜阶段 8 总验收：Git、交互终端与桌面体验归档

- 日期：2026-11-26；阶段 / 步骤 / ID：8.1–8.10，G06/G07/G08/G09/X01/X02/X03/X04/U07/U08，当前 macOS ARM64。
- 最终变更：补充真正的已合并/未合并分支删除与 32 条历史分页、布局 Worker 重启/非法写入检查；桌面增加跨两项目终端切换、实际 Shell PID 的退出后消失断言、Agent 结果最小窗口检查。提交审查的长路径列表使用现有 ScrollArea；暂存/分支成功不清掉正在填写的提交说明，仅实际提交成功清空，包内实际交互检查覆盖此行为。原上游组件保持来源校验，未修改品牌图标。
- 涉及文件：阶段 8 的 shared/workbench-contracts/execution-records、Main Git/PTY/执行记录和 data 服务、Renderer git/terminal/desktop/CommandResult/editor/shell 与样式；新增集成/桌面/单测脚本；package/锁文件/构建许可/CI；新增 docs/git-and-terminal.md，同步 README、架构、选型、数据/组件/模块/检查/依赖与阶段文档。数据库仍 v8；布局为 app_state 的 v1 命名空间，执行元数据沿用 tool_calls.payload。
- 统一检查：pnpm check 最终退出 0，包含类型、Lint、格式、134 项测试通过/3 项主机测试默认跳过、28 份 Markdown/106 个唯一任务 ID/当时 58 条日志、35 份固定原组件来源、图标、生产构建、SQLite/聊天/只读 Agent 集成。最初最终检查因 README 表格格式退出 1，格式化后全量重跑通过；没有绕过检查。最后两处 Git 交互修正后另行 pnpm typecheck、pnpm lint、pnpm build:bundle 与针对文件格式检查均退出 0。
- 原生验收：显式 DEVLY_VERIFY_HOST_EXECUTION=1 的 Git/既有执行基础检查 15 项通过；verify-git-workspace 6 组实际 Electron/SQLite/Git 检查全部通过，含空/非仓库、中文/空格路径、根提交/取消暂存、旧 index 令牌、保护路径、脏修改、真实未合并 index、非强制分支删除与第一父链分页、布局持久化。LOG-058 提到的脏 fixture 恢复后完整复跑已通过，没有放宽产品拒绝条件。verify-terminal 最终复跑 5 组通过，含最小环境、真实尺寸/Ctrl+C、owner/项目拒绝、敏感内容与输出上限、普通后台子进程和 owner 清理。
- 开发与包内界面：smoke-workbench 开发完整流程及 DEVLY_EXECUTABLE 包内最终流程退出 0；实际 Commit 作者/hash/文件、暂存/审查/提交/草稿保留、分支失败保留、真实 xterm 键盘/resize/Ctrl+C/切换/关闭、两个项目 UI 隔离通过。实际关闭应用后两个项目 Shell PID 均不存在；重新启动后布局/主题/面板恢复、终端列表为空，未重放命令。浅/深/系统设置与模拟系统变更同步 Monaco/xterm；侧栏键盘/拖动、编辑/目录/终端分隔条、输入快捷键、960×680 的输入/保存/终端入口可见，根窗口无溢出；无页面错误或远端 Renderer 请求。
- 实际结果与阶段回归：smoke-results 开发/包内退出 0，本地协议替身仅调度实际 Python unittest，真实退出码为 0/1/0，TAP 成功/失败与普通命令未验证分别显示；原只读 Terminal/Test Results/Stack Trace、真实 AssertionError 文件第 5 行定位、记录重读保留通过。最终已查看 output/agent-test-results.png 和 agent-results-minimum.png，长路径不撑宽、错误标题与主要输入可见。包内 smoke-editor、smoke-execution 均退出 0，既有本地 Worker/语义诊断/保存冲突/Diff、审批/停止/历史均回归通过。工作台浅色/最小窗口/重启、Git 和终端截图已查看；不把本地协议替身称为新供应商实测，阶段 7 的真实 API 证据仍限 LOG-051 的模型。
- 构建与依赖：最终 electron-builder --dir 退出 0，SQLite/node-pty 重建后生成未签名 release/mac-arm64/Devly.app；最终包内 PTY/工作台通过。9 份新增来源/许可证/说明文件在 Resources/licenses 与 resources/vendor 逐字节一致。盘点 64 个直接依赖、931 个已安装 name@version；ansi-to-react 6.2.6 声明 BSD-3-Clause 但上游包/固定源码缺完整版权通知，已保存来源说明与明确标注的 SPDX 模板，正式发行仍需补全；不伪造权利人通知。没有新的远程漏洞审计，旧维护/安全/khroma 未知许可等阻断继续保留。
- 未覆盖与剩余边界：Windows/T12/X05、远端 CI、安装升级、签名/公证与正式发行未验收。交互 Shell 仅受限系统工具，无网络/个人工具链；普通后代清理有证据，双重 fork/脱组任务不保证。Git 不推送、不自动丢弃修改、不承诺外部并发 index 原子事务，不支持复杂 worktree/submodule。结构化测试仅 TAP；普通 exit 0 不代表测试通过。保存布局不等于文件草稿或跨重启任务恢复，异常未提交的前端布局可能丢失。范围与恢复条件在新增说明中记录。
- 阶段结论：10/10 项在上述当前 macOS 范围完成，三条阶段验收逐项通过；U08 待验证 → 完成，阶段 8 → 完成。工作计划的总览/当前能力/阶段状态/当前执行位置与唯一下一步已同步。下一项 **阶段 9 / 9.1 / L08**，待开始；没有提前展开多协议、恢复或其他阶段开发。本轮没有请求提交/推送，工作区保留改动。最终 pnpm check:docs 退出 0（28 份 Markdown、106 个任务 ID、59 条连续日志），git diff --check 退出 0。

## LOG-060｜阶段 8/U08 跟进：统一工作台拖拽分隔条

- 日期：2026-11-26；阶段 / 步骤 / ID：8.10/U08，用户追加样式优化，阶段 9 尚未展开。
- 实际变更：将编辑/聊天区的 5px 粗竖条和目录/终端的 4px 粗横条统一为 1px 中性细线；侧栏同用这一视觉规则。伪元素向两侧扩展 4px，形成 9px 透明命中区域；悬停、键盘焦点与实际拖动状态展示 3×28px（横向为 28×3px）短圆角手柄，使用主题中性色和 140ms 过渡，减少动态效果设置下取消过渡。拖动逻辑与布局持久化接口保持既有实现。
- 涉及文件：src/renderer/src/styles.css、docs/work-plan.md、docs/git-and-terminal.md、本文。没有引入新组件、依赖或修改原 AI Elements；此前阶段 8 工作区改动保留。
- 验证：pnpm build:bundle、针对 styles.css 的 Prettier 检查均退出 0。临时 .cache/divider-preview.mjs 复用既有 smoke-workbench 实际窗口流程，额外截取浅/深主题默认、悬停、按住拖动与横向手柄，流程退出 0；实际鼠标/键盘调整、主题跟随、最小窗口、双项目 PTY、退出与重启布局均沿现有桌面断言通过。已查看深色拖动/浅色横向截图；最终补充截图在 140ms 过渡结束后再次核对，浅色横向与深色悬停手柄显示正常。不为这次 CSS 修改新增实现镜像单测，也不重复调用真实 API。
- 未覆盖与边界：本次是 macOS 本地构建/实际窗口验证，未重新生成安装包或执行 Windows/远端 CI；不将此前包内验收说成本次新样式的包内证据。品牌和业务操作保持既有范围。
- 状态与下一步：U08 样式跟进完成，阶段 8 保持完成；当前唯一下一项仍阶段 9/9.1/L08，待开始。pnpm check:docs（28 份 Markdown、106 个任务 ID、60 条连续日志）与 git diff --check 均退出 0。

## LOG-061｜阶段 9/9.1/L08：迁移、备份与恢复入口

- 日期：2026-11-26；任务 ID：L08。用户确认本轮新协议只做代码/本地协议验证，真实端点留待联调，不使用个人 Key。
- 变更：独立“数据与恢复”设置组、严格 storage.* 契约与原生目录选择；Worker 一致性备份包括 SQLite/已索引日志附件与 SHA-256 清单，复制库清空凭据引用/诊断后 VACUUM，不带 Vault。检查后绑定 owner/预览 UUID/摘要/有效期，恢复复制到新 generation，下次启动仅原子替换指针，原 DB/日志保留，恢复失败继续使用原 generation；有运行任务拒绝安排恢复。密钥需重设，旧审批不重放。
- 文件：shared/stability-contracts/data-contracts、data/backup/store/service、Main 原生入口、DataSettingsPanel/设置组、chat/runtime 活动检查；stability.integration/verify-stability。
- 验证：pnpm build（含类型）退出 0；node scripts/verify-stability.mjs 退出 0，4 组实际 Electron/SQLite/Worker 检查：备份无凭据/原引用保留；错 owner 拒绝/当前库不动/重启切换/旧库保留；候选缺失或摘要损坏拒绝且旧库可读；真实 v7→v8 升级及实际 DDL 失败回滚/备份可读。没有将新 UI 的代码完成当作已渲染验收，最终桌面流程在本阶段末核对。
- 限制：备份含私人历史/项目内容需用户妥善保存，不是秘密共享格式；限数据库 256MiB、总量 512MiB、10000 个 blob/单个 8MiB，超限失败保留当前数据。仅备份格式 v1/DB v8 起支持恢复；旧 generation 不自动清理；没有操作项目源文件。Windows/正式升级与包内最终复核仍独立记录。
- 状态：L08 完成，下一项 9.2/P08。阶段 9 进行中；R04 故障注入、R06 导入导出和最终恢复 UI 验收在对应步骤继续。

## LOG-062｜阶段 9/9.2/P08：Responses 独立适配

- 日期：2026-11-26；任务 ID：P08。新增 responses.ts、native-common.ts、transport.ts 与 factory.ts；只共享传输，不套 Chat 格式。Responses 原生 input/output、call_id/function_call_output、max_output_tokens、text.format、store:false、加密推理延续缓存、原生增量工具索引归一与独立结束校验。未知服务端工具明确拒绝。工厂接 ProviderRuntime/ChatRuntime/Agent，UI 可选三协议；配置变更仍需用户操作/历史确认。
- 验证：类型/生产构建通过；native-protocols 中 Responses 9 项通过，覆盖非流式、字节拆包、多个工具、私有延续项、取消、无终止/坏 JSON/重复 ID/未知工具、401/403/429/503 和不自动重试。verify-protocols 的 Responses 实际回环 HTTP→真实搜索→真实读取→最终回答通过，工具 ID 对齐且原生 reasoning 项保留。最初监听被工具沙箱拒绝，按权限流程在主机重跑；fixture 读取接口多传字段、read_file 误用 content 而非 text 已修正，不放宽产品 Schema。
- 涉及：providers 新文件、shared ProviderAdapter.dispose、两运行时/runner、会话绑定和模型选择、ProviderManager/ChatWorkspace、native-protocols/model-options 测试及 protocols.integration/verify-protocols。
- 边界：代码/本地协议验收完成，真实 Responses 端点与模型待用户后续在应用内配置联调；默认能力未知，视觉/结构化等单独检查，服务端托管工具、跨重启隐藏推理不支持。下一项 P09。

## LOG-063｜阶段 9/9.3/P09：Anthropic Messages 原生适配

- 日期：2026-11-26；任务 ID：P09。新增 anthropic-messages.ts，原生 system/content blocks、tool_use/tool_result、x-api-key/version、必需 max_tokens、thinking signature 延续、缓存 Token 计数、原生 message_start/block delta/stop/message_delta/message_stop。半包不执行、非完整结束失败；工具索引独立归一，不把 text block 序号当工具索引。结构化输出明确 unsupported，不静默删参。
- 验证：类型/构建通过；Anthropic 独立 9 项（与 Responses 共 18 项）通过，原 Chat Completions 31 项及模型选项 4 项回归通过。verify-protocols 中 Messages 原生流→真实搜索/读取→签名内容块及对应 tool_result→最终回答通过；两协议共 6 次本地 HTTP 请求。全为本地协议替身，没有真实 Anthropic 调用或个人 Key。
- 文件/剩余范围：同 LOG-062 的工厂与业务接线、独立适配器/测试；模型列表只尝试当前页，可手填。真实 Anthropic 端点/模型待联调，其他内容块/服务端工具和全部模型能力不在兼容声明内。P09 本地完成；下一项 P10。

## LOG-064｜阶段 9/9.4/P10：协议矩阵与差异边界

- 日期：2026-11-26；任务 ID：P10。新增 docs/provider-matrix.md，逐项记录协议、端点类型、模型、日期、文本/工具/取消/错误证据与真实待验证状态；列出路由、认证、Token 参数、结构化输出、视觉/上下文、模型列表、隐藏推理延续和服务端工具差异。
- 当前证据：53 项协议/模型测试通过（31 既有 + 18 新原生 + 4 模型选项）；两种新协议实际回环/真实工具集成通过。既有火山方舟 DeepSeek 的真实证据限此前 LOG-041/043/051。没有沿用 Chat 的一次响应宣称兼容新协议，用户已确认真实新协议另行联调。
- 文件：provider-matrix.md、工作计划及本日志；Provider 现有诊断报告绑定配置 revision/模型/时间，修改端点/协议/密钥等使旧报告失效，不把 UI 可选择等同真实验收通过。最终 UI/包内检查在阶段末继续。
- 状态：P10 矩阵完成，新协议真实端点仍待验证；下一项 9.5/R01。阶段 9 进行中。

## LOG-065｜阶段 9/9.5/R01：持久事件、归属与迟到保护

- 日期：2026-11-26；任务 ID：R01。ChatRepository 将消息/回合、工具、Agent 和审批状态的变更与 session 单调 sequence 事件在同一 SQLite 事务提交；事件只保存内容摘要哈希，不保存参数明文。DatabaseClient 为内部变更分配事件 UUID，重复 ID/相同摘要不重复写入，变更内容或归属的重放拒绝。开始请求按 turnId 和请求摘要核对，已接受请求不再新建网络生成。终态工具/回合拒绝迟到覆盖；Renderer 忽略倒退 sequence，运行结束仅删除同一 Map 实例。
- 文件：data/client、chat/repository/runtime、shared/chat-contracts、use-chat；stability/protocols 集成脚本。
- 验证：类型/生产构建通过；verify-stability 退出 0，新增真实 Worker 检查覆盖请求摘要、重复事件幂等、变更重放拒绝、sequence 不倒退、已完成工具与回合的迟到覆盖拒绝；既有迁移/备份 4 组回归通过。Provider 流本身的重复 Responses sequence、参数/ID 与终止完整性另由协议检查约束，不能用持久事件幂等掩盖损坏流。
- 边界：不声称网络 exactly-once；丢失响应后只复用已知 turnId/读取记录，不自动重试命令。SQLite 事务与原有序列约束使用 v8 既有表，无新增迁移版本。异常重启核对和 UI 恢复入口在 R02 继续，下一项 9.6/R02。

## LOG-066｜阶段 9/9.6/R02：核对恢复状态与显式只读继续

- 日期：2026-11-26；任务 ID：R02。RecoveryManager 按项目/会话/旧 turn 读取真实记录、事件序号、审批、Provider 修订与已记录文件的当前哈希；缺失/变更/未知分别展示。旧命令进程不凭历史假装仍连接或已清理，记录为 unknown。恢复预览绑定 owner/token/两分钟有效期和检查摘要；确认前重检，文件或绑定变化则拒绝；复用 token 拒绝。
- 实现：启动恢复状态在同一 SQLite 事务使旧审批失效、活动工具/回合中断并记录事件；旧 running command 标 EXECUTION_STATE_UNKNOWN。新增 chat.recovery.* 严格契约、原 Dialog/ScrollArea 核对 UI，历史“核对恢复状态”入口。确认后创建新 turn/新预算，只读项目核对或普通聊天，不重放任何旧工具/审批，不重新连接旧 HTTP；后续写入仍须另发新任务逐次审批。
- 文件：shared/stability-contracts、chat/recovery/repository/runtime、data/service、RecoveryAction/ChatHistory/ChatWorkspace、样式；recovery.integration/verify-recovery。
- 验证：类型/构建通过；verify-recovery 退出 0，3 组实际 Worker 重开检查：审批失效/旧命令 unknown/实际外部编辑识别/确认前零请求；错 owner、检查后文件变化、重复 token 拒绝，确认仅 1 次本地请求且新回合只有三个只读工具、磁盘内容不变；Provider revision 改变阻断旧上下文自动转发。该 UI 最终实际窗口/重启流程仍在阶段末验收；不将本地 fetch 替身写成真实 API。
- 边界：这是经核对的新回合继续，不是透明恢复旧供应商连接、隐藏推理或旧子进程；未知进程不作安全退出保证。没有完整文件哈希的旧日志明确 unknown；权限/密钥/绑定问题须用户处理。R02 的本地核心检查通过后启用核对入口，最终全流程继续核对；下一项 9.7/R03。

## LOG-067｜阶段 9/9.7/R03：三协议真实网络生命周期故障检查

- 日期：2026-11-26；任务 ID：R03。保持各适配器独立的结束/参数校验、取消链和标准错误分类，重试仅显式新请求；401/403/429/503、断流、超时、用户取消和正常关闭分别检查。不自动切换协议/供应商、续接半段 JSON 或重放工具。
- 文件：providers 传输/适配器与 ChatRuntime 的既有生命周期接线；新增 lifecycle.integration/verify-lifecycle。本轮 429 retry-after 保留实际头部秒数用于提示，不后台自动等待后重试。
- 验证：verify-lifecycle 在主机回环 HTTP 中退出 0，三协议 × 8 场景共 24 项通过。每项独立使用真实原生 fetch、Worker、Agent 循环和半包 read_file 参数；只有一次 HTTP 请求，没有工具完成或文件变化；错误状态与预期一致，429 retry-after=1，保存结果不包含生成 fixture Key。取消/超时/关闭均等网络流退出后持久化，未提前声称完成。native-protocols 的无终止/重复 ID/坏 JSON 检查继续保留。
- 边界：本地故障服务不代表真实供应商/网络设施全部兼容。恢复是 R02 的显式新回合，只读续查不重放副作用；未加入自动退避重试。下一项 9.8/R04。

## LOG-068｜阶段 9/9.8/R04：真实存储失败与保留数据

- 日期：2026-11-26；任务 ID：R04。新增显式 storage.reopen：仅连接失效时关闭旧实例后重开 Worker，不因普通刷新自动重放请求。Main 初始化可重试，失败保留原库；UI 提供重新连接。恢复指针有界读取/校验，候选缺失或坏指针明确恢复警告，使用仍保留的原始库而非创建空替代库；bootstrap 把警告带到全局入口。备份与日志失败只清理自身临时文件，不删除原数据。
- 文件：data/backup/client/service/store、Main 初始化、stability/data 契约、store/App、设置 hook/Panel；storage-faults.integration/verify-storage-faults。
- 验证：类型/构建通过；verify-storage-faults 退出 0，5 组真实故障：SQLite trigger 使事件插入失败，消息更新事务回滚且修复后显式更新成功；ENOTDIR 备份失败保留原会话；真实 blob 写失败不留索引、修复后可写；实际 Worker terminate 后拒绝请求、不重放、WAL 内容重开保留并标记旧回合中断；损坏 generation 指针保留原库且返回 recoveryError。没有把模拟 ENOTDIR 说成真实磁盘耗尽，也未承诺断电所有场景。
- 修正与后续：Lint 发现 DataSettingsPanel 直接导入平台网关违反展示层约定，已迁移到 use-data-settings hook，阶段末重跑统一检查。故障恢复的全局窗口入口会在 R07/U09 桌面流程实际操作。
- 状态：R04 本地实现与故障检查完成，Windows/正式升级与物理磁盘故障仍在平台/发行边界；下一项 9.9/R05。

## LOG-069｜阶段 9/9.9/R05：长会话虚拟化与本机测量

- 日期：2026-11-26；任务 ID：R05。保持每页 20 条读取，超过 60 条已加载消息时使用现有 TanStack Virtual，动态高度/overscan 4、稳定消息 ID 和旧消息锚点；复用原 Message/Streamdown/Tool。MessageRow memo 与稳定动作回调减少文本流时旧消息重绘；持久 sequence 未变化时跳过重复投影。上滚停止自动跟随，分页保留原可见消息；大日志仍按 64KiB 分段读取，不预取整个文件。
- 文件：ChatHistory/use-chat、局部样式、performance-seed/smoke-performance；没有新增 npm 依赖或替换原 AI 组件。TanStack API 导致 React Compiler 按官方 lint 规则跳过该 hook 的自动 memo（警告，不是错误）；本项目没有靠强行 memo 虚拟器函数隐藏告警。
- 验证：类型/构建通过；实际 Electron 临时 SQLite 样例 2000 条约 16MiB 历史 + 1MiB 日志，初次仅 20 条读取，分页到 80 条时 DOM 实际 9 条；启动到可用历史 1539ms，三次分页 115/98/137ms，输入 fill/回读 46ms，三次 64KiB 日志读取 5/3/4ms。smoke-performance 退出 0，无页面错误；输出 output/performance-stage9.json 和截图，已查看。数据均为本机生成样例，不代表任意设备或任意 Markdown 的硬性 SLA；页面输入继续可用。
- 边界：前端分页累计数据随用户加载增长，虚拟化限制 DOM 而不声称所有历史常驻内存为固定常数。没有加载全部长日志；超长单条消息仍受已存在文本/工具上限约束。既有上滚/回到底部与最终包内回归在 R07 继续。下一项 9.10/R06。

## LOG-070｜阶段 9/9.10/R06：配置审查导入与无秘密诊断

- 日期：2026-11-26；任务 ID：R06。新增严格 devly-config-v1 白名单，只导出供应商元数据/兼容声明与应用偏好，不含 Key/引用/hasCredential/诊断报告/历史。导入原生文件有大小/非符号链接限制，先校验并按 owner/预览 UUID/五分钟/文件哈希绑定，UI 显示协议/主机/模型、权限/限额并明确审查；确认后事务创建全新 Provider UUID、重映射默认值，保留旧会话绑定/已有 Key，替换应用默认偏好并明确清除偏好草稿。未知秘密字段和疑似凭据串拒绝。
- 诊断：固定版本/计数/状态/协议统计白名单，不导出日志正文、路径、供应商名称、URL、模型或凭据引用。原 SettingsEditor 的作用域偏好 JSON 导出保留；新的完整配置导入只接受 data 组导出的 devly-config-v1 格式，不假装兼容任意 JSON。没有解密 Key 来生成配置或诊断。
- 文件：shared/data-contracts、data/configuration/store/service、Main 文件选择、DataSettingsPanel/use-data-settings、store/settingsEpoch 与设置页；configuration.integration/verify-configuration。更新旧模型选择脚本中“Responses 尚未实现”的过时预期，保持不发 API 的选择检查。
- 验证：类型/构建通过；verify-configuration 退出 0，3 组真实 Worker/SQLite/文件检查：导出不含引用且 Vault.read 不被调用、诊断无敏感元数据；错 owner/预览后文件变化/带 apiKey 的非法字段拒绝并保留原值；实际 settings INSERT 故障回滚新供应商，显式重新导入后新 UUID/默认映射正确、旧绑定/凭据保留、重复预览拒绝。UI 最终操作与配置/诊断文件再次核对在 R07。
- 限制：完整配置限 50 个供应商、1MiB 文件；它是配置白名单，不是对任意用户元数据中所有可能秘密的万能识别器，用户不要把凭据填进名称/模型/地址路径。备份包含私人历史需单独保护；诊断刻意不含正文，原始工具日志仍在受控本地历史中查看。下一项 9.11/R07。

## LOG-071｜阶段 9/9.11/R07：关键流程回归与恢复演练

- 日期：2026-11-26；任务 ID：R07，关联 R04/G01。统一 pnpm check 首轮退出 0，152 项通过/3 项默认跳过、35 份上游文件、文档、构建与原生协议/恢复/故障检查通过。随后新增恢复边界验证，最终整套检查与包内复核另见阶段收尾记录。
- 本机实际行为：verify:execution 6 组、verify:git-workspace 6 组、verify:terminal 5 组、verify:chat-ui 8 类、verify:editor-ui 开发窗口均退出 0；覆盖审批前不执行、外部编辑冲突、真实 stdout/退出码、取消子进程、崩溃旧授权失效、真实 Git 提交/分支失败保护、PTY Ctrl+C/项目归属，以及分页/上滚/重启续聊。均使用临时真实文件/仓库和本地模型夹具，不调用个人 API。
- 演练：verify:stability-ui 退出 0，实际启动存储失败→修复→显式重连，旧回合核对→新只读继续，配置测试/两种原生聊天，配置/诊断导出与审查导入，快照→审查→重启恢复。确认前零请求、重载不重复发送、原文件保留、旧审批不复用。
- 修正：原有文件监听单测偶发错过 fs.watch；EditorService 加入已安全 stat 文件的 mtime/ctime/size 轮询兜底，保持 inode/路径校验，不放宽测试时间。backup.ts 新增配置/Agent payload 语义校验和 trigger/view/virtual table 拒绝，避免“正确哈希的坏库”切换为活动库；blob 对照改 Map。verify:stability 实际重算坏快照哈希后仍拒绝无效 settings/trigger，6 组通过且旧库保留。
- 文件：editor/service、data/backup、stability/recovery 集成、smoke-stability 与 check/CI；文档新增 stability-and-recovery、矩阵及相关入口。新增孤立回合夹具先漏绑定、后误以 begin 为 pending，按实际 running 状态修正；恢复脚本 4 组通过，没有放宽业务契约。
- 边界与状态：R07 当前 macOS 本地回归完成，最终包内检查在本阶段收尾继续；新协议真实服务、Windows、远端 CI 和实际断电/磁盘耗尽未验证。下一项 9.12/U09。

## LOG-072｜阶段 9/9.12/U09：错误入口与待恢复交互

- 日期：2026-11-26；任务 ID：U09，关联 R02/R04。未配置模型提供供应商设置入口；历史认证/403/429/断网等错误可直接检查连接，429 显示供应商实际建议等待秒数；存储和限额错误分别链接数据恢复/权限。未加载原始用户消息时禁用重发，项目写任务继续保留不自动重发规则。
- 待恢复保护：bootstrap/store 同步 pendingRestore；安排备份恢复后禁用新消息，Main 同样拒绝 chat.start/恢复继续；可打开数据组取消待恢复操作。失效项目显示重新选择目录入口；归档会话保留恢复入口。数据设置间距、导入预览协议/主题/权限中文标签统一，未改原组件源码/品牌。
- 运行连接核对：chat.read 若记录活动但没有对应运行连接，仅原子收尾该会话并返回中断；不改另一会话、不发 HTTP、不复用授权。恢复预览增加工具能力失败检查。超时文案改为核对网络/供应商后手动重试，避免提示不存在的超时配置项。
- 文件：shared/data-contracts、data/store/service、chat/runtime/repository/recovery、Renderer store、ChatHistory/ChatWorkspace、DataSettingsPanel/use-data-settings/SettingsGroup/styles、providers/errors 与 recovery/smoke-stability 脚本。
- 验证：typecheck 退出 0；verify:recovery 4 组通过，包括孤立连接的会话归属；verify:stability-ui 开发窗口退出 0，真实回环 401/403/429/断网各仅一次请求，错误路由可操作、恢复按钮在 960×680 内可见、未配置入口可用、目录移走后可重新选择、待恢复输入禁用；无 pageerror。截图 output/recovery-review-stage9.png、data-settings-stage9.png；fixture Key 不进入 Renderer。
- 状态：U09 本地实现/窗口检查完成；阶段 9 等待最终统一与包内复核，新协议真实端点按用户确认另行联调，不能宣称所有供应商或平台通过。下一步仅本阶段最终检查，不展开阶段 10。

## LOG-073｜阶段 9/R01、R07、U09：快速响应下的聊天投影保护

- 日期：2026-11-26；最终包内演练首次在连续错误发送中出现输入等待超时，保持失败记录，未据开发窗口成功直接判包内通过。增强夹具又发现 failed 选择器同时包含用户与助手消息，导致期望 1 实际 2；已限定 .is-assistant，等待新增对应消息与输入恢复，不延长超时。
- 代码审查另发现确认/轮询的真实竞态：最终或流式轮询可能早于 chat.start 确认；旧确认原先会清空文本/回退 running，sequence 相同的后续轮询又跳过。新增 projection.ts：同一已观察回合保留当前内容与状态，较旧消息分页重新投影最新快照，不用重复网络请求补救。
- 文件：features/chat/projection.ts、use-chat.ts、tests/chat-projection.test.ts、smoke-stability.mjs；文档同步计数。2 项针对性测试退出 0，覆盖流式/完成/失败/取消先于发送确认，以及旧页不覆盖较新文本/终态。常规总数增至 154 通过/3 默认跳过。
- 状态：修正已实现；完整 check 和开发/新包内 UI 重跑中，结果在下一条最终记录补齐。首次包内失败仅证明测试流程未通过，不把尚未复现定位的所有症状归因同一竞态。真实新协议与 Windows 范围不变。

## LOG-074｜阶段 9：本地实现归档与真实联调待办

- 日期：2026-11-26；任务 ID：L08/P08/P09/P10/R01/R02/R03/R04/R05/R06/R07/U09。本轮按用户“先完成代码和本地协议验证；真实端点另行联调”范围完成收尾；新协议真实端点/模型验收不勾选。
- 最终统一检查：pnpm check 退出 0，154 项通过、3 项主机检查默认跳过（17 个测试文件通过/2 个跳过）；类型、Lint、格式、来源 35 文件、图标、生产构建与数据/聊天/Agent/六类阶段 9 原生集成全部通过。Lint 保留 TanStack useVirtualizer 的 React Compiler incompatible-library 1 条警告（跳过自动 memo），Zod Rollup 注释/大块构建提示保留，不宣称零警告。首次 README 表格格式失败已修正；LOG-073 的修正后再次全套通过。
- 原生事实：stability 6 组（含哈希正确但配置/trigger 非法的快照拒绝）、两新协议回环工具闭环、recovery 4 组、lifecycle 三协议 24 场景、storage-faults 5 组、configuration 3 组通过。此前阶段的审批执行 6 组、Git 6 组、PTY 5 组、聊天分页/上滚/重启、编辑器与工作台开发 UI 回归退出 0。SQL trigger/ENOTDIR/Worker terminate 为实际可复现故障，不冒充磁盘耗尽或断电实测。
- 最终桌面：pnpm verify:stability-ui 及同脚本 DEVLY_EXECUTABLE 指向新 Devly.app 均退出 0，覆盖真实配置表单、原选择器、两新协议聊天、认证/403/429/断网、未配置 API、失效目录、最小窗口、核对后新只读继续、配置审查导入/无 Key 导出、备份下次启动恢复。每个错误仅一次网络请求；等待新增助手失败消息后输入恢复可编辑；重启/重载不重放旧工具或网络。初次包内流程失败见 LOG-073，最终重跑通过，没有删除失败证据。
- 打包：pnpm exec electron-builder --dir --config.electronDist=node_modules/electron/dist --config.mac.identity=null 退出 0，生成 release/mac-arm64/Devly.app；未签名、未公证、无 DMG。包内 verify:execution-ui 和 verify:editor-ui 均退出 0：实际 Confirmation 审批/拒绝、Plan/Task、停止与旧审批失效，保存冲突/Diff、本地 Monaco/Worker（blob:，无 pageerror）通过。未运行新的收费真实模型样例。
- 性能：临时库 2002 条消息/16760890 字节历史、1MiB 日志。开发样例首次 1280ms，三页 119/99/139ms，输入 44ms；包内 1484ms、110/95/126ms、输入 41ms，加载 80 条仅挂载 9 条，64KiB 日志区间读取 8/5/6ms。两次 verify:performance-ui 均退出 0；output/performance-stage9-development.json 与 performance-stage9-packaged.json 保留样例，不承诺其他设备或无限历史同等性能。
- 文档/文件：新增 docs/stability-and-recovery.md、provider-matrix.md；同步 README、架构、选型、数据、聊天/只读/执行/编辑器、组件、质量/依赖、阶段说明与唯一计划。工作区先前阶段 8 未提交修改全部保留，本次没有 commit/push。截图 recovery-review-stage9/data-settings-stage9/performance-stage9 与执行/编辑器证据均由实际窗口生成，恢复弹窗和数据设置已查看。
- 未覆盖：Responses/Anthropic 真实端点文本/流/工具/取消另行联调；全部供应商、个人工具链、Windows、远端 CI、实际磁盘耗尽/任意断电、签名/升级与已记录依赖/版权发行门槛仍未通过。文件草稿崩溃恢复不在 R02 的实现声明内。
- 最后文档复核：pnpm check:docs 退出 0（30 份 Markdown、106 个唯一任务 ID、74 条连续日志）；pnpm format:check 与 git diff --check 均退出 0。
- 状态与下一步：阶段 9 代码与当前 macOS 本地验收归档；阶段总体“待验证（新协议真实联调）”。P08/P09 标明本地完成、真实待验证；唯一下一步 9.2/P08 的真实端点验收，随后 P09/P10 补齐矩阵。不自动展开阶段 10，不要求在聊天中发送 Key。

## LOG-075｜阶段 10/10.1/A08：项目指令与用户记忆

- 日期：2026-11-26；用户新指令明确要求阶段 10，按该指令开始本阶段；阶段 9 的 Responses/Anthropic 真实待联调没有改为通过，也不以此自动宣称新协议兼容。
- A08 实际变更：SQLite v9 project_context 与严格参数/归属；用户管理 instruction/memory，目录 scope、启停、编辑/移除、50 条/单条 8192 字符限制。独立“项目上下文”设置组复用 shadcn；Agent 上下文按选中文件/读取文件范围注入、标记来源及优先级，沿用 A05 预算；不提供模型写记忆工具，不将普通工具输出变成高优先级指令。
- 文件：shared/extension-contracts、extensions/context/repository、data/migrations/store/backup、agent/context/runner、chat/runtime、Renderer extensions/ProjectContextPanel 与 hook、设置分组及样式。v8 备份仍可检查，新格式使用实际 migration version。
- 验证：pnpm typecheck / build:bundle 退出 0；node scripts/verify-extensions.mjs 退出 0，实际临时项目、SQLite Worker、Agent 上下文、两项目隔离、来源 ID、重开持久化与移除通过。模型返回为本地 fixture，不伪装第三方真实调用；GUI 与完整阶段回归在 I07 收口。
- 状态：A08 本地基础完成；进入 10.2/I01。已有阶段 8/9 未提交内容保留，无 commit/push。技能资源和子任务继承在后续对应步骤实现，不据当前记忆 CRUD 提前标完成。

## LOG-076｜阶段 10/10.2/I01：整回合队列与目录锁

- 日期：2026-11-26；任务 ID：I01。Main RunQueue 最多 4 个并发/32 个活动及等待回合，按 canonical 根目录对重叠目录写任务串行；只读与隔离目录可在限额内并发。回合先持久化 queued 再获取许可，UI 可以取消排队项；计时、Abort、实际收尾和旧审批规则继续生效。
- 文件：extensions/queue、chat/runtime/repository、shared/chat-contracts、tasks.list/start 契约与设置任务入口；短操作 serializeMutation 原锁保留，worktree 不是沙箱。
- 验证：typecheck 退出 0；run-queue 2 项通过，实际 Promise 许可验证重叠目录串行/隔离目录并行、队列项取消不释放运行项及重复 release 幂等。实际 Runtime/GUI 队列与关闭回归在 I07 补齐，不以基础单测声称全阶段完成。
- 状态：I01 基础完成，进入 I02；新任务沿用用户明确选中的 Provider/模型，没有自动跨供应商转发。

## LOG-077｜阶段 10/10.3/I02、10.4/I03：worktree 与审查合并

- 日期：2026-11-26；任务 ID：I02/I03。SQLite v10 保存 managed_workspaces/task_links 基础关系；WorkspaceService 固定 Git 参数、canonical 注册检查、禁止符号链接，工作区位于源仓库 .git/devly-workspaces/UUID，分支为 devly/task-UUID；创建基于当前 HEAD，不复制主目录未提交内容。
- 实现：审查包含实际工作区/主 HEAD、状态和内容摘要，新增文件内容也参与 token；保护路径拒绝，外部变化返回 stale；用户审查后暂存/提交，再允许干净主目录的 ff-only 合并。分叉/冲突明确拒绝，保留主内容；不自动解决复杂合并。关闭仅干净且无活动任务的工作区，始终保留任务分支，无自动 prune/reset/删除未提交内容。外部过滤器配置时拒绝自动暂存。
- UI：独立“任务与隔离”组，使用 shadcn Select/Textarea/Dialog/ScrollArea，任务列表、创建独立会话、停止/打开，以及 worktree 审查、提交、合并、关闭；没有通过 Renderer 任意执行 Git 命令。
- 文件：extensions/workspaces/repository、data/migrations/store/service、shared/extension-contracts、Renderer extensions/TaskPanel/use-tasks、设置与样式；backup 补充新元数据校验。
- 验证：typecheck/build:bundle 退出 0；node scripts/verify-workspaces.mjs 在当前 macOS 主机退出 0，临时真实 Git 的两工作区/分支/项目隔离、主脏文件保留、真实 Diff、版本过期拒绝、脏删除/脏合并拒绝、实际提交/快进、冲突分叉拒绝及关闭保留分支三组通过。Git 系统约束在主机按审批运行；未扩大为 Windows 或复杂 rebase/merge 支持。
- 状态：I02/I03 本机基础验收完成，任务父子/预算和最终集成在 I06/I07；进入 I04。

## LOG-078｜阶段 10/10.5/I04：真实 MCP 服务与审批映射

- 日期：2026-11-26；任务 ID：I04。安装官方 @modelcontextprotocol/client 2.4.0、AJV 8.20.0，测试服务器 @modelcontextprotocol/server 2.4.0 为开发依赖；版本已查 npm 和官方源码。首次安装因当前 node_modules 绑定项目 .pnpm-store 而拒绝，沿用该 store 重试成功，没有修改全局配置。
- 实际实现：MCP Streamable HTTP、工具发现与连接检查、项目级显式启用、按服务 UUID/工具名哈希的别名、配置 revision/Schema 双重核对。输入与结构化输出交给有超时/内存限制的 Worker 校验；禁止跨地址重定向、限制消息大小/工具数/连接数，无自动副作用重试。SDK 的可选 sampling/elicitation/自动认证不开放；暂不实现 stdio/OAuth/所有 MCP 扩展。
- 凭据与权限：SQLite v11 保存配置与受保护凭据引用，Key 只在 Main/Vault；备份剥离新引用并 VACUUM。每次 MCP 调用映射到原 ApprovalBroker/Confirmation，显示服务/端点/工具/Schema 来源；拒绝/过期不执行，配置变化撤销旧连接；MCP 远端不等于项目文件沙箱，未知结果明确不重放。
- 文件：extensions/mcp/schema/schema-worker/repository、shared extension/agent 契约、data/migrations/store/service/backup、chat/runtime、AgentTrace 和独立 MCP 设置组、electron.vite Worker 入口、pnpm 锁文件。
- 验证：typecheck/build:bundle 退出 0；node scripts/verify-mcp.mjs 在主机退出 0。官方 SDK 的实际本地 HTTP MCP 服务完成发现和成功/失败连接；两个同名工具服务别名不同；审批前无 handler 调用，拒绝回传模型，批准后写真实审计文件，重复审批不重复派发；无效参数在审批前拒绝，服务端真实异常标失败，生成测试 Key 不进入公开/持久工具记录。模型为本地协议 fixture，MCP 是实际运行服务，不冒充任何外部商业服务。
- 限制/状态：I04 当前 macOS 本地真实服务基础通过，网络故障/包内/GUI 与集成在 I07 继续；子任务继承不在本项提前判通过。进入 I05。

## LOG-079｜阶段 10/10.6/I05：真实 Skills 与关联资源

- 日期：2026-11-27；任务 ID：I05。发现项目 .agents/skills、.claude/skills、.devly/skills 的实际 SKILL.md；查看后显式启用，按内容 SHA 保存选择，来源纳入 Agent 上下文。内容变化或不可读时拒绝沿用旧授权，提示重新审查或移除；不自动执行 Skill 脚本、不把工具结果提升为指令。
- 资源：read_skill_resource 只对所选 Skill 注册，限制目录/行数/大小/编码；逐层拒绝符号链接、路径越界与秘密路径，仍以普通工具数据进入后续模型回合。最小 frontmatter 读取 name/description，不宣称支持完整 YAML 或所有第三方 Skill 方言。
- 文件：extensions/skills、extensions/repository、shared/extension-contracts、Agent runner/context、SkillsPanel/use-skills、data/backup、scripts/skills.integration 与 verify-skills。
- 验证：typecheck、build:bundle 退出 0；verify:skills 两组实际临时文件/SQLite/Agent 工具往返通过，包含读取关联资源后继续模型、来源、越界/符号链接拒绝、内容变化阻断且未发 HTTP、移除。模型为本地 fixture；原生关联资源是真实文件。UI 查看/启用和包内检查由 I07 补齐。
- 状态：I05 本地完成；进入 I06。选择和资源不会自动跨项目/供应商传输；子任务只继承明确的根项目上下文。

## LOG-080｜阶段 10/10.7/I06：父子 Agent、预算与取消

- 日期：2026-11-27；任务 ID：I06，关联 I01/I02。用户显式开启多 Agent 后，项目写模式才暴露 spawn_agents；审批展示任务内容/模式/预算，批准后创建最多两个独立 worktree 和会话。父子使用相同 Provider/模型，子任务不再委派；内部权限上限不能由 Renderer 参数伪造，根项目当前权限同时复核。
- 预算/生命周期：父预算先预留子份额，子任务只能消费份额，回收未用部分幂等；统一 Token/调用/输出/截止时间，Provider 未报告用量按预留保守扣除。父等待子任务时让出队列许可，避免目录锁死锁；取消贯穿子 HTTP、排队、执行与待审批。部分初始化失败保留已创建工作区，不自动清理用户内容。
- 数据/界面：task_links 保存 root/parent/workspace/context 归属，工具与审批仍属于各自回合；原 AgentTrace 展示关系、预算与父子跳转。已关闭工作区保留项目和会话历史，仅工作目录移除；不恢复旧 HTTP/进程或重放授权。子工作区基于已提交 HEAD，父未提交内容不隐式复制。
- 文件：extensions/budget/delegation、chat/runtime/repository/recovery、extension repository/workspaces、shared Agent/chat/extension 契约、ChatWorkspace/use-chat、AgentTrace、TaskPanel/use-tasks；tests/task-budget 与 scripts/multitask.integration。
- 验证：TaskBudget 3 项和 RunQueue 2 项通过；verify:multitask 当前 macOS 五组通过，两个真实工作区、同 Provider/记忆/Skill/限额继承、真实单文件审批写入/主目录不变、全局输出用量对应、超预算在建工作区前拒绝、父取消 HTTP 与待审批补丁均收尾、重复旧审批无效、同目录写排队/异目录并行及跨会话日志拒绝。首次夹具把 read_file 的 limit 写成 endLine 导致严格参数拒绝，修正夹具后通过，没有放宽产品校验。
- 状态：I06 本机基础完成；进入 I07。模型响应为本地可复现协议 fixture，不冒充真实收费 API 的多 Agent 能力；Windows、任意工具链与复杂合并范围不扩大。

## LOG-081｜阶段 10/10.8/I07：集成失败修正与边界补齐

- 日期：2026-11-27；任务 ID：I07，关联 A08/I01–I06。开发窗口实际走通 MCP 审批与两个子任务后，worktree 审查首次失败：补丁核心保留的 .devly-before-UUID 恢复副本被当成普通待审查文件，ReadOnlyToolbox 按保护策略拒绝。保留该失败，未放宽秘密/恢复副本读取规则。
- 修正：审查列出恢复副本数量但不读取/暂存，代码差异正常审查/提交/快进；存在副本时拒绝关闭，要求用户手动妥善保存，不 force 删除或自动清理。新增真实文件检查，确认内容保留、关闭 recovery_present、夹具拥有者明确处理后可关闭干净工作区。源分支同 HEAD 切换也使旧 token 失效，回到创建绑定分支后才能合并。关闭只读子工作区后历史仍可读，失效目录入口明确。
- UI 审查同时修复记录保存返回 ID 的草稿更新与严格 DTO 白名单：编辑用户记录/MCP 不把 source/updatedAt/revision 等服务字段传回输入契约，保存后即可测试 MCP；原数据 ID 保留。四组仅显示对应内容，沿用 shadcn 控件和 AppShell ScrollArea，原组件 35 文件与图标 v5 不变。
- 回归夹具修正：旧 verify:chat 要求第 5 个任务拒绝，与 I01 的排队要求冲突；改为检查 4 个活动、第五个 queued、32 个活动及等待上限、第 33 个拒绝、关闭全部真实收尾。第一次新版夹具误等待不存在的 streaming phase，改为等实际已保存文本；没有修改产品状态来迎合测试。extensions 的跨项目复用 ID 检查使用合法输入白名单，验证归属拒绝而非靠未知字段失败。
- MCP 增加真实派发后取消：实际 SDK handler 已启动但尚未返回时停止，回合显示 EXECUTION_STATE_UNKNOWN，旧审批失效，释放夹具后无第二次派发。输入/输出 Schema 继续使用有界 Worker；所有结果仍脱敏。v11 备份增加有凭据 MCP 配置/项目记忆的真实检查，活动引用保留而快照与恢复引用清除。
- 主机失败记录：受限环境的 Electron 检查曾以 task_name_for_pid 错误退出，升级主机权限后运行；另有完整 Agent/执行夹具打印场景后仍返回非零，两次都未计为通过，未据无堆栈退出断言产品根因。补充 signal 诊断、顺序单独重跑及完整 check 后均退出 0。安装包许可核对脚本最初使用受 exports 禁止的 package.json 路径，随后又解析到了客户端之外的 Ajv 6；改为按实际声明的直接 Ajv 8 与客户端依赖根核对，确认原先复制的产品许可证正确，没有用错误版本替换通知。
- 文件：extensions/workspaces、shared/extension-contracts、TaskPanel 与 hooks、workspaces/mcp/multitask/chat/stability 集成、smoke-extensions、verify-agent/verify-execution、vendor 七份许可和打包过滤。完整状态与最终验证收口见下一条；不把中间失败隐藏为首次全部通过。

## LOG-082｜阶段 10：当前 macOS 本地及包内验收归档

- 日期：2026-11-27；阶段 / 步骤 / 任务 ID：10.1–10.8，A08/I01/I02/I03/I04/I05/I06/I07。按用户新指令完成阶段 10，不追认阶段 9 Responses/Anthropic 真实端点通过。
- 全套：pnpm check 退出 0，159 项通过/3 项主机检查默认跳过（19 个文件通过/2 个跳过），类型/Lint/格式/31 文档/106 唯一任务/35 原组件/357 图标/构建及全部数据、聊天、Agent、阶段 9 集成、项目记忆与 Skills 通过。Lint 仍有 TanStack useVirtualizer 的 React Compiler incompatible-library 一条警告；Zod Rollup 注释和大块构建提示保留。最后夹具改动另经格式/Lint/文档检查，不以默认跳过项声称主机已通过。
- 阶段 10 实际原生：verify:extensions 2 组、verify:skills 2 组、verify:workspaces 3 组、verify:mcp 4 组、verify:multitask 5 组退出 0。官方 SDK 真实 HTTP 服务（含失败连接/工具异常/取消）、真实 Skill/资源、真实 Git 工作区与补丁、审批和拒绝、同目录串行/异目录并行、子预算/权限/Provider 继承、父子取消、日志归属均有实际记录。v7 与阶段 9 的 v8→v11 正常/DDL 失败迁移均通过，旧记录/版本回滚/可读备份保留；verify:stability 6 组退出 0。
- 开发窗口：verify:extensions-ui 退出 0，原生表单、记忆修改不重复 ID、Skill 原文查看启用、MCP 发现/审批、两个隔离子任务/父子跳转、真实代码审批修改、960×680 审查可操作、用户本地提交与快进、关闭干净只读工作区/保留分支及历史、重启无重放通过；本地模型请求 8 次，实际 MCP 副作用仅 1 次，无 pageerror。
- 打包：pnpm exec electron-builder --dir --config.electronDist=node_modules/electron/dist --config.mac.identity=null 退出 0，release/mac-arm64/Devly.app 为未签名目录、未公证、不是 DMG。七份新增实际许可与包内 Resources/licenses 逐字节/SHA-256 一致（client/core 2.4.0 Apache-2.0、Ajv 8.20.0 及已记录传递依赖 MIT）。依赖库存为 67 直接/937 已安装版本，未做新的网络安全清零声明；原发行阻断仍保留。
- 包内：DEVLY_EXECUTABLE 指向新 .app 的 verify:extensions-ui 退出 0，完整扩展流程再次通过；还实际创建/检查/安排恢复 v11 备份，修改备份后的会话标题，重启恢复原标题、记忆/MCP/所选 Skill/两个子回合及工作区关系；请求仍仅 8 次，MCP 副作用仅 1 次，无旧网络/工具重放。包内 verify:execution-ui、verify:editor-ui、verify:stability-ui 均退出 0，原 Confirmation/Plan/Task、停止/旧审批、保存冲突/Diff、本地 blob: Monaco Worker、两新协议本地聊天/错误/恢复/配置白名单与备份均无核心回退。原生 verify:execution 7 组、verify:editor 4 组、verify:git-workspace 6 组也退出 0。
- 文档与证据：新增 docs/task-extensions.md（三张详细架构/时序图、使用、迁移、上限及实际边界）；同步 README、文档入口、架构、选型、数据、聊天/只读/执行/编辑器、Renderer、UI、质量、依赖、阶段说明和唯一工作计划。output/extensions-parent.png 与 extensions-worktree-review.png 为实际窗口截图，已查看预算/父子入口和最小窗口审查布局；.cache/stage10-* 为本机各命令日志/库存/许可检查。没有提交或推送，保留之前阶段未提交内容。
- 未覆盖/剩余：所有模型响应为可复现本地协议夹具，本轮没有新的收费第三方 API；阶段 9 新协议真实端点另行联调。MCP 只覆盖当前 Streamable HTTP 子集和本地实际服务，不包含 stdio/OAuth/sampling/所有外部服务；Skill 不执行任意脚本；最多两子任务/一层；合并仅快进；恢复副本存在时不可自动关闭工作区。worktree 不是沙箱，Windows/远端 CI、个人工具链、任意 MCP/Skill、签名/升级/安装包与既有依赖版权阻断继续未验证，不以本机成功抵扣。
- 最终复核：最后夹具与文档改动后，pnpm lint 退出 0（保留原有 1 条警告），pnpm format:check 退出 0，pnpm check:docs 退出 0（31 Markdown、106 唯一任务 ID、82 条连续日志），git diff --check 退出 0。早期主机夹具非零退出的根因未据现有证据确认，最终顺序复核与包内检查通过，保留 LOG-081 的失败记录。
- 验收：三条阶段验收逐条通过当前 macOS 范围：目录锁/归属与取消；未提交/恢复副本/分支保护及审查合并；实际 MCP、实际 Skill 与父子权限/预算/取消。阶段 10 标为完成（当前 macOS，本地模型夹具范围），I07 完成，进入阶段 11 的待开始位置，唯一下一步 11.1/E01；本轮未实现阶段 11。

## LOG-083｜阶段 11/11.1/E01：搜索、抓取与真实来源

- 日期：2026-11-27；任务 ID：E01。用户确认先完成代码和本地验证，真实搜索端点另行联调，不能把本地 JSON 服务当作商业搜索验收。
- 变更：SQLite v12 web_configs 保存项目级搜索/抓取开关、Brave/JSON 协议、固定端点和独立受保护凭据引用；新增网页工具设置组。Main 使用固定 IPv4 DNS 解析并锁定实际连接地址，禁止私网/元数据/不支持协议，逐跳复核重定向，无网页 Cookie/模型 Key。2 MiB 响应、15 秒 socket/5 秒 DNS、独立 64 MiB/2 秒 HTML Worker；实际 URL、标题、摘要和时间返回模型，原 Tool/Confirmation 对完整请求逐次审批。
- 文件：shared/web-contracts、main/web、DataStore/LocalDataService/migrations/backup、ChatRuntime/ApprovalBroker、WebPanel/设置组/AgentTrace、electron.vite、builder、scripts/web*、tests/web-network、parse5 固定 8.1.1/原 MIT 许可。备份剥离搜索引用并核对配置，凭据生命周期与模型配置分离。
- 验证：typecheck/build:bundle 退出 0；web-network 两项通过；verify:web 三组实际本地 HTTP/SQLite/Agent 审批测试退出 0，401/429、项目隔离、拒绝/非法/私网/版本变化零请求、重复授权无效、持久结果与 Key 脱敏通过。web-live.integration 当前 macOS 实际 HTTPS GET https://example.com/ 退出 0，标题 Example Domain、正文 156 字符，有实际取得时间，未用 Key/搜索/模型。GUI 与包内完整集成留到 E06。
- 失败修正：安装受限 DNS ENOTFOUND 后停止重试并获主机联网安装成功；Node 双栈自动选择与自定义 lookup 参数不匹配最初报 ERR_INVALID_IP_ADDRESS，明确 family:4 后真实抓取通过。搜索凭据处理分支最初落入通用 Worker 路由导致 INVALID_REQUEST，补齐返回后集成通过；旧夹具 chat.read 多传 turnId 已按严格契约修正，没有放宽校验。
- 状态：E01 代码与当前 macOS 本地/公开抓取验证完成；真实搜索端点待联调。按用户允许的本地范围进入 11.2/E02；不开放未审批的本地文件上传，不声称 IPv6/任意站点/付费搜索兼容。

## LOG-084｜阶段 11/11.2/E02：真实附件与能力映射

- 日期：2026-11-27；任务 ID：E02。系统选择器导入 UTF-8 文本（≤128 KiB）和 PNG/JPEG/WebP（≤2 MiB、尺寸/像素限制），每条最多 4 个；其他二进制/PDF/秘密文件明确拒绝。导入只保存在当前会话，不发网络；发送前页面明确文件内容/历史附件会交给所选供应商。新会话附件保留输入草稿，移除只移出待发送清单，不删用户原文件。
- 数据/运行：SQLite v13 blobs.digest，实际 SHA-256/类型/字节数与消息分段引用；读时重新校验，跨项目/会话引用拒绝，已被历史引用的副本不能直接删除。完成回合的上下文按实际消息 ID 恢复附件，模型切换须既有显式历史确认，视觉未知/不支持时不静默丢掉图片历史、也不发请求。普通失败重发保留原附件引用；不自动重发副作用。
- 协议：Chat image_url、Responses input_image、Anthropic base64 source 各自映射；没有把 data URI 当 Anthropic 在线 URL。图像上下文以明确估算的占位计算，供应商实际用量仍沿用上报，不编造图片 Token 或费用。备份检查新增摘要与 blob manifest 一致性，旧无摘要附件明确要求重新导入。
- 文件：shared/attachment-contracts、main/attachments、data/store/service/migrations/backup、chat/runtime/repository、agent/context/runner、三协议映射、ChatWorkspace/use-chat/ChatHistory、样式、附件单测和集成脚本。
- 验证：typecheck 退出 0；attachments 3 项单测通过（真实头/尺寸/秘密/大小边界、估算与三协议图片格式及未知视觉零请求）；verify:attachments 三组真实临时文件/SQLite/HTTP 退出 0，包括原文件不变、消息持久引用、重启后历史图片/文本、跨会话拒绝、切换不支持视觉模型拒绝、外部替换副本拒绝且零额外请求。Lint 退出 0，保留 TanStack 既有一条警告。模型响应为本地夹具，未声称任意模型视觉已验收；GUI 与包内在 E06 收口。
- 状态：E02 当前 macOS 本地完成，进入 11.3/E03；真实搜索联调仍按用户确认保留，没有因此扩展阶段 12。

## LOG-085｜阶段 11/11.3/E03：隔离静态预览与端口清理

- 日期：2026-11-27；任务 ID：E03，关联 R04。预览用户明确选择的项目 HTML，以入口所在目录为静态根，支持 dist/index.html 等已构建产物，不执行 Shell/npm/任意项目命令。127.0.0.1 随机端口、随机入口令牌与 HttpOnly/SameSite Cookie，校验 Host；每资源≤2 MiB，限定类型、真实路径、无符号/硬链接、秘密检测；不把项目根之外或应用 userData 暴露为文件服务。
- 容器边界：独立非持久 Session/BrowserWindow，sandbox/contextIsolation 开启，无 preload/Node/opener/主界面 IPC；禁止权限、显示媒体、下载、弹窗和 webview，限制 WebRTC 策略。静态 CSP 禁止连接/表单/框架/Worker，网络拦截只允许本预览来源；不声称 VM 或完整 OS 网络沙箱。静态后端/API/HMR/外部 CDN 不包含在此入口。
- 生命周期：关闭预览窗口、停止、主界面重载或应用退出时关闭监听与连接、销毁窗口并清除会话存储。没有把旧端口或 PID 持久成仍在运行。独立设置组只显示本项配置，按钮具有实际状态。
- 失败处理：首次预览夹具初始化两次 SIGSEGV（未进入网页加载）保留失败。DatabaseClient 原先在正常关闭握手后立即 terminate Worker，改为等待自然退出、3 秒超时才强制清理，并让并发关闭共享同一完成 Promise。修正后 verify:preview-ui 实际窗口通过，另 verify:worker-close 的三个独立 Electron 进程各重开四次 SQLite、保持记录与并发关闭，全部正常退出且未重试失败；不以这些样例宣称所有主机 SIGSEGV 根因已覆盖。WebRTC API 经本机类型/官方文档核对属于 webContents，修正初始 Session 调用的类型错误。
- 文件：preview/service、shared/preview-contracts、DataService、DatabaseClient、PreviewPanel/设置组、stage11-ui-seed、smoke-preview、worker-close 集成与脚本。typecheck/build:bundle 退出 0；verify:preview-ui 三组通过，实际 HTML/CSS/DOM、无 Node/IPC/可读授权 Cookie/弹窗，秘密/越界/符号链接/无令牌请求拒绝，停止后真实端口不可连接，重新预览构建目录与主界面重载清理均通过；output/preview-isolated.png 为实际窗口截图。GUI/包内总回归在 E06 继续。
- 状态：E03 当前 macOS 本地通过，进入 11.4/T10 的远程权限/传输边界，再实现 E04；不提前开放未验收浏览器工具。

## LOG-086｜阶段 11/11.4/T10：独立远程权限与撤销

- 日期：2026-11-27；任务 ID：T10。网页权限独立于项目写权限；默认关闭、精确请求审批，不把本地只读/写授权变成网络或文件上传授权。浏览器来源策略为显式 HTTPS origin 列表（上限 8），无路径/凭据/查询串/私网/特殊端口；保存策略尚不注册浏览器工具，实际浏览器在 E04 验收后接入。
- 收紧：配置/凭据变化前后取消对应项目请求，UI 所有者释放只取消该所有者的测试请求；Agent 请求由回合取消链负责。每请求固定已批准的 revision，DNS 后连接前再次核对；搜索凭据只发固定搜索端点，正文抓取不携带它们。公共 HTTPS 抓取只跟随同来源重定向，跨来源要求新的请求/审批，不静默把授权扩散到新站点。错误返回明确的网络/凭据/限流/权限提示，不生成替代来源、不自动重试。
- 文件：shared/web-contracts、web/network/service、data/service、chat/runtime、Agent runner、WebPanel、web-network 与 web.integration。typecheck/build:bundle 退出 0；web-network 三项通过，包含 IPv4 私网/特殊地址、固定端点和独立浏览器 origin 策略；verify:web 四组退出 0，两个实际保持连接的 HTTP 搜索请求分别绑定 owner，释放 A 不关闭 B，修改权限关闭 B，均无自动重试；旧审批/参数/私网/版本变化无新请求，独立 Key 仍脱敏。
- 边界：已派发请求可能已经被远端记录或计费，取消不声称追回数据；当前网络支持有界 IPv4 公共 HTTPS 与用户明确配置的 127.0.0.1 搜索服务，不宣称完整 OS 网络沙箱或任意代理/IPv6 支持。网页内容始终为普通不可信工具数据，不能提升为系统指令或访问 Vault。
- 状态：T10 本地策略与实际连接验收完成，进入 11.5/E04；浏览器实际页面/截图/交互及包内证据在下一步骤补齐，真实搜索端点仍按用户确认另行联调。

## LOG-087｜阶段 11/11.5/E04：实际浏览器审批、交互与截图

- 日期：2026-11-27；任务 ID：E04。每个回合使用独立非持久 Session、沙箱窗口与带随机认证的代理；仅配置的 HTTPS origin 或当前项目已启动的隔离预览可访问。固定 IPv4 解析并向已核对地址 CONNECT，不让浏览器再次 DNS 解析私网目标。无 preload/Node/主窗口 IPC、登录复用、弹窗、下载、文件上传或密码输入入口；没有任意 JS 执行工具。不是 OS 级网络沙箱。
- 每次导航、读取、截图、点击、填入与关闭均绑定回合/调用/策略版本并逐次审批；点击/填入在同一次固定隔离世界脚本执行前重新比较页面与元素快照，用户在审批期间编辑会拒绝。注册表校验先于派发，模型不能调用未开放工具。设置/凭据更新撤销旧浏览器，结束或停止销毁回合窗口、端口与会话数据；已经发生的网站副作用不能撤回。
- 截图来自实际 capturePage，PNG 有大小/摘要/项目/回合/工具归属校验，以 blob 和 assistant 消息引用持久化；界面提供分块读取、SHA-256 核对后查看，不自动宣称模型已看到截图或自动发送视觉请求。
- 文件：shared/browser-contracts、main/browser、ApprovalBroker/runner、ChatRuntime、DataService/Store、WebPanel、AgentTrace/BrowserCapture、Vite 入口与 browser-proxy/smoke-browser 脚本。
- 验证：typecheck、build:bundle 退出 0；真实代理脚本退出 0，407/精确预览请求/私网和未知来源 CONNECT 拒绝/关闭不可连接通过。verify:browser-ui 实际窗口两组退出 0，六次独立审批后导航→填入→点击→读取→实际 PNG→关闭，重复授权无效；审批期间外部 DOM 编辑拒绝，停止待审批回合关闭对应窗口、旧按钮无效；无页面错误。模型响应为本地 SSE 夹具，浏览器 DOM/HTTP/PNG 均为实际执行。
- 失败记录：初始 GUI 卡在尚无文档的 BrowserWindow 上等待 Page.setInterceptFileChooserDialog 命令，未计通过；改为先加载隐藏窗口、设置文件选择拦截后再展示，实际重跑通过。测试脚本增加错误快照与有界关闭，未把超时强退当成通过。公开网站实际浏览验证和最终包内回归在 E06 记录。
- 状态：E04 当前 macOS 本地完成，进入 11.6/E05；真实搜索端点按用户确认另行联调。

## LOG-088｜阶段 11/11.6/E05：显式启用的本地只读定时任务

- 日期：2026-11-27；任务 ID：E05。SQLite v14 local_schedules/schedule_runs，配置默认停用；明确指定 Provider/模型/任务/60 秒至 30 天间隔，错过跳过或最多补一次，UTC 日期每日 1–20 次（默认 5），通知默认关闭。每项目最多 10 项/全局 100 项，5 秒检查、最多四个活动；不是云端服务/系统常驻 daemon，应用退出不执行，睡眠取消当前执行，唤醒遵守错过策略。
- 每次独立会话及持久领取记录，事务先占位再发 HTTP，重复 tick/并发点击不能重复领取。固定只读、2048 输出 Token/6 工具/4 轮/30 秒和项目更低上限；模型 Key 沿用 Main Vault，不进配置。隐藏所有写入/命令/MCP/网页/浏览器/子 Agent，注册表拒绝模型伪造调用。只读任务仍向已选模型发送必要项目上下文，启用界面明确说明费用和范围，不自动换供应商。
- 停止先停用、再取消对应运行并等待真实收尾，不影响同项目手动会话；任务执行不改变手动选中的会话。重启领取中/运行中记 interrupted，不重放旧 HTTP。备份清除启用开关、恢复必须重新明确启用；任务内容和秘密校验、严格 DTO、项目归属及 Provider 缺失错误已接入。设置独立分组提供创建/修改/启用/执行一次/停止/历史/会话定位/移除，通知不含任务名或正文。
- 文件：shared/schedule-contracts、main/schedules、DataStore/migrations/backup、ChatRuntime 控制参数与等待接口、DataService/index 的 powerMonitor/Notification、SchedulesPanel/设置组、Vite 入口、schedules 集成和验证脚本。
- 验证：typecheck/build:bundle 退出 0；verify:schedules 四组真实 SQLite/HTTP/文件测试退出 0、模型请求共 10 次：停用零请求、实际读文件循环、第三次受次数限额阻断、隐藏写工具 UNKNOWN_TOOL 且文件未变、同项目手动会话不串；注入时钟模拟错过后跳过/补一次/重复 tick；停止对应保持连接的 HTTP，不关闭另一手动请求；实际数据库重开旧领取 interrupted，v14 备份所有任务均停用。时钟注入不是实际电脑物理睡眠实测，系统通知由用户选择且未发测试通知。
- 失败修正：首次将 turnId 用作 session-keyed Run Map 查询，等待过早返回；改为按实际 turnId 查找并等待完成 Promise。夹具未先激活项目导致 bootstrap.activeSessionId 为 null，补齐激活项目的真实前提后通过，没有改产品去迎合测试。初始类型检查暴露未定义错误枚举与 sessions.activate，改用已有 CHAT_BUSY/sessions.select；Lint 未用变量按明确 DTO 白名单修正，最终全套在 E06 记录。
- 状态：E05 当前 macOS 本地完成；进入 11.7/E06 的界面/包内回归和文档。真实搜索端点仍按用户确认另行联调。

## LOG-089｜阶段 11/11.7/E06：界面交接、持久限额与验收修正

- 日期：2026-11-27；任务 ID：E06，关联 E02/E04/E05/R04。原 Prompt Input 添加附件后的模型切换，原先预建会话旧绑定会覆盖新默认；改为绑定附件所属会话。App 按会话 ID 重建组件，还需在新会话提升为实际会话时按目标 sessionId 一次性交接草稿/附件/模式；纯读取与提交后清理兼容 StrictMode，不让别的会话接收该草稿。实际界面发送已通过。
- 截图查看原先把含 turnId 的 scope 全量展开到严格 blobs.read，导致参数被拒绝；改为显式项目/会话白名单。读完摘要匹配后，Renderer CSP 只新增 img-src blob:，允许真实本地截图显示，未放宽脚本或外部连接。实际查看已核对 naturalWidth=1000 并截图，非仅检查按钮存在。
- 调度收紧：Main 的存储忙/待恢复状态禁止新派发；停止仍按任务归属收尾。SQLite v15 新增 schedule_daily_counts 并迁移既有记录，每日计数独立于最近 300 条运行索引保留，避免清理后重置限额。305 次受限领取仍零额外模型请求，备份实际核对独立计数为 2、索引不超过 300。Main 保存前检查所选模型的实际保护凭据，秘密不能当任务正文持久化；通知不带任务名/正文；macOS 仅关闭窗口但应用仍在运行的行为已明确。
- 浏览器收尾：并发清理共享代理关闭 Promise；创建失败销毁已创建窗口。系统上下文只在明确配置下允许已注册浏览器例外，不与默认网络禁止指令冲突。最初包内新增检查发现文件选择事件未订阅，补 Page.enable 后再配置拦截；未打包构建的实际可信 UI 点击已触发 CDP 文件选择事件并保持空文件列表，文件/密码目标直接拒绝且没有审批。包内最终复核在下一条记录。
- 验证：pnpm check 退出 0（165 通过/3 默认主机跳过，32 文档/106 稳定 ID、35 原组件/357 图标及全部本地集成）；v15 调度五组、真实待恢复阻断、原 Worker 三进程自然关闭通过。此全套后追加的 Page 事件通知经 typecheck/build:bundle、实际 verify:browser-ui 通过（4 组，18 次本地模型请求），正在做最终包内复核。Lint 保留原 TanStack 一条警告，没有新增错误。
- 界面：verify:stage11-ui 三组实际附件/能力门控/模型切换/搜索测试/启用与停止/重启通过、2 次本地模型请求；verify:browser-ui 在公开 HTTPS 样例下四组通过、16 次本地模型请求，真实页面实际标题/正文与 PNG 查看均通过。之后新增文件选择场景使用本地页面，无额外公网依赖。搜索测试使用本地 JSON 服务，不代表商业搜索端点已联通。
- 失败记录：夹具第一次按纯文件名精确匹配但实际包含大小，改为可访问移除按钮定位；后续附件发送发现真实组件重建丢草稿，已修复而未放宽断言。首次公开页面正文有多语言、标题为 Example Domain，原英文正文断言不成立，改为核对实际标题与非空正文。脚本曾打印通过后因未清理关闭 timeout 回调退出 1，未记作通过；修正为捕获进程、清理 timeout 且超时明确失败后重跑退出 0。初次截图契约/CSP失败、文件选择事件缺失均保留为未通过，不以空文件列表推断事件已验收。
- 文件：ChatWorkspace/attachment-draft/BrowserCapture、Renderer index CSP、ChatRuntime、BrowserRuntime/Proxy、DataService、ScheduleRepository/Runtime/migrations/backup、stage11 与浏览器/调度脚本及桌面套件；新增 web-and-automation.md 三张详细图并同步 README/架构/选型/数据/聊天/权限/UI/质量/依赖/阶段文档。68 直接/937 安装版本，parse5 上游/供应商目录/首次包内许可 SHA-256 一致；旧版权、维护和发行阻断保留。
- 状态：E06 本地完成、最终包内收口进行中。真实搜索端点、新协议真实端点、真实视觉模型、物理睡眠/系统通知与 Windows 均不据本地夹具声称通过；不扩展阶段 12 的实现。

## LOG-090｜阶段 11：当前 macOS 本地及包内验收归档，真实搜索待联调

- 日期：2026-11-27；阶段 / 步骤 / ID：11.1–11.7，E01/E02/E03/T10/E04/E05/E06。用户明确先完成代码和本地验证，真实搜索端点另行联调；本条归档本地范围，不追认商业搜索、真实视觉模型或阶段 9 两新协议已通过。
- 功能产物：系统选择器附件/视觉门控及实际传输、独立网页配置/保护凭据与来源、受限静态预览、逐次审批的回合隔离浏览器/DOM/真实截图、显式启用的只读本地任务/历史/取消/重启。界面只显示当前设置分组，复用原 Prompt Input/Tool/Confirmation 和 shadcn，主内容仍由 AppShell ScrollArea 管理；品牌 v5、原组件来源及选型未回退。完整边界和三张详细图见 docs/web-and-automation.md。
- 完整检查：pnpm check 退出 0，165 项通过/3 项默认主机跳过，21 测试文件通过/2 文件跳过；类型/Lint/格式、当时 32 Markdown/106 唯一任务/88 条历史日志、35 原组件/357 图标和生产构建通过；数据、聊天、Agent、迁移/三协议/恢复/故障/配置、项目记录/Skill、网页四组、附件三组、v15 调度五组、实际代理和 Worker 清理均通过。调度额外验证 305 次受限请求没有额外模型 HTTP，运行索引保留≤300而独立每日计数仍为 2；待恢复/存储忙阻断、实际数据库重开、备份全部停用通过。Worker 为三个独立 Electron 进程各四次自然关闭，未重试失败。
- 最后收紧的 Page.enable 已另经 typecheck/build:bundle、Lint、实际未打包浏览器四组退出 0；pnpm check 后没有改变其他生产逻辑。文件/密码选择器在审批前拒绝；实际可信点击触发 CDP 文件选择事件，文件列表保持空。失败的早期包内事件断言未算通过，修正后重新打包并执行整套。
- 打包：pnpm exec electron-builder --dir --config.electronDist=node_modules/electron/dist --config.mac.identity=null 退出 0，生成 release/mac-arm64/Devly.app；未签名/未公证，不是 DMG 或正式安装包。parse5 8.1.1 实际 MIT 通知、resources/vendor/stage11-parse5.LICENSE 和包内 Resources/licenses 通知逐字节相同，SHA-256 8c535800331e1e4439835555b3f9edc7fe9dee2fab0d8bbbd5a982e8b8343d4d；库存 68 直接/937 已安装版本，khroma UNKNOWN 及原有发行阻断保留。
- 最终包内：DEVLY_EXECUTABLE 指向上述新 .app，pnpm verify:stage11-suite 退出 0；preview-ui、browser-ui、stage11-ui、execution-ui、editor-ui、extensions-ui、stability-ui 七项顺序全通过。预览实际端口、Cookie、HTML/CSS/DOM、无 Node/IPC、越界/秘密拒绝和释放已验；浏览器四组/18 次本地模型请求，包含真实 PNG 查看、单次审批、变化拒绝、停止/旧审批及实际文件选择拦截；附件/调度界面三组/3 次本地模型请求，包含未知视觉零发送、实际文本/图片传输、默认停用、显式运行、运行中的定时 HTTP 在实际退出时关闭、重启保留 cancelled 并无重放。未测试系统通知发送或电脑物理睡眠，模拟时钟/显式 suspend 测试与行为说明不替代这两项。
- 回归：原 Confirmation/Plan/Task 对真实命令/修改审批、停止/旧按钮、重启保留；Monaco 本地 blob Worker、保存冲突/实际 Diff；真实 MCP/Skill、父子 Agent/审查合并和新版备份恢复；两新协议本地聊天/错误/恢复/配置白名单均无核心回退。扩展脚本原文案 v11 指阶段 10 的扩展数据子集，本次运行实际采用 v15；已把报告文案改为 current-schema，不据文案假定数据库版本。
- 实际公网：前期 web-live.integration 真实 HTTPS GET 的 URL/标题/时间和 browser-ui 的公开 HTTPS 导航/DOM 已通过（后者 16 次本地模型请求，含额外公网导航），网页可能返回多语言正文，按实际标题和内容核对。公网样例未纳入 CI 反复请求；实际模型和商业搜索调用均未冒充，所有新增模型响应为明确的本地协议夹具。
- 文件与证据：shared 附件/网页/浏览器/预览/调度契约、Main 对应服务/SQLite v12–v15/保护存储与生命周期、Renderer 输入与设置/实际截图、parse5/打包资源、测试/CI/README 与当前架构/选型/数据/质量文档。output/preview-isolated.png、browser-capture.png、stage11-schedules.png 已实际查看；.cache/stage11-* 记录本机命令。退出时 Electron 曾打印 task_policy_set invalid argument，但这次套件七项均实际退出 0；未据该主机诊断宣称所有 OS 行为已覆盖。
- 阶段验收：附件限制/真实传输通过；公开抓取/真实浏览/预览隔离和本地搜索通过，但真实搜索端点按用户安排保留未完成；本地任务启用/停止/实际退出及重启通过，睡眠/通知边界明确。E02/E03/T10/E04/E05/E06 标完成（当前 macOS 本地/包内）；E01 代码本地完成、真实端点待验证；阶段 11 总体待验证（本地范围已归档），阶段 12 待开始，唯一下一项为用户安排的 E01 真实搜索联调。
- 未覆盖：Responses/Anthropic 真实端点、真实商业搜索/视觉模型、复杂网站/任意代理/IPv6/完整 OS 网络隔离、物理睡眠/通知、Windows/远端 CI/正式签名安装升级、旧维护/安全和完整上游版权通知仍独立保留。本轮不使用真实 Key、不请求聊天发 Key、不创建 Codex 后台自动任务、不提交或推送先前脏工作区。

- 最终复核：全部生产改动与夹具/文档收口后，pnpm typecheck、pnpm lint（0 错误，保留原有 1 条 TanStack 警告）、pnpm format:check、pnpm check:docs（32 Markdown/106 唯一任务/90 条连续日志）及 git diff --check 均退出 0；最后只同步验收状态与检查结果，不追加业务改动。

## LOG-091｜阶段 12/12.1/T12：核对目标环境与未支持执行的拒绝

- 日期：2026-11-27；ID：T12。用户明确要求阶段 12，随后确认先完成 macOS，Windows 留待外部实测；暂无签名条件，交付明确预览版。阶段 9/11 的真实新协议/搜索待办不追认通过。
- 环境：当前 macOS 26.5 / ARM64；未发现 prlctl/VirtualBox/QEMU/PowerShell/Wine 工具，GitHub CLI 未登录，security find-identity 报 0 valid identities。没有可使用的 Windows 主机/CI 和 Developer ID，不尝试以跨编译或模拟平台替代实测。
- 实际变更：共享 host-support 策略与 Main 既有拒绝一致，非 macOS 的项目写入/命令/补丁/终端不提供无隔离回退；Renderer 项目 Agent 选项禁用并明确说明可用只读流程，终端显示原因。新增 Windows-only 真实限制检查入口，验证中文空格路径、越界、文件不变和拒绝派发；只证明受限预览拒绝，不声称 Windows OS 执行隔离或 PTY 已实现。CI 配置安排该入口，未运行远端 CI。
- 文件：shared/host-support、Main command/patch/chat/terminal、ChatWorkspace/TerminalPanel、Windows 限制脚本、Vite 测试入口和 workflow。typecheck 退出 0；本机 verify:windows-restrictions 明确输出 host=darwin/status=not_run 并退出 2，作为未实测记录，不算通过；主机同时打印 task_name_for_pid 诊断，未据此声称 Windows 行为。
- 状态：T12 部分完成（平台入口拒绝与可验证脚本，Windows 隔离未落地/未实测）。按用户确认的 macOS 预览范围推进 12.2/X05，其 Windows 部分继续保留。

## LOG-092｜阶段 12/12.2/X05：当前 macOS 终端与主机边界复核

- 日期：2026-11-27；ID：X05，关联 T12。按用户确认先交付 macOS 预览，Windows 不算通过。
- 验证：pnpm verify:terminal 退出 0，五组实际 PTY：规范项目目录/最小环境/resize，多终端与 owner/项目隔离，Ctrl+C 中断前台 sleep 后继续输入，秘密文件拒绝与 262144 字符环形缓冲截断，关闭清理真实后台子进程、owner 释放关闭另一项目终端。pnpm verify:workbench-host 退出 0，三个测试文件共十五项，真实文件/网络拒绝、命令超时/取消、无晚到写入和 Git 边界通过。
- 原生依赖失败收紧：TerminalService 对 node-pty 改为使用时加载，加载期间重新核对 owner/closing；缺失时返回明确重装当前架构完整应用的提示，不在导入 Main 阶段直接崩溃。已有文件不因该错误删除。安装副本缺依赖的实际场景在 V03 继续验证。
- 文件：main/terminal/service、现有 terminal.integration 与 host 检查；全套 pnpm check 退出 0，新增真实 ANSI/KaTeX 安全渲染两项后共 167 通过/3 默认主机跳过，原数据/协议/恢复/网页/附件/调度/代理/Worker 集成通过。未用这些本机结果替代 Windows。
- 状态：X05 部分完成（macOS 已实测，Windows 延期）。进入 12.3/V02 的 macOS ARM64 预览 DMG 和资源验证；V03 另验实际复制安装/中文路径/升级/缺依赖。

## LOG-093｜阶段 12/12.3–12.4/V02/V03：真实 DMG 安装、升级和缺原生依赖

- 日期：2026-11-27；ID：V02/V03。版本 0.2.0-preview.1；按用户确认交付 macOS ARM64 未签名预览，Windows 未验证。
- 实际变更：electron-builder 固定预览版本产物名、明确 identity=null/publish never，增加 preview:mac/verify:mac-install；实际 DMG 先 hdiutil verify/read-only attach，再 ditto 到带归属标记的临时中文空格安装目录，独立中文 userData/空 PATH。迁移种子为实际 v7 数据库及旧设置/会话，使用项目 canonical realpath；不读取或迁移用户个人库。
- 实际验证：构建 DMG 退出 0，release/Devly-0.2.0-preview.1-mac-arm64.dmg 为 199652005 字节；verify:mac-install 退出 0、三组通过。首装不要求 Codex/开发机工具；v7→v15 保留设置/历史并生成迁移前备份；本地 HTTP 数学响应、Monaco 本地 Worker/实际 PTY 和重启均通过。仅在归属检查后的安装副本改名 pty.node/better_sqlite3.node：前者主界面仍启动并返回重装提示，后者显示真实存储错误而非正常空历史；finally 恢复二进制/卸载镜像/清理副本。未改系统 /Applications。
- 失败修正：首次夹具直接保存 /var 路径别名而实际文件守卫要求 canonical/private/var，导致项目不可用；改种子真实路径后通过，没有放宽产品目录校验。实际渲染发现 MathML 与排版重叠，原因是插件未自动引入 KaTeX CSS；增加精确 katex 0.18.2 和本地 CSS/字体，重新生产构建/DMG后，安装副本 computed position=absolute 检查通过。未把旧失败包算通过。
- 文件：package/锁文件/Vite/builder/workflow、styles.css、stage12-upgrade-seed/smoke-release-mac/verify-mac-install 脚本。证据 .cache/stage12/package-mac.log、install-mac.log、output/release-mac-install.json，报告绑定实际 appVersion/平台/架构/挂载方式。V02/V03 标部分完成：macOS 当前安装与升级范围完成；Windows、其他历史版本、跨架构和 Gatekeeper 正式分发未验收。下一步 V04–V07 本机边界、真实 API 与发行文档。

## LOG-094｜阶段 12/12.6、12.8/V05/V07：生产渲染依赖、包内回归与真实 API 编程

- 日期：2026-11-27；ID：V05/V07，关联 V01/P10/A09。生产 npm 审计真实检出 linkify-it 两项 high、KaTeX 一项 low；覆盖至 linkify-it 5.0.2/KaTeX 0.18.2，生产审计重跑退出 0/各严重级别 0。ANSI 模糊链接、恶意 URL/重复 mailto 及真实 KaTeX 不可信链接渲染两项新增测试通过；保留原 AI Elements 源码和原插件。69 直接/940 安装版本，三份新增实际 MIT 通知与上游和包内字节一致。该结果不覆盖全部开发公告、旧 Electron/工具链和既有版权问题。
- 本机检查：pnpm check 退出 0，167 通过/3 主机默认跳过；另十五项主机、五组 PTY 通过（LOG-092）。新包 preview/browser/stage11/execution/editor/extensions 六项顺序通过；stability 首次 page.screenshot 超时退出 1，该套件整体不计通过。未改代码或减弱断言，单独 verify:stability-ui 重跑退出 0，完整存储重连/只读核对继续/新协议本地聊天/导入导出/备份恢复/不重放检查和截图均通过，已查看实际截图。另包内 verify:workbench-ui 七组、verify:persistence 九组通过，包含原 Commit/真实 Git、Ctrl+C/resize/退出、主题/布局和系统 safeStorage 实际往返、明文不返回。
- 真实供应商：使用用户已配置的应用默认 Provider，仅复制其非秘密元数据与系统保护密文到隔离 profile；所有解密留 Main，个人项目/会话未复制，不自动换供应商。Chat Completions，https://ark.cn-beijing.volces.com/api/v3，deepseek-v4-1-flash-261017，2026-11-27。新包 verify:editor-live 退出 0：六轮/七次工具，实际搜索/列目录/读取→只允许生成样例的预期补丁→只允许 /bin/sh tests/verify.sh→实际文件/Git/Monaco Diff。exitCode=0、testProofMatched/testsUnchanged/diffMatched=true；各工具完成且有日志引用。局部授权 operator 只用于隔离样例，没有授权访问用户其他文件。
- 失败修正：首次真实 API 测试在密文初始化 SEED_FAILED，未发模型请求；实际目录 Devly/devly 大小写别名导致安全路径比较不一致。改为先 realpath 凭据根，再校验 UUID/文件/符号链接并复制密文，种子和实际 API 重跑通过。未在参数/环境/报告输出明文 Key。前期受限网络 DNS 失败的审计不算结果，允许访问后的独立文件才作审计证据。
- 文件：shared host-support、Main terminal/chat/执行拒绝、ChatWorkspace/TerminalPanel、pnpm overrides/KaTeX CSS/实际许可证、rendering-security.test、live-agent-seed、原验证入口与发行指南。证据 .cache/stage12/check.log、host-boundaries.log、terminal-mac.log、audit-production-after.json、render-tests.log、live-api.log、packaged-suite.log、packaged-stability-recheck.log、packaged-workbench.log、packaged-persistence.log。
- 状态：V05 当前 macOS 复核完成但跨平台/完整发行边界保留部分完成；V07 真实 API/macOS 核心通过、Windows 未验证，保留部分完成。Responses/Anthropic 真实端点、商业搜索、真实视觉、物理睡眠/通知及任意网站/IPv6 未据夹具通过；下一步按约定预览渠道归档交付。

## LOG-095｜阶段 12/12.5、12.7、12.9/V04/V06/V08：macOS 预览交付与完整版本保留项

- 日期：2026-11-27；ID：V04/V06/V08。用户确认暂无签名条件、Windows 外部实测；本轮仅交付 0.2.0-preview.1 macOS ARM64 本地未签名/未公证预览。未登录 GitHub CLI、0 有效签名身份，不发布或伪造远端 CI，不把未签名 DMG 叫正式发行。
- 文档：新增 release-acceptance/user-guide/release-notes，包含逐平台/功能矩阵、实际安装方式、备份/升级、真实快捷键、API/审批/恢复/缺依赖排错、已知限制；同步 README/架构/技术栈/本地数据/协议矩阵/质量/阶段计划与状态唯一来源。T12/X05/V02/V03/V05/V07/V08 保留部分完成，V04 按约定预览分发范围、V06 当前文档完成；阶段 12 整体部分完成。未通过项未勾选，唯一下一步为用户延期的真实 Windows T12，不自动新增范围或后台任务。
- 归档入口：archive:preview 收集当前 Git 工作区白名单（含本轮及既有未提交源码），排除 node_modules/out/缓存/测试 userData/凭据和符号链接，生成 source.zip、manifest、SHA256SUMS；manifest 要求实际 DMG 安装报告与版本匹配，列脏工作区/基准提交/字节数/摘要及保留事项。不使用 git archive HEAD 丢失未提交功能，不自动提交或推送。已实际生成 754 个源文件快照、manifest/SHA256SUMS，unzip 完整校验与 DMG/源码摘要校验退出 0；关键源文件与工作区逐字节一致，未含凭据、缓存或 node_modules。源码 ZIP 禁止扩展属性/资源叉，保持可跨平台读取。最终文档检查后的快照重新生成以包含本条记录；摘要以随包 SHA256SUMS 为准，避免在源日志嵌入自身 ZIP 摘要。
- 未通过项：真实 Windows 隔离/终端/原生依赖/安装升级、Developer ID/公证与 Windows 签名、新协议/搜索/视觉真实端点、旧 Electron/工具链维护、ansi-to-react 完整上游版权通知及 khroma UNKNOWN。当前 Electron 39.8.10，registry 本轮最新 45.5.0，官方仅支持最新三稳定主版本；不将安全定向覆盖或产物生成冒称维护升级。受限 PTY 不是个人完整终端，浏览容器不是完整 OS 网络沙箱，未验范围见发行报告。

- 最终静态复核：pnpm typecheck、pnpm lint、pnpm format:check、pnpm check:docs、pnpm verify:vendor、pnpm verify:icons、git diff --check 均退出 0；35 Markdown/106 稳定 ID/95 连续日志、35 原来源文件/357 SVG 通过。Lint 0 错误，原有 TanStack useVirtualizer 一条警告保留。最后只更新归档脚本元数据与文档，没有再改变已安装验收的产品代码。

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
