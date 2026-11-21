# Renderer feature 边界（B01）

本轮只拆分现有界面与桌面访问职责，不实现 Provider、模型请求、会话持久化或 Agent 业务。原组件、文案、品牌、布局和演示数据保持原有行为；用户指定先完成 B01，B03 尚未实施。

## 目录与职责

| 位置 | 职责 | 依赖边界 |
| --- | --- | --- |
| App.tsx | 读取应用状态，装配 shell 与当前页面 | 不直接调 preload，不包含具体展示内容 |
| app/AppShell.tsx | 页面框架、状态栏、slot 装配 | 接收 ReactNode，不访问系统能力 |
| app/AppHeader.tsx | 当前项目与页签标题 | 只接收 project/tab |
| features/workspace/components/ | 项目侧栏、工作台、输入占位与导航按钮 | 只接收数据和回调 |
| features/workspace/hooks/use-open-project.ts | 目录选择、取消、错误提示与当前项目更新 | 调 platform 网关，使用 Zustand 状态 |
| features/environment/components/EnvironmentPanel.tsx | 环境值、加载、错误和重新检查按钮 | 只展示 hook 返回值并调用回调 |
| features/environment/hooks/use-environment.ts | 初次检查、刷新、失败、过期响应与卸载清理 | 调 platform 网关；只接收当前有效请求的结果 |
| features/component-preview/ | 原 AI Elements 的演示页面与关闭操作 | 保留原组件和明确的演示说明 |
| features/*/index.ts | 各 feature 的公开入口 | 其他模块通过入口使用其组件与 hooks |
| platform/desktop.ts | window.devly 的薄封装及桌面能力缺失错误 | 不新增 IPC，不改变主进程权限 |
| store.ts | 当前项目与页面状态 | 内存存储，未增加持久化 |

当前环境 hook 在 App 装配层调用，因此切换预览不会丢弃已读取环境状态。请求版本号避免较早的刷新结果覆盖较新请求，也避免卸载后处理过期结果。

## 静态边界

ESLint 禁止 Renderer 导入 Node 或 Electron。App、shell 和展示组件进一步禁止直接导入 platform 或读取 window.devly；系统能力通过 feature hook 的数据和回调进入展示组件。

这只是 B01 的 feature 边界，不代替 B02 的统一事件、错误格式、请求关联及可清理订阅契约。

## 验证范围

- TypeScript、ESLint、格式、现有 1 项契约测试和生产构建通过。
- 桌面 smoke 验证真实环境检测与刷新、目录选择成功、取消保持空状态、目录选择错误提示、原组件预览与关闭、返回工作台后保留当前项目、发送按钮仍禁用。
- 目录测试只替换原生对话框返回或错误，后续真实 IPC 与路径检查仍执行；不把该检查称为所有原生系统对话框都经过人工验证。
- 没有新增模型调用、文件写入功能、数据库、Git 操作、终端业务或 Windows 验收。
