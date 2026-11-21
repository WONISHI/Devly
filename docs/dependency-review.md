# V01：依赖维护、许可证、原组件来源与兼容性评估

评估日期：2026-11-21；开发环境 macOS ARM64 / Node 24.7.0 / pnpm 10.34.9。范围为当前锁文件与本机已安装内容，含开发依赖。**评估结论：可继续开发；当前组合不能标记为可正式发行。** 完成 V01 表示完成评估与有依据的局部修正，不表示已解决全部维护、安全、平台和分发问题。

## 1. 取证与复现

- `pnpm outdated --format json`：发现 22 个直接依赖存在范围外的新版本。新版本不自动等于当前版本失维护。
- `pnpm view 包@版本 deprecated version peerDependencies engines license --json`：核对误发/弃用与安装条件。
- `pnpm audit --json`：调整前后均退出 1，计数没有减少；审计问题计数为 low 4 / moderate 9 / high 7 / critical 2，共 22 项。相同公告可能在不同包或路径计数，不据此推断存在 22 个可直接利用的产品漏洞。
- `pnpm audit:dependencies`：扫描当前 host 安装包元数据与许可证文件名；58 个直接依赖、920 个不同 name@version；生成 `.cache/dependency-inventory.json`，不含本机绝对路径。
- `node scripts/verify-vendor.mjs --refresh`：读取固定上游提交，逐文件验证别名替换/格式化以外没有修改，生成已入库的 [来源与哈希清单](../resources/vendor/ai-elements.json)。正常 CI 用 `pnpm verify:vendor` 完全离线校验。

outdated/audit 原始输出保存在本机 .cache，结论和完整公告列表在本文；不把这些临时结果当成持续更新的安全数据库。安装清单含开发包，不能充当最终安装包 SBOM；未安装的 Windows/Linux 可选二进制不在本机扫描范围。

## 2. 本次调整与升级前后检查

唯一版本调整为 **@testing-library/jest-dom 6.10.0 → 精确固定 6.9.1**，同步 package.json 和 pnpm-lock.yaml。npm 元数据将 6.10.0 标记为错误 minor 发布，包含 Node >=22 和必需 DOM peer 的破坏性变化，并建议 6.x 使用 6.9.1。虽然当前 Node 满足其条件，也不继续采用上游已撤回的版本。

| 时点 | 检查与实际结果 |
| --- | --- |
| 调整前 | 类型/Lint、22 项测试、生产构建、开发产物桌面 smoke、Electron SQLite/PTY 通过；jest-dom 为 6.10.0，Electron 为 39.8.10 |
| 调整方式 | pnpm add -D @testing-library/jest-dom@6.9.1 --save-exact --store-dir .pnpm-store；安装退出 0 |
| 调整后 | 最终命令与结果见 LOG-011；检查入口覆盖类型/Lint/格式/关键测试/文档/原组件/bundle，另运行 native、桌面和未签名目录验证 |
| 未执行的升级 | Electron、ESLint、Vitest、Vite、AI SDK 等跨主版本升级尚未实施，不能声称升级后的组合兼容 |

安装还提示 electron-winstaller 的脚本未获 pnpm allowlist 许可。本次不盲目开放全部构建脚本；Windows 目录/NSIS 的实际需求须在 Windows 验证，必要时审阅该脚本后精确加入 allowlist。

## 3. 维护决策与兼容性

Electron 官方只支持最近三个稳定主版本；registry 此次 latest 为 45.4.1，39 主线不在此范围。ESLint 官方已将 9.0.0–9.39.5 列为 EOL（2026-08-06）。来源：[Electron 支持政策](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)、[ESLint 版本支持](https://eslint.org/version-support/)。

| 组合 | 当前判断与后续验证 |
| --- | --- |
| Electron 39.8.10 / 内置 Node 22.22.1 / SQLite 12.11.1 / node-pty 1.1.0 | 本机当前 ABI 加载、SQL 查询、PTY 输出/退出通过；旧 Electron 已失维护。必须升级至当时仍受支持的 Electron 补丁版，重新 install-app-deps，再做双平台原生、沙箱 preload、目录与包内 smoke。不能用开发机 Node ABI 代替 Electron ABI。 |
| Node 24.7.0 / pnpm 10.34.9 | 工具链固定有利于复现；不代表已处于最新安全补丁。正式发行前复核工具链补丁、engines 与 CI runner 支持。 |
| ESLint 9.39.5 / typescript-eslint 8.73.0 / hooks 7 | 当前 lint 通过；迁移 ESLint 10 必须同时检查插件 peer 范围与 flat config，避免只升核心。 |
| Vite 7.3.8 / electron-vite 4.0.1 / Vitest 3.2.7 / TS 5.9.3 | 当前类型、构建和契约测试通过；新主版本作为工具链组合验证，不单凭最新标签升级。Vitest/tinypool 的公告是发行/可信构建阻断项。 |
| React / React DOM 19.3.1 / 原 AI Elements 固定提交 / Radix / Streamdown 2.8.0 | 当前实际渲染 Conversation、Message、Tool、Commit、Code Block 通过；未代表未引入组件已兼容。AI SDK 6 → 7、Shiki 3 → 4、resizable-panels 3 → 4 要分别检查公开接口和上游组件依赖。 |
| Monaco 0.52.2 / React wrapper 4.7.0；xterm 5.5.0 / fit 0.10.0 | 仅已安装，尚未接编辑器和交互终端。版本候选需要 worker/CSP、模型生命周期、PTY 编码、resize/退出实测，不能声称现有业务兼容已通过。 |
| lucide-react 0.468.0 | 当前图标渲染可用；升级至新主线前核对图标导出与布局，不影响已确认品牌图标。 |

直接依赖的版本差异快照（升级前）：

| 包 | 当时安装 | registry latest | 本次决策 |
| --- | --- | --- | --- |
| @eslint/js | 9.39.5 | 10.0.1 | 保留锁定版本；候选版本需单独兼容验证 |
| @testing-library/jest-dom | 6.10.0 | 8.0.0 | 已固定至 6.9.1，未跨主版本 |
| @types/better-sqlite3 | 7.6.13 | 9.6.0 | 保留锁定版本；候选版本需单独兼容验证 |
| @types/node | 24.19.2 | 26.6.6 | 保留锁定版本；候选版本需单独兼容验证 |
| @vitejs/plugin-react | 5.2.0 | 6.3.0 | 保留锁定版本；候选版本需单独兼容验证 |
| @xterm/xterm | 5.5.0 | 6.0.0 | 保留锁定版本；候选版本需单独兼容验证 |
| ai | 6.0.333 | 7.0.179 | 保留锁定版本；候选版本需单独兼容验证 |
| better-sqlite3 | 12.11.1 | 13.2.0 | 保留锁定版本；候选版本需单独兼容验证 |
| electron | 39.8.10 | 45.4.1 | 旧主线已失维护，发行前必须升级验证 |
| electron-vite | 4.0.1 | 6.0.0 | 保留锁定版本；候选版本需单独兼容验证 |
| eslint | 9.39.5 | 10.15.0 | 旧主线已失维护，发行前必须升级验证 |
| globals | 16.5.0 | 17.14.0 | 保留锁定版本；候选版本需单独兼容验证 |
| jsdom | 27.4.0 | 31.0.1 | 保留锁定版本；候选版本需单独兼容验证 |
| react-resizable-panels | 3.0.6 | 4.24.1 | 保留锁定版本；候选版本需单独兼容验证 |
| shiki | 3.23.0 | 4.6.0 | 保留锁定版本；候选版本需单独兼容验证 |
| typescript | 5.9.3 | 7.0.2 | 保留锁定版本；候选版本需单独兼容验证 |
| vite | 7.3.8 | 8.3.8 | 保留锁定版本；候选版本需单独兼容验证 |
| vitest | 3.2.7 | 5.1.1 | 保留锁定版本；候选版本需单独兼容验证 |
| @xterm/addon-fit | 0.10.0 | 0.11.0 | 保留锁定版本；候选版本需单独兼容验证 |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.8 | 保留锁定版本；候选版本需单独兼容验证 |
| lucide-react | 0.468.0 | 1.77.0 | 保留锁定版本；候选版本需单独兼容验证 |
| monaco-editor | 0.52.2 | 0.57.0 | 保留锁定版本；候选版本需单独兼容验证 |

## 4. 安全公告与发行阻断

以下为此次 registry 审计返回的包/公告/修复范围。修复范围是审计数据，不代表已安装修复版本；Electron 官方支持范围还需独立满足。当前 deny popup、禁用 webview/Node、仅加载本地页面降低部分攻击面，但不能代替升级。Vitest 使用 run 模式，不开放测试 UI/server，也不能用这一点宣称公告已修复。

| 包 | 严重度 | 公告 | 审计给出的修复范围 |
| --- | --- | --- | --- |
| extract-zip | high | [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | 公告未给可用修复范围 |
| vitest | moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | >=4.1.11 |
| @vitest/mocker | moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | >=4.1.11 |
| extract-zip | high | [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | 公告未给可用修复范围 |
| electron | high | [GHSA-hq2x-r82h-9wj4](https://github.com/advisories/GHSA-hq2x-r82h-9wj4) | >=41.10.4 |
| electron | high | [GHSA-gr2m-v5gq-v685](https://github.com/advisories/GHSA-gr2m-v5gq-v685) | >=41.10.6 |
| electron | high | [GHSA-j84w-jfhq-vhvj](https://github.com/advisories/GHSA-j84w-jfhq-vhvj) | >=41.10.6 |
| katex | low | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | >=0.18.2 |
| tinypool | critical | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | >=2.1.1 |
| tinypool | critical | [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | >=2.1.2 |
| electron | high | [GHSA-9qh4-3jw8-366w](https://github.com/advisories/GHSA-9qh4-3jw8-366w) | >=41.10.6 |
| electron | moderate | [GHSA-fw47-9c62-h3vw](https://github.com/advisories/GHSA-fw47-9c62-h3vw) | >=42.11.3 |
| @vitest/mocker | moderate | [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | >=4.1.12 |
| electron | moderate | [GHSA-2p8c-gr87-2676](https://github.com/advisories/GHSA-2p8c-gr87-2676) | >=42.11.3 |
| electron | moderate | [GHSA-x562-297c-g43g](https://github.com/advisories/GHSA-x562-297c-g43g) | >=42.11.9 |
| electron | low | [GHSA-98mx-cjp9-gchm](https://github.com/advisories/GHSA-98mx-cjp9-gchm) | >=42.11.1 |
| electron | low | [GHSA-3qxv-5xgr-q7w9](https://github.com/advisories/GHSA-3qxv-5xgr-q7w9) | >=42.11.6 |
| electron | low | [GHSA-h3v5-h239-pg29](https://github.com/advisories/GHSA-h3v5-h239-pg29) | >=42.11.6 |
| electron | moderate | [GHSA-997q-gvvc-jwmx](https://github.com/advisories/GHSA-997q-gvvc-jwmx) | >=42.11.3 |
| electron | high | [GHSA-jr5w-w6x2-84p9](https://github.com/advisories/GHSA-jr5w-w6x2-84p9) | >=42.11.16 |
| minimatch | moderate | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | >=11.0.1 |

extract-zip 公告未提供修复版本，涉及 Electron 安装链；需跟踪上游替换/修复，安装来源限制不能算完成修复。minimatch 来自 builder 依赖链；KaTeX 来自数学组件。不得直接用 overrides 跨 major 强制替换而跳过兼容验证。

发行前必须重新审计并处理或明确审查所有剩余公告，优先 Electron 和 critical/high；版本失维护或未说明的关键公告继续阻断“正式发行”标记。当前 CI 运行质量检查，不把已知失败的 audit 混称绿灯；可手工/独立安全作业运行 audit，修复后再设硬门槛。V02/V03/V05/V07 收口时须引用更新后的评估，不沿用本次快照当作安全批准。

## 5. 许可证与原组件来源

58 个直接依赖的声明许可证见下表；这是包元数据清单，未擅自为 Devly 自身选择开源许可证。最终发行需决定自身授权方式，并收集实际进入 bundle、原生模块与 Electron/Chromium 的第三方通知。打包工具保留 node_modules 内 LICENSE，不代表 renderer 被打包后的通知已经完整生成。

| 包 | 当前安装 | 用途 | 声明许可证 |
| --- | --- | --- | --- |
| @eslint/js | 9.39.5 | 开发依赖 | MIT |
| @monaco-editor/react | 4.7.0 | 运行依赖 | MIT |
| @playwright/test | 1.65.1 | 开发依赖 | Apache-2.0 |
| @radix-ui/react-avatar | 1.3.1 | 运行依赖 | MIT |
| @radix-ui/react-collapsible | 1.2.1 | 运行依赖 | MIT |
| @radix-ui/react-slot | 1.5.0 | 运行依赖 | MIT |
| @streamdown/cjk | 1.0.5 | 运行依赖 | Apache-2.0 |
| @streamdown/code | 2.0.1 | 运行依赖 | Apache-2.0 |
| @streamdown/math | 1.0.4 | 运行依赖 | Apache-2.0 |
| @streamdown/mermaid | 1.0.4 | 运行依赖 | Apache-2.0 |
| @tailwindcss/vite | 4.3.5 | 开发依赖 | MIT |
| @tanstack/react-virtual | 3.14.26 | 运行依赖 | MIT |
| @testing-library/dom | 10.4.2 | 开发依赖 | MIT |
| @testing-library/jest-dom | 6.9.1 | 开发依赖 | MIT |
| @testing-library/react | 16.3.3 | 开发依赖 | MIT |
| @types/better-sqlite3 | 7.6.13 | 开发依赖 | MIT |
| @types/node | 24.19.2 | 开发依赖 | MIT |
| @types/react | 19.3.0 | 开发依赖 | MIT |
| @types/react-dom | 19.3.0 | 开发依赖 | MIT |
| @vitejs/plugin-react | 5.2.0 | 开发依赖 | MIT |
| @xterm/addon-fit | 0.10.0 | 运行依赖 | MIT |
| @xterm/xterm | 5.5.0 | 运行依赖 | MIT |
| ai | 6.0.333 | 运行依赖 | Apache-2.0 |
| better-sqlite3 | 12.11.1 | 运行依赖 | MIT |
| class-variance-authority | 0.7.1 | 运行依赖 | Apache-2.0 |
| clsx | 2.1.1 | 运行依赖 | MIT |
| electron | 39.8.10 | 开发依赖 | MIT |
| electron-builder | 26.18.0 | 开发依赖 | MIT |
| electron-log | 5.4.4 | 运行依赖 | MIT |
| electron-vite | 4.0.1 | 开发依赖 | MIT |
| eslint | 9.39.5 | 开发依赖 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | 开发依赖 | MIT |
| eslint-plugin-react-refresh | 0.4.26 | 开发依赖 | MIT |
| globals | 16.5.0 | 开发依赖 | MIT |
| jsdom | 27.4.0 | 开发依赖 | MIT |
| lucide-react | 0.468.0 | 运行依赖 | ISC |
| monaco-editor | 0.52.2 | 运行依赖 | MIT |
| node-pty | 1.1.0 | 运行依赖 | MIT |
| prettier | 3.10.1 | 开发依赖 | MIT |
| radix-ui | 1.8.1 | 运行依赖 | MIT |
| react | 19.3.1 | 运行依赖 | MIT |
| react-dom | 19.3.1 | 运行依赖 | MIT |
| react-markdown | 10.1.0 | 运行依赖 | MIT |
| react-resizable-panels | 3.0.6 | 运行依赖 | MIT |
| rehype-sanitize | 6.0.0 | 运行依赖 | MIT |
| remark-gfm | 4.0.1 | 运行依赖 | MIT |
| shiki | 3.23.0 | 运行依赖 | MIT |
| sonner | 2.0.8 | 运行依赖 | MIT |
| streamdown | 2.8.0 | 运行依赖 | Apache-2.0 |
| tailwind-merge | 3.7.1 | 运行依赖 | MIT |
| tailwindcss | 4.3.5 | 开发依赖 | MIT |
| typescript | 5.9.3 | 开发依赖 | Apache-2.0 |
| typescript-eslint | 8.73.0 | 开发依赖 | MIT |
| use-stick-to-bottom | 1.1.6 | 运行依赖 | MIT |
| vite | 7.3.8 | 开发依赖 | MIT |
| vitest | 3.2.7 | 开发依赖 | MIT |
| zod | 4.6.7 | 运行依赖 | MIT |
| zustand | 5.1.0 | 运行依赖 | MIT |

本机全部安装包的许可证表达式统计：

| 元数据表达式 | 包数量 |
| --- | --- |
| MIT | 736 |
| Apache-2.0 | 44 |
| MIT-0 | 2 |
| BSD-2-Clause | 14 |
| ISC | 78 |
| BlueOak-1.0.0 | 12 |
| Python-2.0 | 1 |
| BSD-3-Clause | 19 |
| CC-BY-4.0 | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| (MIT OR WTFPL) | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| UNKNOWN | 1 |
| MPL-2.0 | 2 |
| CC0-1.0 | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| Unlicense | 1 |
| WTFPL OR ISC | 1 |
| WTFPL | 1 |
| 0BSD | 1 |
| (MIT OR CC0-1.0) | 1 |
| (WTFPL OR MIT) | 1 |

人工核对：khroma 2.1.0 的 package.json 没有 license 字段（清单因此保留 UNKNOWN），但安装包内 `license` 原文是 MIT，含 Fabio Spampinato / Andrew Maney 版权声明，不能直接判成“无许可”。lightningcss 的 MPL-2.0、caniuse-lite 的 CC-BY-4.0、argparse 的 Python-2.0、双许可证表达式及无独立 NOTICE 文件的包需在最终分发范围内分别处理；不将全部传递依赖笼统写成 MIT。

原组件核对：

- 来源为 [vercel/ai-elements 固定提交](https://github.com/vercel/ai-elements/tree/ca8be600bfd01b3131f9bf6134b51602a71f4374)，不是当前迁移后的其他 AI pattern。
- 五个 AI 文件来自 packages/elements/src，八个基础 UI 来自同仓 packages/shadcn-ui/components/ui；仓库 [LICENSE](https://github.com/vercel/ai-elements/blob/ca8be600bfd01b3131f9bf6134b51602a71f4374/LICENSE) 为 Apache-2.0，原文已保留。
- 唯一适配为两个 monorepo 路径别名改成本地别名，以及基础 UI 的项目 Prettier 格式化；14 份文件（含许可证）已与上游逐字验证适配结果，并记录上游及本地 SHA-256。
- 离线校验失败时须审查本地变更/来源记录，不能仅重写哈希绕过。更新组件时重新比较固定提交、许可证、API/peer，再运行 check 和桌面检查。

## 6. 收口状态

本次 V01 评估与 jest-dom 修正完成；未全面升级依赖，也未解决审计中的全部公告。正式发行仍被维护版本、安全公告、完整分发通知、双平台业务验收和签名/安装包等条件阻断。B03 随后完成，阶段 1 验收见 LOG-012；阶段 2 随后验收完成，当前下一项为阶段 3 的 P01（待开始），依赖维护与安全发行门槛仍保持未解除。

后续 UI 统一补充（LOG-024）：从同一个固定提交补齐 Input、Textarea、Label，当前离线来源清单为 17 份；未改动原有 14 份原组件/通知，未新增 npm 依赖。此补充不解除本文列出的维护/安全/发行风险。

LOG-033/034 补充：同一固定来源增加 ScrollArea、ModelSelector、Dialog、Command，清单现为 21 份。新增 cmdk 精确锁定 1.1.1，安装包声明 MIT，React/react-dom peer 为 ^18 或 ^19（含所列 RC）；本机 React 19.3.1 类型/构建/真实 Electron 搜索和键盘检查通过。锁文件只新增 cmdk 及其对既有 Radix/React 的引用，没有升级现有依赖；安装使用 ignore-scripts，未运行无关生命周期。此为当前组合的兼容性证据，不声称是最新维护版、完成全面漏洞审计或解除上述发行门槛。

LOG-035 补充：静态收集 @lobehub/icons-static-svg 1.104.0 的 357 个品牌 SVG，没有新增 npm 依赖或升级锁文件。源 tarball SHA-512、每份 SVG SHA-256、固定源码提交及 MIT 原文均保存；打包分发包含原版权通知。不需要 @lobehub/ui/新的 React peer，运行时离线加载。品牌商标权与代码许可证分别保留；不据此声称已完成全部分发许可审查。详见 [来源与更新规则](./provider-icons.md)。
