# UI 与 AI 组件使用约定

更新：2026-11-21。此前基础组件和原生控件存在混用，本次统一当前业务界面的交互控件，详见 LOG-024。

## 两层组件

| 范围         | 当前使用                                                                           | 位置                             |
| ------------ | ---------------------------------------------------------------------------------- | -------------------------------- |
| 基础控件     | shadcn/ui + Radix：Button、Input、Textarea、Label、Select、Collapsible、ScrollArea | components/ui/                   |
| 通用表单组合 | SelectField 组合现有 Select/Trigger/Content/Item，不重新实现下拉行为               | components/forms/SelectField.tsx |
| AI 交互      | 原版 AI Elements：ModelSelector、Conversation、Message、Tool、Commit、Code Block   | components/ai-elements/          |
| 布局         | 正常 React/HTML/CSS 的侧栏、页面框架、可拖动标题栏                                 | app/、features/、styles.css      |

shadcn/ui 采用源码放进项目的方式，所以 components/ui 中可以看到底层 HTML 或 Radix primitive；判断是否复用要看业务页的组件导入和调用，不能以最终 DOM 是否出现 button/input 判断。当前业务交互控件已经统一，正常 form/div/section 等结构元素继续用于布局和原生表单语义。

原版 AI Elements ModelSelector 已用于首页：搜索/按供应商分组/键盘选择、应用或项目默认值持久化。阶段 4 已复用原 PromptInput、Conversation 和 Message 接入普通文本聊天；Tool/Commit/Code Block 已用于实际工具记录、Git 历史与内容展示，组件预览保留明确标注的示例，不把选择模型称为已经接通聊天。没有迁移到新版 Base UI 或其他 AI patterns。

## 当前映射

- 设置编辑：Input、Label、Radix Select；项目/应用范围选择复用 SelectField；数值范围、必填和服务器校验保留。
- 项目/会话侧栏：Button；会话行内重命名用 Input；保留紧凑布局和现有持久化动作。
- 工作台：原 PromptInput/Submit + ModelSelector、Conversation/Message；空输入/缺项目或模型不能发送，生成时锁定输入并支持停止；附件入口明确禁用。
- 开发者选项：Collapsible + CollapsibleTrigger/Content，默认折叠，使用 aria-expanded/data-state 表达状态。
- 错误重试：Button，不再直接书写原生交互控件。
- 品牌识别：ProviderBrandIcon 使用 357 个固定来源的本地 SVG，设置列表及原 ModelSelector 的组合层复用；详见 [供应商图标](./provider-icons.md)，没有改动 AI Elements 原文件。

未配置供应商使用明确的非空 Select 值 none 映射到数据库 null，避免 Radix SelectItem 空值限制；UI 中的选择范围/主题状态仍映射到原来的严格契约。

## 来源与维护

新增 Input、Textarea、Label 来自与现有组件相同的 vercel/ai-elements 固定提交 ca8be600bfd01b3131f9bf6134b51602a71f4374 中 packages/shadcn-ui/components/ui，沿用 Apache-2.0 原通知，只改本地路径别名并使用既有 Prettier 格式。原有五个 AI 组件没有修改。

当前 vendor 清单为 26 份：7 个 AI、18 个配套 UI、1 个 LICENSE；上游/本地 SHA-256 见 resources/vendor/ai-elements.json。ModelSelector 与配套 Dialog/Command、ScrollArea 均来自同一固定提交，只改路径别名和既有格式化。Command 新增 cmdk 1.1.1（MIT，支持 React 18/19）；其余沿用现有 radix-ui。pnpm verify:vendor 离线验证。SelectField/WorkspaceModelPicker 是本项目组合组件，不冒称原仓文件。

AGENTS.md 和 ESLint 已约束 App/features 不直接书写 button/input/textarea/select/option/label/details/summary；组件实现层和源自上游的组件不受此业务层限制。新增控件先检查 components/ui，补组件时同步来源。

## 页面滚动（LOG-033）

AppShell 的标题栏和侧栏固定，主内容区统一由原版 ScrollArea 管理；设置、工作台、组件预览不再各自创建页面级原生滚动。html/body/root 限制为窗口尺寸，桌面框架建立定位边界，防止 Radix 隐藏的表单 Select 绝对定位到根页面后撑开外层滚动范围。ScrollArea 内容测量层采用限定宽度的弹性布局，随长表单展开自然增高，保留滚动条尺寸更新；页面切换与现有内容生命周期保持一致。

桌面检查包含紧凑窗口长表单、实际滚轮、根文档尺寸、唯一主滚动条、标题/侧栏固定、下拉开关后无外层溢出、底部内容可达及截图。消息预览、代码块和侧栏各自的局部滚动不与主窗口滚动混为一项。

## 验证边界

运行类型/Lint/构建与原组件哈希检查；已有桌面脚本改为操作真实 combobox/option 和 Collapsible，验证选择、折叠、保存、重命名、持久化、Escape 关闭与焦点恢复，不通过 DOM 改值绕过交互。

实际命令/结果见 LOG-024；Windows 和远端 CI 不因本机通过自动获得通过状态。阶段 4 普通聊天另见 LOG-036–LOG-039；Agent 工具循环没有因组件引入自动实现。

阶段 4 原 Prompt Input 及 DropdownMenu/HoverCard/InputGroup/Spinner 来自同一固定提交，只改既定别名与 UI 格式；新增 nanoid 直接依赖锁定既有 3.3.20（MIT），未升级依赖树。ChatHistory 使用 Conversation 的底部跟随上下文配合 Radix ScrollArea/同源 ScrollBar，未改原 Conversation/Message。Apache-2.0 通知随应用打包。

## 设置分组（LOG-040 → LOG-044）

ProviderSettingsPage 使用现有 Button 切换模型供应商、外观、默认模型、权限与限额、开发者五个独立内容页；右侧同一时间仅有当前组可见，分类切换把 AppShell 原 ScrollArea 复位到顶部，不增加页面级滚动。供应商和开发者面板隐藏保留状态，偏好编辑器保留字段草稿并只渲染当前组的控件；设置范围与保存/导出仅出现在偏好组。SettingsGroup 仍为纯布局组件，不访问平台 API。

外观只保存 theme；默认模型只保存 defaultProviderId/defaultModel；权限与限额只保存 projectPermission/maxTokens/maxCost/agentLimits。其他分类未保存输入不随本组保存提交，也不会触发隐藏字段的浏览器表单验证；组间草稿保留，应用/项目范围切换按独立作用域重新读取。导出仍导出本范围已保存的全部偏好，不包含秘密或未保存草稿。保存状态/错误关联发起的组，异步保存完成后只清理匹配提交值的草稿，不覆盖新编辑。

开发者诊断沿用原 Collapsible，控件复用现有 shadcn/ui，没有新增依赖或修改上游 AI Elements。桌面检查覆盖五组唯一可见、供应商/模型草稿往返、隐藏非法值与按组保存、持久化、主题、导出、960×680 边界及单层主滚动。LOG-040 的滚动锚点方案已由本次用户指令替换，历史记录保留。

阶段 5 的 AgentTrace 已将原 Message/Tool 接入真实调用状态、ID、JSON 参数/结果和脱敏 blob 日志；上游组件文件未修改。只读模式、可选文件及 Agent 限额仍复用 shadcn/Radix 基础控件。项目/最近列表及日志使用同源 ScrollArea，独立原生新建项目与新聊天见 LOG-042/LOG-043。

阶段 8 新增原 Terminal/Test Results/Stack Trace，Commit 用于真实 Git 历史；交互 Shell 由 xterm 提供。新增来源仍为同一固定提交，当前共 35 份文件离线校验。提交审查使用现有 Dialog/ScrollArea，业务控件继续复用 components/ui，分隔条使用既有 resizable 组件与中性色状态。详情见 [Git 与终端工作台](./git-and-terminal.md)。

## 阶段 9 补充

阶段 9 已接入独立 Responses/Anthropic 协议、持久事件保护、核对后新回合继续与数据设置入口。项目继续始终只读复核，不自动重放旧命令/审批；新协议真实供应商待联调。备份、配置、诊断、虚拟化和错误处理的当前规则见 [恢复与稳定性](./stability-and-recovery.md) 及 [供应商矩阵](./provider-matrix.md)。

## 阶段 10 组件复用

项目上下文、任务与隔离、MCP 工具、Skills 为独立设置组，右侧只显示所选组。复用既有 shadcn/Radix Button、Input、Textarea、Label、SelectField、Dialog、ScrollArea；原 AI Elements Tool/Confirmation/Plan/Task 展示真实 MCP 和父子任务事件。没有修改原 35 份来源文件、引入另一套 AI patterns 或更改品牌 v5。查看 Skill、最小窗口 Diff 审查、父子跳转与包内验收入口见 [扩展说明](./task-extensions.md)。

## 阶段 11 扩展

[附件、网页与本地自动化](./web-and-automation.md) 记录当前实现和边界：受限文本/图片附件、独立搜索凭据及精确审批、隔离静态预览、每回合浏览器/真实截图、默认停用的本地只读定时任务。SQLite 追加至 v15；模型 Key 不进入 Renderer。网页容器不等于 OS 沙箱，搜索真实端点按用户确认另行联调，本轮视觉/模型响应使用本地协议夹具；最终验证状态见工作计划与日志。
