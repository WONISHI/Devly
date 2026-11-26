# Devly 文档

目标：构建具备 Codex 类似功能、可直接接入第三方模型 API 的桌面 AI 编程工具。主路线为 Devly 自研 Agent + Provider 适配层 + 本地工具，Codex App Server 仅为可选后续适配。

## 当前执行入口

- [分阶段工作计划](./work-plan.md)：先看这里。当前阶段、唯一下一步、逐阶段步骤、任务 ID、前置条件和阶段验收。
- [工作日志](./work-log.md)：每项实际完成后追加变更、验证、未覆盖范围和下一步。
- [阶段与交付节点](./development-plan.md)：与工作计划同一阶段顺序，说明聊天版、编程 MVP、扩展版与两平台发行的界限。
- [仓库工作约定](../AGENTS.md)：开工阅读顺序及后续完成工作的记录要求。

## 设计与搭建资料

- [编辑器与实际 Diff](./editor-and-diff.md)：阶段 7 的按需文件树、本地 Monaco/Worker、有版本保存、未保存保护、真实 Git Diff 与 A09 验收入口。

- [第三方 Provider API](./provider-api.md)：P01–P06 的实现、数据流、协议规则、能力表、错误/取消和真实验收操作。

- [UI 与 AI 组件使用](./ui-components.md)：基础控件统一、原 AI Elements 的分工与来源约束。

- [本地数据、项目与设置](./local-data.md)：阶段 2 的 Worker、迁移、凭据引用、分页、日志与验收边界。

- [Provider / Agent 产品入口](./provider-entry.md)：B03 的模型/设置入口、精简任务首页、开发者折叠项与无 Codex 验证。
- [桌面请求、事件与错误契约](./ipc-contracts.md)：B02 的归属校验、错误 DTO 和订阅清理。
- [自动检查与平台构建计划](./quality-checks.md)：B04 的统一 check、CI 矩阵及验证边界。
- [依赖与许可证评估](./dependency-review.md)：V01 的维护风险、原组件来源、升级前后检查和发行阻断。
- [Renderer feature 边界](./renderer-structure.md)：B01 拆分后的模块职责、网关与验证范围。
- [当前详细架构](./architecture.md)：第三方 API、自研 Agent、工具权限、数据与恢复的六张 Mermaid 图。
- [技术选型与实现方式](./tech-stack.md)：已确认组件、安装状态和待增加的适配能力。
- [工程搭建与验证记录](./setup.md)：已有工程的工具版本、历史验证及能力边界。
- [品牌资源](../resources/branding/README.md)：原标志及当前 v5 圆角应用图标。

## 历史方案

以下是历史快照，不作为当前执行依据：

- [原模块分组工作表](./archive/work-plan-by-module.md)。
- [Codex App Server 优先架构](./archive/codex-app-server-architecture.md)。
- [旧阶段计划](./archive/codex-app-server-development-plan.md)。
- [旧技术选型](./archive/codex-app-server-tech-stack.md)。

架构图使用 Mermaid 编写；阅读器需要支持 Mermaid 渲染。计划和文档不代表相应功能已经实现。

阶段 6 的 macOS 项目写入、命令、逐次审批、停止、计划和主机执行边界见 [执行与审批](./execution-foundation.md)。默认跳过的原生检查须另行运行，未签名 .app 不等于正式发行包。
