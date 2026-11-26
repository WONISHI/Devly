# Devly 当前架构：第三方 API 与本地 Agent

本架构按用户最新目标设计：做一个具备 Codex 类似功能、可直接接第三方 API 的桌面 AI 编程工具。当前已实现本地数据、会话/消息持久化、设置、Chat Completions、普通聊天与只读 Agent；阶段 6 接入 macOS 隔离写入、命令与逐次审批，阶段 7 接入文件树、本地 Monaco/Worker、版本保存与实际 Diff，并完成指定真实模型的编程样例。交互终端、跨重启继续仍为后续目标。实际状态以 [工作总表](./work-plan.md) 为准，已落地的 Provider 数据流见 [Provider API](./provider-api.md)。

旧的 Codex App Server 优先方案保存在 [历史架构](./archive/codex-app-server-architecture.md)，不再作为主路线。它的初始化握手验证可保留，但不等于自研 Agent 已经实现。

## 1. 技术和责任边界

- Electron + React + TypeScript，采用用户指定的原 AI Elements 及配套 shadcn/ui、Tailwind CSS、Lucide、Zustand。
- Devly 自己管理会话、上下文、模型/工具循环、审批、取消、恢复、预算与本地执行。
- Provider 适配器负责第三方 API 的请求、流、工具格式、错误和用量映射。先实现 Chat Completions 兼容协议，再做 Responses 与 Anthropic 原生适配。
- 供应商地址、Key 和模型可配置；Key 只由主进程或受控后台持有。数据库保存凭据引用，网络调用不放在 Renderer。
- Codex App Server 是可选引擎适配，不是使用前提；UI 不绑定它的 threadId、工具事件或认证。

## 2. 总体架构

```mermaid
flowchart TB
    USER["用户"]
    subgraph UI["Renderer：React + 原 AI Elements"]
      PROJECT["项目 / 会话列表 / 文件树"]
      CHAT["Conversation / Message / Prompt Input"]
      ACTION["Tool / Plan / Confirmation / 状态"]
      CODE["本地 Monaco / Worker / 版本保存 / 实际 Diff；Commit 待阶段 8"]
      TERM["xterm 交互终端 / 执行日志 / 测试结果"]
      SETTINGS["供应商 / 协议 / Base URL / 模型 / 权限设置"]
      STATE["Zustand：UI 状态与任务事件投影"]
    end
    subgraph BRIDGE["受限进程桥"]
      PRELOAD["contextBridge：固定方法与可清理订阅"]
      IPC["IPC 校验：来源 / Schema / 任务归属 / 错误"]
    end
    subgraph MAIN["Electron 主进程与服务"]
      WORKSPACE["项目与会话服务"]
      CONFIG["Provider 配置与能力表"]
      SECRET["凭据服务：系统保护存储"]
      EVENTS["任务路由：排队 / 订阅 / 取消"]
      GIT["Git：状态 / Diff / 提交 / worktree"]
      PTY["用户 PTY：输入 / resize / 退出"]
    end
    subgraph AGENT["Devly Agent 后台运行时"]
      CONTEXT["历史 / 检索 / 项目指令 / Skills / 记忆"]
      LOOP["Agent 循环与回合状态机"]
      LIMIT["上下文 / 次数 / 时间 / 输出预算"]
      TOOLS["工具注册 / 参数校验 / 调度 / 审批"]
      RECOVERY["事件持久化 / 恢复核对 / 审计"]
    end
    subgraph PROVIDERS["Provider 适配层"]
      CONTRACT["统一消息 / 工具 / 能力 / 流事件接口"]
      CHATAPI["OpenAI-compatible Chat Completions"]
      RESP["Responses"]
      ANTHROPIC["Anthropic Messages"]
      HTTP["HTTP / SSE：认证 / 取消 / 超时 / 错误"]
    end
    subgraph EXEC["执行边界"]
      POLICY["权限策略 / 操作审批 / OS 隔离"]
      FILES["目录 / 搜索 / 读取 / 补丁 / 文件版本"]
      COMMAND["命令 / 构建 / 测试 / 子进程树"]
      MCP["MCP 客户端及外部工具"]
      BROWSER["可选网页搜索 / 预览 / 浏览器工具"]
    end
    DB[("SQLite Worker：业务数据与事件")]
    DISK["项目目录 / 附件 / 大日志"]
    REMOTE["用户配置的第三方模型 API"]
    OPTIONAL["可选 Codex 引擎适配"]

    USER --> UI
    UI <--> STATE
    STATE <--> PRELOAD <--> IPC
    IPC --> WORKSPACE & CONFIG & EVENTS & GIT & PTY
    CONFIG --> SECRET
    WORKSPACE --> DB
    EVENTS <--> LOOP
    LOOP <--> CONTEXT
    LOOP <--> LIMIT
    LOOP --> CONTRACT
    CONTRACT --> CHATAPI & RESP & ANTHROPIC
    CHATAPI & RESP & ANTHROPIC --> HTTP
    SECRET --> HTTP
    HTTP <--> REMOTE
    LOOP <--> TOOLS
    TOOLS --> POLICY
    POLICY --> FILES & COMMAND & MCP & BROWSER
    FILES & COMMAND --> DISK
    LOOP --> RECOVERY --> DB
    GIT & PTY --> DISK
    EVENTS -. "未来可选" .-> OPTIONAL
```

箭头表示职责依赖，不表示各服务共用一个进程。数据库同步访问在 Worker 中，Agent 长任务在后台执行；权限校验不能只依赖 Renderer 的按钮状态。模型网络凭据与命令环境分开管理，执行命令时不得自动继承所有 API Key。

## 3. 一次真实编程任务的时序

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant UI as AI Elements 界面
    participant MAIN as IPC / 会话服务
    participant DB as SQLite / 日志
    participant A as Devly Agent
    participant P as Provider 适配器
    participant API as 第三方模型 API
    participant T as 工具 / 权限 / 执行器

    U->>UI: 选择项目、供应商和模型，提交需求
    UI->>MAIN: 提交会话输入
    MAIN->>MAIN: 校验项目、配置、能力和输入
    MAIN->>DB: 保存用户消息、回合与配置快照
    MAIN->>A: 启动回合并传入凭据引用
    A->>DB: 按需加载历史、项目约定和摘要
    loop 模型与工具闭环
      A->>P: 统一消息、工具定义、预算与取消信号
      P->>API: 对应协议的真实请求
      API-->>P: 流式文本、工具调用、结束原因、可用用量
      P-->>A: 归一化事件
      A-->>MAIN: 文本/步骤/工具状态
      MAIN-->>UI: 更新当前会话投影
      opt 返回工具调用
        A->>T: 完整参数、调用 ID、项目与权限上下文
        T->>T: Schema、路径、文件版本、权限检查
        opt 需要操作审批
          T-->>MAIN: 审批请求 ID、操作与范围
          MAIN-->>UI: 展示 Confirmation
          U->>UI: 允许或拒绝
          UI->>MAIN: 回传对应请求决定
          MAIN->>T: 校验归属后响应
        end
        alt 已授权
          T->>T: 执行读取、补丁或命令
          T-->>A: 真实输出、退出码、变化与错误
        else 拒绝或校验失败
          T-->>A: 拒绝/冲突等结构化结果
        end
        A->>DB: 保存调用与结果关联
      end
    end
    A->>DB: 保存最终状态和验证证据
    A-->>MAIN: 完成、失败、取消或待确认
    MAIN-->>UI: 结果、修改文件、Diff、未完成项
    opt 用户在任意执行阶段停止
      U->>UI: 停止
      UI->>MAIN: 请求取消对应回合
      MAIN->>A: 传播 Abort 与停止信号
      A->>P: 中断模型请求
      A->>T: 停止排队工具并处理运行进程
      T-->>A: 停止确认或状态未知
      A-->>UI: 经主进程返回实际状态
    end
```

停止分支代表运行期间可发出的控制，不是任务完成后才停止。断流不能证明工具未执行，不允许自动重复写入或命令。模型提出工具调用，实际应用执行并回传结果，这是客户端工具调用的基础机制。[OpenAI 工具调用](https://developers.openai.com/api/docs/guides/function-calling)、[Claude 工具调用](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)

## 4. Provider 与上下文架构

```mermaid
flowchart TB
    INPUT["用户需求 / 当前项目 / 文件引用 / 会话"]
    HISTORY["历史消息 / 工具结果 / 阶段摘要"]
    RULES["项目指令 / Skills / 可检查的记忆"]
    SEARCH["按需检索文件与符号 / 行号 / 文件版本"]
    FILTER["范围控制 / 大文件与忽略规则 / 秘密过滤"]
    BUDGET["上下文与输出预算 / 压缩 / 附件能力检查"]
    CANON["统一消息分段与工具契约"]
    CAP["Provider 能力表：支持 / 不支持 / 未知"]
    SWITCH{"明确选定的协议"}
    CC["Chat Completions 编解码"]
    RESP["Responses 编解码"]
    MSG["Messages 内容块与工具结果映射"]
    STREAM["流事件归一化：文本 / 参数 / 工具结束 / 用量 / 错误"]
    COMPLETE["完整参数校验与工具调度"]
    UI["UI 投影与业务持久化"]

    INPUT & HISTORY & RULES & SEARCH --> FILTER --> BUDGET --> CANON
    CAP --> BUDGET
    CANON --> SWITCH
    SWITCH --> CC & RESP & MSG
    CC & RESP & MSG --> STREAM
    STREAM --> UI
    STREAM --> COMPLETE
    COMPLETE --> HISTORY
```

能力表按端点、协议和模型验证；不支持工具调用的模型只能获得已验证的聊天能力。服务商不提供模型列表时允许手工模型 ID，不因此拒绝所有连接。未经用户操作不切供应商，也不把旧会话代码自动发送给其他端点。

## 5. 工具与执行边界

```mermaid
flowchart TB
    CALL["工具名 / 调用 ID / 完整参数"]
    SCHEMA["白名单 / Schema / 大小限制"]
    TARGET["规范化路径 / 符号链接 / cwd / 文件版本"]
    AUTH{"策略是否允许？"}
    ASK["审批：请求 ID / 操作 / 范围 / 有效期"]
    DENY["结构化拒绝结果"]
    QUEUE["并发队列 / 文件写入锁 / 取消检查"]
    OS["实际 OS 隔离与网络/文件约束"]
    READ["读取与搜索：分页 / 行号 / 截断"]
    PATCH["补丁：预期版本 / 逐文件结果 / 冲突"]
    PROC["命令：过滤环境 / 进程组 / 超时 / 退出码"]
    CANCEL["取消控制器"]
    RESULT["真实结果：成功 / 失败 / 拒绝 / 超时 / 取消 / 未知"]
    AUDIT["脱敏日志 / 输出引用 / 调用与审批关联"]

    CALL --> SCHEMA --> TARGET --> AUTH
    AUTH -->|允许| QUEUE
    AUTH -->|禁止| DENY
    AUTH -->|需要确认| ASK
    ASK -->|允许| QUEUE
    ASK -->|拒绝或失效| DENY
    QUEUE --> OS
    OS --> READ & PATCH & PROC
    CANCEL -. "撤销未执行操作" .-> QUEUE
    CANCEL -. "停止进程树并等待确认" .-> PROC
    READ & PATCH & PROC & DENY --> RESULT --> AUDIT
```

cwd 与 worktree 不是安全沙箱；Renderer 的 Chromium sandbox 也不能隔离主进程启动的任意 shell。写操作需要实际的文件一致性检查，跨文件补丁可能部分成功。操作系统隔离能力须按 macOS/Windows 分别验证，不用关键词黑名单代替隔离。

## 6. 自有数据模型

```mermaid
erDiagram
    PROJECT ||--o{ SESSION : contains
    PROJECT ||--o{ WORKSPACE : owns
    PROVIDER ||--o{ MODEL_PROFILE : offers
    PROVIDER }o--|| SECRET_REF : references
    SESSION ||--o{ TURN : contains
    WORKSPACE ||--o{ TURN : executes
    MODEL_PROFILE ||--o{ TURN : selected_snapshot
    TURN ||--o{ MESSAGE_PART : emits
    TURN ||--o{ TOOL_CALL : invokes
    TOOL_CALL ||--o{ APPROVAL : requests
    TURN ||--o{ EVENT : records
    TURN ||--o{ ARTIFACT : produces
    TURN ||--o{ FILE_CHANGE : observes
    TURN ||--o{ USAGE : reports

    PROVIDER {
      string id PK
      string name
      string protocol
      string base_url
      string secret_ref_id FK
    }
    SECRET_REF {
      string id PK
      string protected_storage_reference
    }
    MODEL_PROFILE {
      string id PK
      string provider_id FK
      string model_id
      string capability_state
    }
    TURN {
      string id PK
      string session_id FK
      string workspace_id FK
      string model_profile_id FK
      string provider_config_snapshot
      string status
      datetime started_at
      datetime ended_at
    }
    TOOL_CALL {
      string id PK
      string turn_id FK
      string tool_name
      string status
      string result_reference
    }
    APPROVAL {
      string id PK
      string tool_call_id FK
      string scope
      string decision
      datetime expires_at
    }
```

这是目标逻辑模型；阶段 2 的 v1/v2 迁移已覆盖项目、配置、会话、消息/工具/事件等基础实体，阶段 3 的 v3 增加 Provider 兼容配置、版本和检查证据，阶段 4 的 v4 增加会话模型绑定和实际回合/消息生命周期，Agent 上下文/执行恢复仍待后续。API Key 不存在 Provider 或消息表里，SECRET_REF 只保存保护存储引用。用量缺失与零区分，费用未知不编造。消息和事件以 Devly ID 为主，外部模型/可选引擎 ID 只是关联字段。原始大日志与附件落盘，SQLite 保存索引；外框截图等本机产物不等于云端历史。阶段 3 的实际数据流、生命周期与验证边界见 [Provider API](./provider-api.md)。

## 7. 任务状态与恢复

```mermaid
stateDiagram-v2
    [*] --> Queued
    state "排队" as Queued
    state "准备上下文" as Preparing
    state "模型流式处理中" as Model
    state "工具执行" as Tool
    state "等待审批" as Approval
    state "取消处理中" as Cancelling
    state "待核对" as Unknown
    state "恢复核对" as Recovering
    state "完成" as Completed
    state "失败" as Failed
    state "已取消" as Cancelled
    state "预算用尽" as Budget
    Queued --> Preparing: 配置与槽位就绪
    Preparing --> Model: 上下文与能力就绪
    Preparing --> Failed: 配置或权限失败
    Model --> Tool: 完整工具参数且校验通过
    Tool --> Approval: 需要确认
    Approval --> Tool: 授权
    Approval --> Model: 拒绝结果回传
    Tool --> Model: 真实工具结果
    Model --> Completed: 本轮完成且证据已记录
    Model --> Failed: 无法恢复的错误
    Model --> Budget: 达限停止新调用
    Tool --> Budget: 达限并完成停止收尾
    Model --> Cancelling: 用户停止
    Tool --> Cancelling: 用户停止
    Approval --> Cancelling: 用户停止
    Cancelling --> Cancelled: 执行端确认
    Cancelling --> Unknown: 无法确认
    Model --> Unknown: 断流或进程退出
    Tool --> Unknown: 断连或异常
    Unknown --> Recovering: 重开应用
    Recovering --> Completed: 已有完成证据
    Recovering --> Failed: 确认失败
    Recovering --> Cancelled: 确认停止
    Recovering --> Unknown: 无法核实
    Recovering --> Preparing: 用户确认后继续未完成工作
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
    Budget --> [*]
```

直接 API 请求与本机进程通常不能在应用重启后无条件续接。恢复必须依据已存事件、工具执行结果和当前文件重新核对；“继续”不是重放全部历史操作。状态机聚合回合状态，各个并行工具仍有自己的独立状态。

## 8. 对应实施文档

- [技术选型](./tech-stack.md)：已安装与待增加的依赖、进程归属。
- [阶段计划](./development-plan.md)：可用节点和交付范围。
- [工作总表](./work-plan.md)：逐项任务、依赖与验收。
- [工作日志](./work-log.md)：已完成事项和证据。
- [编辑器与实际 Diff](./editor-and-diff.md)：文件服务、监听归属、本地资源、缓冲区与保存/差异责任图。

阶段 4 实际架构、数据库 v4、回合状态、模型切换授权与局部消息 ScrollArea 见 [普通聊天说明](./chat.md)。这是普通聊天的实际数据流；阶段 6 的工具/审批/执行数据流另见下文和执行说明。

## 已实现的用量与额度路径

设置的独立用量分类通过严格 IPC 在数据库 Worker 聚合 turns.usage，v7 provider_usage_budgets 保存本地预算与计数起点；账户余额查询由 Main 按实际配置域名选择已实现的适配器并读取 Vault，不根据模型品牌跨站发送 Key。当前仅 DeepSeek 官方金额余额可手动查询，其他平台明确显示未接入；详情与数据流见 [用量与额度](./usage-and-budget.md)。

## 阶段 6 执行与审批数据流

普通聊天仍不提供工具；只读模式保留三个只读工具。项目 Agent 只有在 macOS、本地项目、ask 策略和实际系统预检通过时，增加 update_plan/apply_patch/run_command。详细责任图、审批/取消/隔离边界见 [执行与审批](./execution-foundation.md)，任务与最终验证见 LOG-047 和工作计划。

Main 接收固定作用域请求，准备 Provider/上下文/Git 基线，运行模型与工具循环。完整参数校验后先保存工具和审批元数据到 SQLite Worker v8，由原 Confirmation 提交对应 ID/digest 的单次决定。拒绝作为工具结果回传；允许后进入全局单修改队列，固定补丁助手和前台命令分别在 deny-default Seatbelt 内运行。只读 Git 基线也不能通过配置/过滤器写文件或联网。系统约束不可用则失败，不降为普通主机 shell。

运行时计划要求已完成项关联成功调用；原 Plan/Task 只投影这些计划和真实记录。日志先脱敏再落盘/返回；上下文估算与供应商实际 Token 分开显示，未知费用不估价。停止贯穿网络、队列、审批、受管进程组与收尾持久化；确认失败显示状态未知。异常重启使旧审批失效，不自动续跑；脱组后台进程、外置 worktree 元数据、个人工具链与 Windows 的剩余边界明确列出。

阶段 7 增加 EditorService，复用 ReadOnlyToolbox 的范围、忽略、大小/编码和内容保护；手工保存与 Agent 补丁共用串行队列/隔离助手，模型操作仍逐次审批。监听 lease 绑定窗口 owner/watch UUID；Renderer 仅存项目 UUID+路径的有界缓冲区，正常离开询问，崩溃恢复尚未实现。Git 只读状态/HEAD 内容进入 Monaco Diff，未保存比较与实际磁盘 Diff 分开显示。五类 Worker 由本地打包资源提供，不访问 CDN；详见编辑器说明与 LOG-050/LOG-051。
