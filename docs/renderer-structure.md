# Renderer feature 边界（B01）

本文记录 B01 建立的展示与桌面访问边界。后续 B02 补充通信契约；B03 增加 Provider 设置入口，阶段 2 增加会话元数据持久化，阶段 3 增加 ProviderManager/Editor 和 useProviderProbe。界面使用 shared 类型与 feature hooks，网络/密钥仍在 Main；真实供应商待验收，任务聊天与 Agent 尚未实现。详见 [入口说明](./provider-entry.md) 与 [Provider API](./provider-api.md)。

## 目录与职责


| 位置                                                 | 职责                                                   | 依赖边界                                   |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| App.tsx                                              | 读取应用状态，装配 shell 与当前页面                    | 不直接调 preload，不包含具体展示内容       |
| app/AppShell.tsx                                     | 页面框架与 slot 装配；不显示工程状态栏                 | 接收 ReactNode，不访问系统能力             |
| app/AppHeader.tsx                                    | 当前项目与页签标题                                     | 只接收 project/tab                         |
| features/workspace/components/                       | 项目侧栏、任务空状态、禁用输入占位与项目/模型选择按钮  | 只接收数据和回调                           |
| features/workspace/hooks/use-open-project.ts         | 目录选择、取消、错误提示与当前项目更新                 | 调 platform 网关，使用 Zustand 状态        |
| features/environment/components/EnvironmentPanel.tsx | 环境值、加载、错误和重新检查按钮                       | 只展示 hook 返回值并调用回调               |
| features/environment/hooks/use-environment.ts        | 初次检查、刷新、失败、过期响应与卸载清理               | 调 platform 网关；只接收当前有效请求的结果 |
| features/provider-settings/                          | 精简供应商状态、返回操作及开发者折叠区；暂无表单或保存 | 纯展示，通过回调导航，不收集密钥           |
| features/component-preview/                          | 原 AI Elements 的演示页面与关闭操作                    | 保留原组件和明确的演示说明                 |
| features/*/index.ts                                  | 各 feature 的公开入口                                  | 其他模块通过入口使用其组件与 hooks         |
| platform/desktop.ts                                  | window.devly 的薄封装及桌面能力缺失错误                | 不新增 IPC，不改变主进程权限               |
| store.ts                                             | 当前项目与页面状态                                     | 内存存储，未增加持久化                     |

当前环境 hook 在 App 装配层调用，因此切换预览或供应商设置不会丢弃已读取环境状态。请求版本号避免较早的刷新结果覆盖较新请求，也避免卸载后处理过期结果。

## 静态边界

ESLint 禁止 Renderer 导入 Node 或 Electron。App、shell 和展示组件进一步禁止直接导入 platform 或读取 window.devly；系统能力通过 feature hook 的数据和回调进入展示组件。

这只是 B01 的 feature 边界，不代替 B02 的统一事件、错误格式、请求关联及可清理订阅契约。

## 验证范围

- TypeScript、ESLint、格式、现有 1 项契约测试和生产构建通过。
- 桌面 smoke 验证真实环境检测与刷新、目录选择成功、取消保持空状态、目录选择错误提示、原组件预览与关闭、返回工作台后保留当前项目、发送按钮仍禁用。
- 目录测试只替换原生对话框返回或错误，后续真实 IPC 与路径检查仍执行；不把该检查称为所有原生系统对话框都经过人工验证。
- 没有新增模型调用、文件写入功能、数据库、Git 操作、终端业务或 Windows 验收。

通信补充：B02 将桥接返回值改为可复制的 OperationResult DTO；platform/desktop.ts 统一解包并在 Renderer 重建 ContractError，业务 hook 保持返回数据/异常的调用方式。订阅清理、页面归属与错误码见 [IPC 契约](./ipc-contracts.md)。

## 用户要求的界面清理（LOG-013）

首页只展示任务和项目/模型选择；侧栏只保留新任务、项目、设置。环境面板与原组件预览移到设置页默认折叠的开发者选项，不再占据产品首页。ComponentPreview 关闭后回设置页，设置页返回工作台。App 的环境 hook 仍统一管理生命周期。品牌资产、原 AI Elements、IPC 与业务功能边界保持既有约定。

阶段 2：store.ts 负责 bootstrap 与项目/会话分页状态及过期响应保护；侧栏通过回调进行持久化操作。SettingsEditor 展示应用/项目范围设置，feature hooks 调 desktop.data 网关。主题监听有清理。原始 Key 不经过 Renderer，凭据入口仅发送 providerId 到 Main 原生输入。数据与失败边界见 [本地数据说明](./local-data.md)。

阶段 2：store.ts 负责 bootstrap 与项目/会话分页状态及过期响应保护；侧栏通过回调进行持久化操作。SettingsEditor 展示应用/项目范围设置，feature hooks 调 desktop.data 网关。主题监听有清理。原始 Key 不经过 Renderer，凭据入口仅发送 providerId 到 Main 原生输入。数据与失败边界见 [本地数据说明](./local-data.md)。

标题栏修正（LOG-022）：macOS 使用 Electron hidden 原生标题栏，保留红黄绿按钮；AppShell 的 32px 可拖动行分别使用侧栏和主区的现有主题变量，随侧栏响应宽度与深浅主题同步。平台标识由 preload 只读暴露，经 platform 网关/环境 hook 传入展示层，不依赖异步环境检查后才决定布局。其他系统保留原生标题栏。实现依据 [Electron 自定义标题栏文档](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)。

交互控件统一（LOG-024）：业务页复用 Button/Input/Textarea/Label/Radix Select/Collapsible，SelectField 仅组合已有基础组件；ESLint 禁止业务层直接重写原生交互控件。具体映射和校验见 [UI 组件说明](./ui-components.md)。
