# Renderer feature 边界（B01）

本文记录 B01 建立的展示与桌面访问边界及后续扩展。B02 通信契约、B03 Provider 入口、阶段 2–4 数据/设置/普通聊天、阶段 5–6 Agent/审批，以及阶段 7 本地编辑器均已接入。界面使用 shared 类型和 feature 模块，网络/密钥、实际文件与执行仍在 Main。证据以工作计划为准，见 [入口说明](./provider-entry.md)、[Provider API](./provider-api.md)、[编辑器与 Diff](./editor-and-diff.md)。

## 目录与职责

| 位置                                                 | 职责                                              | 依赖边界                                      |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| App.tsx                                              | 读取应用状态，装配 shell 与当前页面               | 不直接调 preload，不包含具体展示内容          |
| app/AppShell.tsx                                     | 页面框架与 slot 装配；不显示工程状态栏            | 接收 ReactNode，不访问系统能力                |
| app/AppHeader.tsx                                    | 当前项目与页签标题、项目文件/更改入口和未保存计数 | project/tab 与编辑器 UI store，不调用系统     |
| features/editor/                                     | 文件树/监听、项目隔离缓冲区、本地 Monaco 与 Diff  | 通过 desktop 网关，系统读写/凭据不在 Renderer |
| features/workspace/components/                       | 项目侧栏、任务/聊天布局和项目/模型选择组合        | 只接收数据和回调                              |
| features/workspace/hooks/use-open-project.ts         | 目录选择、取消、错误提示与当前项目更新            | 调 platform 网关，使用 Zustand 状态           |
| features/environment/components/EnvironmentPanel.tsx | 环境值、加载、错误和重新检查按钮                  | 只展示 hook 返回值并调用回调                  |
| features/environment/hooks/use-environment.ts        | 初次检查、刷新、失败、过期响应与卸载清理          | 调 platform 网关；只接收当前有效请求的结果    |
| features/provider-settings/                          | 供应商元数据编辑、模型检查、受保护密钥操作与设置  | 纯展示，通过回调导航，不收集密钥              |
| features/component-preview/                          | 原 AI Elements 的演示页面与关闭操作               | 保留原组件和明确的演示说明                    |
| features/*/index.ts                                  | 各 feature 的公开入口                             | 其他模块通过入口使用其组件与 hooks            |
| platform/desktop.ts                                  | window.devly 的薄封装及桌面能力缺失错误           | 不新增 IPC，不改变主进程权限                  |
| store.ts                                             | 项目/会话分页、默认设置与 Provider DTO 状态       | 经 desktop 网关读写持久化数据                 |

当前环境 hook 在 App 装配层调用，因此切换预览或供应商设置不会丢弃已读取环境状态。请求版本号避免较早的刷新结果覆盖较新请求，也避免卸载后处理过期结果。

## 静态边界

ESLint 禁止 Renderer 导入 Node 或 Electron。App、shell 和展示组件进一步禁止直接导入 platform 或读取 window.devly；系统能力通过 feature hook 的数据和回调进入展示组件。

这只是 B01 的 feature 边界，不代替 B02 的统一事件、错误格式、请求关联及可清理订阅契约。

## B01 首次验证范围

- TypeScript、ESLint、格式、现有 1 项契约测试和生产构建通过。
- 桌面 smoke 验证真实环境检测与刷新、目录选择成功、取消保持空状态、目录选择错误提示、原组件预览与关闭、返回工作台后保留当前项目、发送按钮仍禁用。
- 目录测试只替换原生对话框返回或错误，后续真实 IPC 与路径检查仍执行；不把该检查称为所有原生系统对话框都经过人工验证。
- 没有新增模型调用、文件写入功能、数据库、Git 操作、终端业务或 Windows 验收。

通信补充：B02 将桥接返回值改为可复制的 OperationResult DTO；platform/desktop.ts 统一解包并在 Renderer 重建 ContractError，业务 hook 保持返回数据/异常的调用方式。订阅清理、页面归属与错误码见 [IPC 契约](./ipc-contracts.md)。

## 用户要求的界面清理（LOG-013）

首页只展示任务和项目/模型选择；侧栏只保留新任务、项目、设置。环境面板与原组件预览移到设置页默认折叠的开发者选项，不再占据产品首页。ComponentPreview 关闭后回设置页，设置页返回工作台。App 的环境 hook 仍统一管理生命周期。品牌资产、原 AI Elements、IPC 与业务功能边界保持既有约定。

阶段 2：store.ts 负责 bootstrap 与项目/会话分页状态及过期响应保护；侧栏通过回调进行持久化操作。SettingsEditor 展示应用/项目范围设置，feature hooks 调 desktop.data 网关。主题监听有清理。原始 Key 不经过 Renderer，凭据入口仅发送 providerId 到 Main 原生输入。数据与失败边界见 [本地数据说明](./local-data.md)。

标题栏修正（LOG-022）：macOS 使用 Electron hidden 原生标题栏，保留红黄绿按钮；AppShell 的 32px 可拖动行分别使用侧栏和主区的现有主题变量，随侧栏响应宽度与深浅主题同步。平台标识由 preload 只读暴露，经 platform 网关/环境 hook 传入展示层，不依赖异步环境检查后才决定布局。其他系统保留原生标题栏。实现依据 [Electron 自定义标题栏文档](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)。

交互控件统一（LOG-024）：业务页复用 Button/Input/Textarea/Label/Radix Select/Collapsible，SelectField 仅组合已有基础组件；ESLint 禁止业务层直接重写原生交互控件。具体映射和校验见 [UI 组件说明](./ui-components.md)。

阶段 4：features/chat/ChatWorkspace 组合原 PromptInput、ModelSelector 和切换历史确认；use-chat 管理可见会话快照/分页、迟到响应保护和卸载清理，ChatHistory 只展示数据并组合原 Conversation/Message 与 Radix ScrollArea。真正的网络、解密和生成生命周期位于 Main 的 chat/，不会因 React 页面卸载转移会话归属。见 [聊天说明](./chat.md)。

## 阶段 8 工作台边界

features/git/GitPanel 组合原 Commit 与已有基础控件，不直接访问文件系统；所有 Git 写入通过 Main 严格契约并显示审查/失败结果。features/terminal 管理 xterm 挂载、尺寸、输入队列和输出游标，PTY 实际生命周期在 Main；features/chat/CommandResult 只投影真实 Agent 命令日志、测试报告与堆栈。features/desktop 组合可调整面板、键盘焦点与版本化布局持久化，AppShell 继续管理根窗口和页面 ScrollArea。Monaco 与 xterm 使用应用主题；文件草稿不因保存布局而变成可跨重启恢复。详见 [Git 与终端](./git-and-terminal.md)。

## 阶段 9 补充

阶段 9 已接入独立 Responses/Anthropic 协议、持久事件保护、核对后新回合继续与数据设置入口。项目继续始终只读复核，不自动重放旧命令/审批；新协议真实供应商待联调。备份、配置、诊断、虚拟化和错误处理的当前规则见 [恢复与稳定性](./stability-and-recovery.md) 及 [供应商矩阵](./provider-matrix.md)。

## 阶段 10 feature 边界

features/extensions 负责四个项目设置组：ProjectContextPanel/use-project-context、TaskPanel/use-tasks、McpPanel/use-mcp、SkillsPanel/use-skills。继续通过 platform/desktop 的受限数据网关；MCP 客户端、Git、文件、Schema Worker 和秘密都留在 Main。表单复用 Button/Input/Textarea/Label/SelectField，审查和 Skill 内容使用 Dialog + 局部 ScrollArea，页面滚动仍由 AppShell 负责。

ChatWorkspace 只维护显式委派开关，AgentTrace 将真实 family/budget/origin 投影为父子跳转、预算和原 Tool/Confirmation；不是前端生成子任务或授权。项目切换的组件归属、任务打开与完整流程见 [多任务与扩展](./task-extensions.md)。

## 阶段 11 扩展

[附件、网页与本地自动化](./web-and-automation.md) 记录当前实现和边界：受限文本/图片附件、独立搜索凭据及精确审批、隔离静态预览、每回合浏览器/真实截图、默认停用的本地只读定时任务。SQLite 追加至 v15；模型 Key 不进入 Renderer。网页容器不等于 OS 沙箱，搜索真实端点按用户确认另行联调，本轮视觉/模型响应使用本地协议夹具；最终验证状态见工作计划与日志。
