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
