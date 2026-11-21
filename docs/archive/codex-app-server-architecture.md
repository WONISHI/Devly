# 历史方案：Codex App Server 优先路线

> 本文为目标澄清前的历史快照，已由当前文档替代，不作为后续执行依据。

# Devly 详细架构设计

本文描述一个能实际开发和维护的桌面编程助手，覆盖六个视角：总体架构、Codex 接入时序、自研 Agent、工具执行边界、数据存储和任务状态。

这是建议采用的工程设计，其中 Codex 接入部分依据官方协议；其他模块是 Devly 自己的产品实现方案。图中模块代表设计职责，不代表当前仓库已经实现这些功能，也不代表 Codex 内部源码的精确结构。

## 目录

1. [实现路线与技术选择](#1-实现路线与技术选择)
2. [总体架构](#2-总体架构)
3. [Codex 接入时序](#3-codex-接入时序)
4. [自研 Agent 执行架构](#4-自研-agent-执行架构)
5. [工具执行权限与沙箱边界](#5-工具执行权限与沙箱边界)
6. [数据架构与存储归属](#6-数据架构与存储归属)
7. [任务状态机与恢复](#7-任务状态机与恢复)
8. [首版实现范围与验收](#8-首版实现范围与验收)
9. [官方参考资料](#9-官方参考资料)

## 1. 实现路线与技术选择

首版建议使用 **Electron + React + TypeScript + Codex App Server**，跑通“读代码 → 修改 → 执行测试 → 查看差异”的完整流程，不需要自己训练大模型。具体库、组件实现和进程归属见 [技术选型与实现方式](../tech-stack.md)。

| 路线 | Devly 负责的内容 | 适合的目标 |
| --- | --- | --- |
| A：接入 Codex App Server | 桌面界面、项目管理、协议适配、交互和差异展示 | 尽快做出接近 Codex 的软件 |
| B：自研 Agent，接入模型 API | 上述功能，加工具执行、上下文管理、权限和任务循环 | 支持多家模型，深度定制行为 |

两条路线是 Agent 引擎的替代实现。产品层通过统一接口调用引擎；首版可以只实现路线 A，后续按实际需要扩展路线 B。

官方将 App Server 定位为自定义 Codex 客户端的接入方式，支持认证、会话历史、审批和流式事件；Codex SDK 更偏向编程任务自动化。[官方接入说明](https://learn.chatgpt.com/docs/codex-sdk)

| 模块 | 建议技术或实现方式 |
| --- | --- |
| 桌面应用 | Electron + TypeScript |
| 界面与构建 | React + electron-vite |
| 通用 UI | 使用 AI Elements 配套的 shadcn/ui 基础组件，基础组件版本与所选 AI Elements 源码保持一致 |
| AI 专用 UI | 采用用户指定的 elements.ai-sdk.dev 这套 AI Elements，包括原 Commit 组件，适配 Codex 事件与业务状态 |
| 样式与主题 | Tailwind CSS + CSS 变量 |
| 图标 | lucide-react |
| 前端状态 | Zustand |
| 代码与差异展示 | Monaco Editor |
| 交互式终端 | xterm.js + node-pty |
| 本地数据 | SQLite，保存项目、会话索引和设置 |
| Git | 调用 Git CLI，获取状态、diff 和 worktree |
| Agent 通信 | 首版使用 App Server 的 stdio 协议 |

文件访问、进程启动和凭据管理放在主进程或受控后台进程，界面通过受限 IPC 调用。

## 2. 总体架构

界面负责交互，主进程负责系统能力，Agent 放在独立进程中运行。

```mermaid
flowchart TB
    USER["用户"]

    subgraph R["① Renderer：React 界面进程"]
        direction TB

        subgraph UI["产品界面"]
            PROJECT["项目列表<br/>最近打开 / 工作目录"]
            CHAT["对话区域<br/>输入需求 / 附件 / 流式消息"]
            TASK["任务面板<br/>执行步骤 / 状态 / 耗时"]
            FILE["文件浏览器<br/>目录树 / 文件预览"]
            EDITOR["Monaco Editor<br/>代码查看 / 编辑 / Diff"]
            TERMINAL["xterm.js<br/>交互式终端"]
            APPROVAL["审批界面<br/>操作内容 / 范围 / 允许或拒绝"]
            SETTINGS["设置<br/>模型 / 登录 / 权限 / 预算"]
        end

        STATE["前端状态层<br/>项目状态 / 会话状态 / 消息投影<br/>增量文本合并 / 事件去重"]
    end

    subgraph P["② Preload：受限能力桥接"]
        BRIDGE["contextBridge<br/>只暴露明确的方法<br/>不暴露任意文件或命令执行"]
    end

    subgraph M["③ Electron Main：应用主进程"]
        IPC["IPC 网关<br/>参数校验 / 来源校验<br/>请求关联 / 错误转换"]

        PROJECTS["项目服务<br/>路径规范化 / 项目信任<br/>工作目录 / 文件监听"]
        SESSIONS["会话服务<br/>创建 / 恢复 / 标题<br/>项目与 Agent 会话映射"]
        TASKS["任务服务<br/>任务状态 / 队列 / 取消<br/>并发限制 / 事件路由"]
        GIT["Git 服务<br/>status / diff / 分支<br/>可选 worktree"]
        PTY["终端服务<br/>PTY 创建 / 输入 / resize<br/>输出限流 / 进程清理"]
        CREDS["凭据服务<br/>系统凭据库<br/>登录状态管理"]
        STORAGE["存储服务<br/>数据库 / 日志 / 设置"]
        ENGINE["Agent 接入接口<br/>启动 / 恢复 / 发送输入<br/>订阅事件 / 审批 / 中断"]
    end

    subgraph A["④ Agent 后台进程：选择一条实现路线"]
        CODEX["路线 A：Codex 适配器<br/>启动 app-server<br/>协议编解码 / 事件映射"]
        CUSTOM["路线 B：自研 Agent Worker<br/>模型调用 / 上下文管理<br/>工具循环 / 执行策略"]
    end

    subgraph C["⑤ Codex 运行时"]
        SERVER["Codex App Server<br/>会话 / Agent 执行<br/>工具 / 审批 / 沙箱配置"]
    end

    subgraph E["⑥ 本地与远程资源"]
        FS["项目文件"]
        REPO["Git 仓库 / worktree"]
        PROC["Shell / 构建 / 测试进程"]
        DB[("应用 SQLite")]
        KEYCHAIN["系统凭据库"]
        MODEL["远程模型服务"]
        MCP["可选 MCP 服务"]
    end

    USER --> UI
    UI <--> STATE
    STATE <--> BRIDGE
    BRIDGE <-->|"受限 IPC"| IPC

    IPC --> PROJECTS
    IPC --> SESSIONS
    IPC --> TASKS
    IPC --> GIT
    IPC --> PTY
    IPC --> CREDS

    PROJECTS --> FS
    SESSIONS --> STORAGE
    TASKS --> ENGINE
    TASKS --> STORAGE
    STORAGE --> DB

    CREDS --> KEYCHAIN
    GIT --> REPO
    PTY --> PROC

    ENGINE --> CODEX
    ENGINE -. "替代实现" .-> CUSTOM
    CODEX <-->|"stdio / JSON-RPC"| SERVER

    SERVER --> FS
    SERVER --> PROC
    SERVER --> MODEL
    SERVER --> MCP

    CUSTOM --> FS
    CUSTOM --> PROC
    CUSTOM --> MODEL
    CUSTOM --> MCP
```

### 关键边界

- **Renderer 不直接访问文件、凭据或启动进程**，统一通过受限 IPC。
- **Codex 路线和自研路线是两种引擎实现**，产品层使用统一接口。
- **用户交互终端与 Agent 命令执行分别管理**，各自拥有明确的进程、工作目录和生命周期。
- Codex 适配器负责协议和事件映射；Codex App Server 是独立运行时。适配器本身不一定需要额外启动一个操作系统进程。
- 图中自研 Agent 到资源的连线表示能力依赖；实际访问必须经过第 5 节的工具调度、权限检查和执行边界。

## 3. Codex 接入时序

这条路线中，Devly 负责客户端和协议适配，代码理解与执行交给 Codex。

主进程启动以下命令，并管理子进程的输入、输出、错误和退出状态：

```bash
codex app-server
```

```mermaid
sequenceDiagram
    autonumber

    actor U as 用户
    participant UI as React 界面
    participant MAIN as Electron 主进程
    participant AD as Codex 适配器
    participant AS as Codex App Server
    participant ENV as 文件 / 命令执行环境
    participant DB as 应用数据库

    U->>UI: 打开项目
    UI->>MAIN: openProject(path)
    MAIN->>MAIN: 校验路径、读取项目配置
    MAIN->>DB: 保存项目元数据

    MAIN->>AD: ensureEngineStarted()
    AD->>AS: 启动 codex app-server
    AD->>AS: initialize
    AS-->>AD: 初始化响应
    AD->>AS: initialized 通知

    alt 新对话
        AD->>AS: thread/start，传入工作目录等配置
        AS-->>AD: 返回 threadId
        AD-->>MAIN: 返回引擎会话映射
        MAIN->>DB: 保存应用会话与 threadId 的映射
    else 继续已有对话
        MAIN->>DB: 读取 threadId
        MAIN->>AD: 恢复对应引擎会话
        AD->>AS: thread/resume
        AS-->>AD: 返回会话状态
        AD->>AS: 加载所需历史记录
        AS-->>AD: 返回历史记录
        AD-->>MAIN: 统一格式的历史与状态
        MAIN-->>UI: 投影历史消息
    end

    U->>UI: 输入“修复登录报错”
    UI->>MAIN: submitMessage(sessionId, input)
    MAIN->>DB: 保存用户输入与本地提交状态
    MAIN->>AD: startTurn(input)
    AD->>AS: turn/start
    AS-->>AD: 回合开始与执行事件
    AD-->>MAIN: 转换为应用事件
    MAIN-->>UI: 显示正在执行

    loop Agent 按需要读取、修改和验证
        opt 操作需要审批
            AS-->>AD: 审批请求
            AD-->>MAIN: 携带请求关联信息
            MAIN-->>UI: 展示操作和权限范围
            UI-->>U: 允许 / 拒绝
            U->>UI: 作出选择
            UI->>MAIN: 审批决定
            MAIN->>AD: 回传审批决定
            AD->>AS: 响应对应审批请求
        end

        opt 操作已获授权或无需额外审批
            AS->>ENV: 搜索 / 读取文件 / 执行操作
            ENV-->>AS: 工具结果
        end

        AS-->>AD: 文本增量 / 工具状态 / 文件变化
        AD-->>MAIN: 统一格式的任务事件
        MAIN->>DB: 保存必要事件与状态
        MAIN-->>UI: 更新消息和执行过程
    end

    alt 正常结束
        AS-->>AD: 回合结束事件
        AD-->>MAIN: 完成 / 失败
    else 用户在执行期间取消
        U->>UI: 点击停止
        UI->>MAIN: cancelTask(taskId)
        MAIN->>AD: 请求中断对应回合
        AD->>AS: 发送中断请求
        AS-->>AD: 中断后的最终状态
        AD-->>MAIN: 返回中断结果
    end

    MAIN->>ENV: 获取最终 Git 状态与 diff
    ENV-->>MAIN: 文件差异
    MAIN->>DB: 保存结果与差异索引
    MAIN-->>UI: 展示结果、测试信息和修改文件
    UI-->>U: 查看代码差异
```

### 协议与事件处理

`initialize → initialized → thread/start 或 thread/resume → turn/start` 是官方协议的基本接入流程，默认 stdio 使用逐行 JSON。[App Server 协议文档](https://learn.chatgpt.com/docs/app-server)

- 按请求 ID 匹配响应，持续处理服务端通知与服务端发起的请求。
- 审批结果必须关联到对应的引擎请求，不能仅靠前端当前选中的任务判断归属。
- 客户端收到工具事件时负责展示；采用 Codex 路线时，不要再把同一事件当成指令重复执行。
- 文本增量可以合并渲染；审批、错误、工具完成和回合结束等状态事件必须保持顺序和归属。
- 需要处理进程退出、协议异常、取消任务、恢复会话，以及“执行中、等待审批、失败、完成”等状态。
- 图中的取消分支是对执行期间用户中断的简化表示，实际实现应允许在执行过程中的任意可中断阶段发出请求。

## 4. 自研 Agent 执行架构

如果以后需要支持多家模型，可以实现自己的运行时。以下整块替换 Codex 引擎，桌面产品层继续复用。

```mermaid
flowchart TB
    INPUT["任务输入<br/>需求 / 项目路径 / 用户附件"]

    subgraph PREP["① 准备任务"]
        CONFIG["加载配置<br/>模型 / 权限 / 预算 / 超时"]
        RULES["加载项目指令<br/>项目约定 / 编码规范"]
        SNAPSHOT["记录初始状态<br/>Git 状态 / 已有修改 / 文件版本"]
    end

    subgraph CONTEXT["② 上下文构建"]
        HISTORY["对话历史<br/>用户输入 / 工具结果 / 阶段摘要"]
        RETRIEVE["代码检索<br/>文件名 / 文本搜索<br/>可选符号索引"]
        SELECT["上下文选择<br/>相关片段 / 行号 / 文件版本"]
        BUDGET["上下文预算<br/>输出截断 / 旧记录压缩<br/>保留错误与关键决策"]
        PROMPT["模型请求<br/>指令 + 历史 + 当前证据 + 工具定义"]
    end

    subgraph LOOP["③ Agent 循环"]
        CALL["模型适配层<br/>请求转换 / 流式解析<br/>用量统计 / 网络错误处理"]
        RESULT{"模型返回什么？"}
        TEXT["文本消息<br/>解释 / 进度 / 结果"]
        TOOL["工具调用<br/>名称 / 参数 / 调用 ID"]
        CHECK["执行前检查<br/>参数 / 权限 / 预算<br/>取消信号 / 调用关联"]
        EXEC["工具调度器"]
        OUTPUT["结构化工具结果<br/>状态 / 输出 / 错误<br/>退出码 / 文件变化"]
        STOP{"继续条件是否满足？"}
    end

    subgraph TOOLS["④ 工具集合"]
        READ["list_files / read_file"]
        SEARCH["search_text / 查找符号"]
        PATCH["apply_patch"]
        SHELL["run_command"]
        GIT["git_status / git_diff"]
        EXT["可选 MCP 工具"]
    end

    subgraph FINISH["⑤ 收尾"]
        VERIFY["验证证据<br/>测试退出码 / 构建结果<br/>最终文件差异"]
        SAVE["持久化任务结果<br/>修改文件 / 验证结果<br/>未完成项 / 用量"]
        FINAL["向用户返回结果"]
    end

    INPUT --> CONFIG --> RULES --> SNAPSHOT
    SNAPSHOT --> RETRIEVE
    HISTORY --> SELECT
    RETRIEVE --> SELECT --> BUDGET --> PROMPT
    PROMPT --> CALL --> RESULT

    RESULT -->|"文本"| TEXT
    TEXT --> STOP

    RESULT -->|"工具调用"| TOOL
    TOOL --> CHECK --> EXEC
    EXEC --> READ
    EXEC --> SEARCH
    EXEC --> PATCH
    EXEC --> SHELL
    EXEC --> GIT
    EXEC --> EXT

    READ --> OUTPUT
    SEARCH --> OUTPUT
    PATCH --> OUTPUT
    SHELL --> OUTPUT
    GIT --> OUTPUT
    EXT --> OUTPUT
    OUTPUT --> HISTORY
    OUTPUT --> STOP

    STOP -->|"继续执行"| SELECT
    STOP -->|"完成 / 失败 / 中断 / 超预算"| VERIFY
    VERIFY --> SAVE --> FINAL
```

### 核心职责

模型负责选择工具，程序负责执行并将结果交回模型，这个循环就是工具调用的基础机制。[Function Calling 官方说明](https://developers.openai.com/api/docs/guides/function-calling)

第一版工具可以控制在以下范围；这些是 Devly 的建议接口，不是 Codex App Server 协议方法：

```ts
list_files(path)
search_text(pattern, path)
read_file(path, startLine, endLine)
apply_patch(patch)
run_command(command, cwd, timeout)
git_status()
git_diff()
```

需要承担的工程职责包括：

- **上下文管理**：按需搜索和读取文件，控制日志长度，给长任务生成摘要。
- **执行边界**：限制工作目录、网络和文件访问；命令需要超时、取消以及进程树清理。
- **修改一致性**：应用补丁前检查文件版本，避免覆盖用户正在编辑的内容。
- **恢复能力**：保存工具调用和任务状态，区分已完成的操作与尚未执行的操作。
- **成本控制**：设置每个任务的调用次数、Token 或费用预算。

Git 状态、测试退出码和文件内容是执行证据，模型生成的“已成功”只是一段文本。没有实际执行验证时，应明确记录未验证。

## 5. 工具执行权限与沙箱边界

这一层决定软件能否可靠地操作本地项目。以下是自研执行器的设计；使用 Codex 时，应由适配器配置、接入 Codex 已有的权限和执行机制。

```mermaid
flowchart TB
    REQUEST["模型工具调用<br/>toolCallId / toolName / arguments"]

    subgraph POLICY["① 应用策略检查"]
        SCHEMA["参数校验<br/>工具白名单 / JSON Schema<br/>输入大小限制"]
        RESOLVE["解析实际目标<br/>规范化路径 / 解析符号链接<br/>明确 cwd 与目标文件"]
        AUTH{"当前权限是否允许？"}
        DENY["返回拒绝结果<br/>说明原因"]
        ASK["等待用户审批<br/>操作内容 / 授权范围<br/>仅本次或会话范围"]
    end

    subgraph SCHED["② 调度与并发控制"]
        QUEUE["工具队列<br/>并发限制 / 资源锁"]
        CANCEL["取消与超时控制器<br/>任务取消信号 / 执行期限"]
        DISPATCH{"执行类型"}
    end

    subgraph FILES["③ 文件操作执行器"]
        READ["读取 / 搜索<br/>大小限制 / 分页 / 输出截断"]
        PRECHECK["补丁前检查<br/>当前版本与预期是否一致"]
        WRITE["应用补丁<br/>按文件安全写入<br/>记录成功与失败"]
        CONFLICT["冲突结果<br/>重新读取后再决定"]
    end

    subgraph PROCESS["④ 命令执行器"]
        ENV["构建执行环境<br/>工作目录 / 环境变量过滤<br/>明确可用凭据"]
        SANDBOX["操作系统执行边界<br/>文件系统访问 / 网络访问<br/>平台对应的隔离机制"]
        SPAWN["启动子进程<br/>进程组 / PID / 生命周期"]
        STREAM["持续读取输出<br/>stdout / stderr<br/>限流 / 截断 / 磁盘日志"]
        EXIT["收集退出结果<br/>退出码 / 信号 / 耗时"]
        KILL["终止进程树<br/>等待退出 / 回收资源"]
    end

    subgraph RESULT["⑤ 统一结果与审计"]
        NORMALIZE["标准结果<br/>成功 / 失败 / 拒绝 / 超时 / 取消<br/>输出与变更信息"]
        AUDIT["执行记录<br/>调用 ID / 参数摘要<br/>权限决定 / 时间 / 结果"]
        RETURN["返回 Agent 循环"]
    end

    REQUEST --> SCHEMA --> RESOLVE --> AUTH
    AUTH -->|"允许"| QUEUE
    AUTH -->|"禁止"| DENY
    AUTH -->|"需要确认"| ASK
    ASK -->|"允许"| QUEUE
    ASK -->|"拒绝"| DENY

    QUEUE --> DISPATCH
    CANCEL -. "撤销待执行操作" .-> QUEUE

    DISPATCH -->|"读文件"| READ
    DISPATCH -->|"改文件"| PRECHECK
    PRECHECK -->|"一致"| WRITE
    PRECHECK -->|"已变化"| CONFLICT

    DISPATCH -->|"命令"| ENV
    ENV --> SANDBOX --> SPAWN --> STREAM --> EXIT
    SPAWN -. "登记进程句柄" .-> KILL
    CANCEL -->|"停止运行中的进程"| KILL
    KILL -->|"确认退出后"| EXIT

    READ --> NORMALIZE
    WRITE --> NORMALIZE
    CONFLICT --> NORMALIZE
    EXIT --> NORMALIZE
    DENY --> NORMALIZE

    NORMALIZE --> AUDIT --> RETURN
```

### 边界说明

- **worktree 用来隔离代码修改，不是安全沙箱。**
- **路径校验约束文件工具；Shell 的文件和网络访问还需要操作系统层的执行边界。**
- **取消任务不会自动撤销已经写入的文件。** 界面应保留已有 diff，供用户检查。
- 权限审批必须发生在对应的受控操作执行之前；拒绝后把拒绝结果返回 Agent，由 Agent 决定是否采用其他方法。
- 工作目录只指定命令在哪里开始运行，不会天然禁止它访问其他目录。
- 环境变量和输出日志可能包含凭据，保存执行记录时需要限制采集范围并处理敏感值。
- 多文件补丁可能部分成功，必须记录每个文件的真实结果；不能默认整批修改具备事务回滚能力。
- 图中的路径检查与文件版本检查属于应用层约束；存在并发访问时，仍需通过实际文件操作和系统隔离机制落实边界。

## 6. 数据架构与存储归属

把应用自己的元数据和引擎拥有的会话数据分开管理。下图是建议的逻辑数据模型，不是已实现的数据库迁移。

```mermaid
erDiagram
    PROJECT ||--o{ WORKSPACE : contains
    PROJECT ||--o{ SESSION : contains
    WORKSPACE ||--o{ TURN : executes
    SESSION ||--o{ TURN : contains
    TURN ||--o{ EVENT : emits
    TURN ||--o{ TOOL_CALL : invokes
    TOOL_CALL ||--o{ APPROVAL : requests
    TURN ||--o{ FILE_CHANGE : produces
    TURN ||--o{ ARTIFACT : generates
    TURN ||--o{ USAGE : records

    PROJECT {
        string id PK
        string name
        string root_path
        string trust_state
        datetime last_opened_at
    }

    WORKSPACE {
        string id PK
        string project_id FK
        string path
        string branch
        string worktree_path
        string lifecycle_state
    }

    SESSION {
        string id PK
        string project_id FK
        string engine_type
        string engine_thread_id
        string title
        datetime updated_at
    }

    TURN {
        string id PK
        string session_id FK
        string workspace_id FK
        string engine_turn_id
        string status
        string user_input
        string last_event_cursor
        datetime started_at
        datetime ended_at
    }

    EVENT {
        string id PK
        string turn_id FK
        string source_event_key
        int local_sequence
        string event_type
        string payload_ref
        datetime received_at
    }

    TOOL_CALL {
        string id PK
        string turn_id FK
        string engine_call_id
        string tool_name
        string arguments_ref
        string status
        string result_ref
    }

    APPROVAL {
        string id PK
        string tool_call_id FK
        string engine_request_id
        string requested_scope
        string decision
        datetime decided_at
    }

    FILE_CHANGE {
        string id PK
        string turn_id FK
        string relative_path
        string change_type
        string before_hash
        string after_hash
        string diff_ref
    }

    ARTIFACT {
        string id PK
        string turn_id FK
        string kind
        string storage_path
        string content_hash
    }

    USAGE {
        string id PK
        string turn_id FK
        string provider
        string model
        int input_tokens
        int output_tokens
        string reported_cost
    }
```

### 存储分配

| 数据 | 建议存放位置 | 负责方 |
| --- | --- | --- |
| 项目、设置、会话映射 | 应用 SQLite | Devly 客户端 |
| Codex 会话历史和执行状态 | Codex 自身管理的存储 | Codex；通过协议读取 |
| 自研 Agent 完整历史 | 应用数据库及日志文件 | Devly 运行时 |
| 界面消息、工具状态 | 前端内存；必要时缓存 | 由引擎事件重建 |
| 大段命令日志、截图等 | 文件系统，数据库保存索引 | 应用或执行器 |
| 密钥、令牌 | 系统凭据库或引擎认证机制 | 对应认证模块 |
| 项目文件、Git 对象 | 项目目录和 Git 仓库 | 文件系统与 Git |

### 一致性与恢复原则

- 图中的工具和审批记录，在 Codex 路线下可以是用于界面展示的本地投影。恢复时应与引擎重新对齐，不能仅凭本地缓存推断操作仍在运行。
- `engine_thread_id`、`engine_turn_id`、`engine_call_id` 和 `engine_request_id` 分别关联引擎对象，避免把不同会话或任务的事件混在一起。
- `local_sequence` 用于应用内部的事件排序；`source_event_key` 和 `last_event_cursor` 应根据接入协议的实际能力设计，不假定引擎支持任意事件重放。
- `FILE_CHANGE` 保存差异信息，不代表具备完整回滚能力；要支持恢复文件，还需要保存相应内容或可靠快照。
- 用量和费用字段以引擎或服务商实际返回的信息为准；未提供的值应允许为空，不把缺失值当作零。
- 快照和差异展示必须考虑任务开始前已有的用户修改，避免把用户原有改动全部归因于 Agent。

## 7. 任务状态机与恢复

建议以一次用户提交对应的回合作为基本执行单位。应用可以在此之上增加更高层的任务，但两者应保留明确的关联。

```mermaid
stateDiagram-v2
    [*] --> Queued: 用户提交需求

    state "排队中" as Queued
    state "准备中" as Preparing
    state "模型处理中" as Thinking
    state "工具执行中" as Executing
    state "等待审批" as Approval
    state "取消处理中" as Cancelling
    state "连接中断，状态待确认" as Unknown
    state "恢复与状态核对" as Reconciling

    state "已完成" as Completed
    state "已失败" as Failed
    state "已取消" as Cancelled
    state "超出预算" as BudgetExceeded
    state "执行已中断" as Interrupted

    Queued --> Preparing: 获得执行槽位
    Queued --> Cancelled: 用户取消

    Preparing --> Thinking: 引擎与上下文就绪
    Preparing --> Failed: 启动或配置失败

    Thinking --> Executing: 发出工具调用
    Thinking --> Completed: 回合结束
    Thinking --> Failed: 无法恢复的模型错误

    Executing --> Approval: 需要额外权限
    Approval --> Executing: 用户允许
    Approval --> Thinking: 用户拒绝，回传拒绝结果

    Executing --> Thinking: 工具返回结果
    Executing --> Failed: 运行时故障

    Thinking --> BudgetExceeded: 达到预算
    Executing --> BudgetExceeded: 达到预算并停止后续执行

    Preparing --> Cancelling: 用户取消
    Thinking --> Cancelling: 用户取消
    Executing --> Cancelling: 用户取消
    Approval --> Cancelling: 用户取消

    Cancelling --> Cancelled: 引擎确认停止
    Cancelling --> Unknown: 无法确认停止状态

    Preparing --> Unknown: 连接丢失
    Thinking --> Unknown: 连接丢失
    Executing --> Unknown: 连接丢失
    Approval --> Unknown: 连接丢失

    Unknown --> Reconciling: 重新连接或重启应用

    Reconciling --> Preparing: 引擎仍在准备
    Reconciling --> Thinking: 引擎仍在处理
    Reconciling --> Executing: 工具仍在执行
    Reconciling --> Approval: 仍有待审批请求
    Reconciling --> Completed: 已完成
    Reconciling --> Failed: 已失败
    Reconciling --> Cancelled: 已取消
    Reconciling --> BudgetExceeded: 已超出预算
    Reconciling --> Interrupted: 执行进程已退出
    Reconciling --> Unknown: 暂时无法取得可靠状态

    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
    BudgetExceeded --> [*]
    Interrupted --> [*]
```

### 恢复规则

连接中断不等于任务失败，也不等于工具没有执行。恢复时先查询引擎状态、核对文件和进程，再决定是否继续；不能自动重放修改文件、安装依赖、提交代码等有副作用的操作。

- 点击“停止”后先进入取消处理中，收到引擎或执行器的停止确认后再显示已取消。
- 无法确认进程状态时进入状态待确认，不向用户承诺任务已经停止。
- “已完成”表示回合执行结束；需求是否实现、测试是否通过，需要结合验证结果判断。
- 超出预算后停止发起新的模型或工具调用；正在运行的操作需要完成收尾或确认停止，才能把回合持久化为最终状态。
- 状态机中的“工具执行中”是回合层面的聚合状态。单个工具调用仍应保留独立状态，以支持并行工具和部分失败。
- 自动重试应区分只读查询与有副作用的操作。网络错误不能作为重复执行写入或命令的充分理由。

## 8. 首版实现范围与验收

详细开发顺序、阶段产物和完成条件见 [开发阶段与交付计划](../development-plan.md)。下列链路是 MVP 核心范围；完整 1.0 还包括计划中列出的终端、恢复、多任务与集成、安装包验证。

首版优先完成以下链路：

**项目选择 → Codex 进程管理 → 会话创建与恢复 → 流式事件 → 审批与取消 → Git diff → 重启后状态恢复。**

### 建议开发顺序

1. 实现项目选择、聊天界面和设置页。
2. 接通 App Server，显示真实的流式消息和执行事件。
3. 加入审批、取消、错误提示和会话恢复。
4. 加入文件查看、Git diff 和测试结果展示。
5. 再扩展多任务、独立 worktree、MCP、Skills 和其他模型。

### 核心验收场景

用户打开一个 Git 项目，输入“修复这个报错”，AI 找到相关文件、修改代码、执行测试，用户能查看完整 diff；应用重启后还能继续会话。

验证时至少覆盖：

- 新建会话与恢复会话能够关联到正确项目和工作目录。
- 文本和工具事件持续更新，完成、失败和等待审批状态清晰可见。
- 审批允许或拒绝后，只影响对应操作。
- 取消后能够确认执行状态，并保留已有文件差异。
- 应用断连或重启后不会自动重复执行已经发生的写入和命令。
- 原有用户修改不会被覆盖或误归因为 Agent 新增修改。

## 9. 官方参考资料

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)：自定义客户端、协议初始化、会话、回合、事件与审批。
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)：编程任务自动化与 SDK 接入定位。
- [Function Calling](https://developers.openai.com/api/docs/guides/function-calling)：模型工具调用与应用执行循环。

外部协议、字段和实验能力可能随版本变化。实现适配器时应选择明确的运行时版本，并以对应官方协议和能力协商结果为准。
