# UI 与 AI 组件使用约定

更新：2026-11-21。此前基础组件和原生控件存在混用，本次统一当前业务界面的交互控件，详见 LOG-024。

## 两层组件

| 范围 | 当前使用 | 位置 |
| --- | --- | --- |
| 基础控件 | shadcn/ui + Radix：Button、Input、Textarea、Label、Select、Collapsible、ScrollArea | components/ui/ |
| 通用表单组合 | SelectField 组合现有 Select/Trigger/Content/Item，不重新实现下拉行为 | components/forms/SelectField.tsx |
| AI 交互 | 原版 AI Elements：ModelSelector、Conversation、Message、Tool、Commit、Code Block | components/ai-elements/ |
| 布局 | 正常 React/HTML/CSS 的侧栏、页面框架、可拖动标题栏 | app/、features/、styles.css |

shadcn/ui 采用源码放进项目的方式，所以 components/ui 中可以看到底层 HTML 或 Radix primitive；判断是否复用要看业务页的组件导入和调用，不能以最终 DOM 是否出现 button/input 判断。当前业务交互控件已经统一，正常 form/div/section 等结构元素继续用于布局和原生表单语义。

原版 AI Elements ModelSelector 已用于首页：搜索/按供应商分组/键盘选择、应用或项目默认值持久化。其余 AI 组件主要在开发者预览中；真实模型消息、Prompt Input、工具执行等 UI 随对应业务阶段引入，不把选择模型称为已经接通聊天。没有迁移到新版 Base UI 或其他 AI patterns。

## 当前映射

- 设置编辑：Input、Label、Radix Select；项目/应用范围选择复用 SelectField；数值范围、必填和服务器校验保留。
- 项目/会话侧栏：Button；会话行内重命名用 Input；保留紧凑布局和现有持久化动作。
- 工作台：Button + Textarea；输入/发送仍按真实能力禁用。
- 开发者选项：Collapsible + CollapsibleTrigger/Content，默认折叠，使用 aria-expanded/data-state 表达状态。
- 错误重试：Button，不再直接书写原生交互控件。
- 品牌识别：ProviderBrandIcon 使用 357 个固定来源的本地 SVG，设置列表及原 ModelSelector 的组合层复用；详见 [供应商图标](./provider-icons.md)，没有改动 AI Elements 原文件。

未配置供应商使用明确的非空 Select 值 none 映射到数据库 null，避免 Radix SelectItem 空值限制；UI 中的选择范围/主题状态仍映射到原来的严格契约。

## 来源与维护

新增 Input、Textarea、Label 来自与现有组件相同的 vercel/ai-elements 固定提交 ca8be600bfd01b3131f9bf6134b51602a71f4374 中 packages/shadcn-ui/components/ui，沿用 Apache-2.0 原通知，只改本地路径别名并使用既有 Prettier 格式。原有五个 AI 组件没有修改。

当前 vendor 清单为 21 份：6 个 AI、14 个配套 UI、1 个 LICENSE；上游/本地 SHA-256 见 resources/vendor/ai-elements.json。ModelSelector 与配套 Dialog/Command、ScrollArea 均来自同一固定提交，只改路径别名和既有格式化。Command 新增 cmdk 1.1.1（MIT，支持 React 18/19）；其余沿用现有 radix-ui。pnpm verify:vendor 离线验证。SelectField/WorkspaceModelPicker 是本项目组合组件，不冒称原仓文件。

AGENTS.md 和 ESLint 已约束 App/features 不直接书写 button/input/textarea/select/option/label/details/summary；组件实现层和源自上游的组件不受此业务层限制。新增控件先检查 components/ui，补组件时同步来源。

## 页面滚动（LOG-033）

AppShell 的标题栏和侧栏固定，主内容区统一由原版 ScrollArea 管理；设置、工作台、组件预览不再各自创建页面级原生滚动。html/body/root 限制为窗口尺寸，桌面框架建立定位边界，防止 Radix 隐藏的表单 Select 绝对定位到根页面后撑开外层滚动范围。ScrollArea 内容测量层采用限定宽度的弹性布局，随长表单展开自然增高，保留滚动条尺寸更新；页面切换与现有内容生命周期保持一致。

桌面检查包含紧凑窗口长表单、实际滚轮、根文档尺寸、唯一主滚动条、标题/侧栏固定、下拉开关后无外层溢出、底部内容可达及截图。消息预览、代码块和侧栏各自的局部滚动不与主窗口滚动混为一项。

## 验证边界

运行类型/Lint/构建与原组件哈希检查；已有桌面脚本改为操作真实 combobox/option 和 Collapsible，验证选择、折叠、保存、重命名、持久化、Escape 关闭与焦点恢复，不通过 DOM 改值绕过交互。

实际命令/结果见 LOG-024；Windows 和远端 CI 不因本机通过自动获得通过状态。本次没有实现阶段 3/P01 或其他新的 AI 业务。
