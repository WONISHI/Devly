# 0.2.0-preview.1 发行验收报告

日期：2026-11-27（Asia/Shanghai）。对应阶段 12：T12/X05/V02–V08。用户确认本轮先交付 **macOS ARM64 未签名预览版**，Windows 留待外部实测，签名条件尚不具备。阶段 9 的新协议真实端点与阶段 11 真实搜索验收继续保留；不把预览交付称为两平台完整发行。

任务状态唯一来源仍是 [工作计划](./work-plan.md)，具体命令与失败记录在 [工作日志](./work-log.md) LOG-091 起。本报告仅列实际检查结果，失败与重跑均保留记录。

## 验收矩阵

| 项目 | macOS ARM64 | Windows | 证据与界限 |
| --- | --- | --- | --- |
| 主机执行隔离 | 十五项当前主机边界检查通过 | 未实现/未实测，拒绝命令与写入 | T12 不因平台模拟或跨编译通过 |
| 用户交互终端 | 五组真实 PTY、Ctrl+C、resize、大输出和进程清理通过 | 产品终端暂不开放 | node-pty 可安装不等于终端业务已验收 |
| 安装产物 | 0.2.0-preview.1 ARM64 DMG，只读挂载/实际复制安装通过 | 未生成/未实测 | 不用 Mac 构建代替 Windows 原生依赖检查 |
| 首次运行/升级 | 中文空格目录、空 PATH、v7→v15、缺 PTY/SQLite 均通过 | 未验证 | 仅生成的临时数据，不改用户实际数据库 |
| API/编辑器/终端 | 安装副本本地协议/Monaco/PTY 通过；真实 API 编程样例通过 | 未验证 | 本地协议夹具与真实供应商分开记录 |
| 签名/公证 | 未签名、未公证 | 未签名 | 本机 0 个有效代码签名身份；无正式发行声称 |
| 凭据/网页边界 | Main 保护存储、精确审批、独立浏览容器；本轮包内复核通过 | 运行证据缺失 | 不是 OS 级浏览网络沙箱 |
| 生产依赖公告 | 本轮 npm 生产审计 0；定向修复前 high 2/low 1 | 安装组合未验证 | 审计 0 不代表无漏洞、运行时受支持或版权已收口 |
| 完整功能矩阵 | 已实现功能逐项列于下文 | 未验证 | 新协议/商业搜索/真实视觉等未通过项保留 |

## 预览版产物

本轮本地预览产物位于 release：

- Devly-0.2.0-preview.1-mac-arm64.dmg：本地生成的未签名 ARM64 磁盘镜像。
- Devly-0.2.0-preview.1-source.zip：实际当前工作区源文件，包含尚未提交的功能，排除 node_modules、缓存、测试 userData 和凭据。
- Devly-0.2.0-preview.1-manifest.json：版本、平台、实际安装证据、源码提交/脏状态、产物字节数和摘要、未通过范围。
- Devly-0.2.0-preview.1-SHA256SUMS.txt：DMG 与源码 ZIP 的 SHA-256。

源快照使用白名单目录与 Git 工作区清单，不以 git archive HEAD 丢失未提交实现。不能从旧提交号独自复现当前脏工作区；源码 ZIP 的摘要才标识此次交付内容。没有自动提交、推送、GitHub Release 或公开分发。

## 复现入口

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm verify:terminal
pnpm verify:workbench-host
pnpm preview:mac
pnpm verify:mac-install
```

verify:mac-install 先 hdiutil verify，再只读挂载，使用 ditto 复制到临时中文和空格安装目录；在该实际副本验证首装、旧库迁移、本地协议/公式、Monaco、PTY、重启和缺失原生二进制。只在带归属标记的临时副本改名 native 文件，最终恢复并清理，不改系统 /Applications、不删除用户本地记录。

在新 .app 中运行完整桌面回归：

```bash
DEVLY_EXECUTABLE="$PWD/release/mac-arm64/Devly.app/Contents/MacOS/Devly" pnpm verify:stage11-suite
```

真实 API 的 verify:editor-live 只使用明确选中的既有 Provider 与保护存储副本，在新临时项目进行搜索→读取→审查补丁→审查测试→实际 Diff。不给该测试用户项目或对话历史，不将明文 Key 放入环境变量/参数/Renderer/报告，不自动切换另一个供应商。首次密文初始化失败必须记录错误，不能用夹具回复代替真实模型。

Windows 入口 pnpm verify:windows-restrictions 必须在真实 Windows 使用；其他主机输出 not_run 并退出 2。该入口仅检查受限预览的拒绝边界和只读访问，**不是 Windows 隔离执行/交互终端已实现的证据**。workflow 配置存在不代表远端 CI 已运行。

## 本轮实际结果

- pnpm check：167 项通过，3 项主机检查默认跳过；显式 verify:workbench-host 十五项与 verify:terminal 五组另外通过。类型、Lint、来源/图标、数据/三协议/恢复/故障/网页/附件/调度/Worker 检查通过；Lint 保留原有 TanStack 一条警告。
- verify:mac-install：退出 0，三组真实安装检查，hdiutil 校验/只读挂载/中文空格复制安装通过。v7→v15 保留历史与迁移前备份；缺 PTY 仍启动并提示重装，缺 SQLite 为真实错误界面，测试结束恢复副本并卸载镜像。
- 预览包桌面回归：preview/browser/stage11/execution/editor/extensions 六项顺序通过，stability 首次在截图阶段超时退出 1，不计通过；同一未变包单独重跑 stability 退出 0，完整恢复/新协议本地 UI/备份导入流程和截图通过。另 workbench 七组与 persistence 九组通过，实际系统 safeStorage 往返且明文未返回。
- 真实 API：2026-11-27，Chat Completions，`https://ark.cn-beijing.volces.com/api/v3`，`deepseek-v4-1-flash-261017`。实际预览包完成 6 轮、7 次工具调用：搜索/列目录/读取→单次补丁审批→单次 `/bin/sh tests/verify.sh` 审批→文件/Git/Monaco Diff 匹配。退出码 0，测试证明匹配、原测试未改、实际 Diff 匹配；工具记录均完成且有日志引用。不是协议夹具，也不包含个人项目上下文。
- 原组件来源 35 项、离线图标 357 项；三份 stage12 MIT 通知与实际依赖及包内文件逐字节相同。定向修复后 npm 生产审计 0（此前 high 2/low 1）；未扩大为完整发行安全承诺。

首次安装夹具使用 /var 别名导致项目规范路径不一致，已改真实路径种子；实际数学渲染暴露缺少 KaTeX CSS，已接本地 CSS/字体并在新包检查 MathML 隐藏样式；首次真实 API 密文副本因 Devly/devly 目录大小写别名初始化失败，修正真实凭据根路径后通过。没有降低路径/秘密校验或以失败尝试充当通过。

## 维护、权限与许可证复核

生产审计实际检出 linkify-it 两项 high 与 KaTeX 一项 low。锁定 linkify-it 5.0.2、KaTeX 0.18.2，原 ANSI 组件/数学插件保持；KaTeX 显式本地 CSS/字体，ANSI 使用实际传递解析器验证。修复后生产依赖审计为 0；不声称开发依赖、Electron 自带组件或所有可利用路径都清零。实际安装包的三份新增 MIT 通知来自 linkify-it/uc.micro/KaTeX 原包，保留在 resources/vendor/stage12-*。

本轮 registry 最新 Electron 为 45.5.0；当前保留 39.8.10 预览运行时，不冒称受维护。Electron 官方仅支持最近三个稳定主版本，旧 Electron、既有工具链/版权通知问题仍阻断正式发行。未用本轮定向修复代替跨主版本/双平台验证。[Electron 支持政策](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)、[linkify-it 修复记录](https://github.com/markdown-it/linkify-it/blob/master/CHANGELOG.md)、[KaTeX 修复版本](https://github.com/KaTeX/KaTeX/releases/tag/v0.18.2)。历史与本次评估见 [依赖评估](./dependency-review.md)。

Main 仍校验窗口/Frame/来源/请求归属，网页窗口无主界面 preload/Node/IPC，远程凭据独立、每次操作精确审批。非 macOS 不提供无隔离执行回退。终端 native 依赖延迟加载，缺失时报告重装而不是启动崩溃；SQLite 不可用必须显示真实存储错误，不能创建看似正常的空历史替代。

## 功能交付与保留事项

| 能力 | 预览交付范围 | 仍未归入完整验收 |
| --- | --- | --- |
| 第三方模型 | Chat Completions 及两种原生适配、配置、流式、用量、手动模型 | Responses/Anthropic 真实端点、任意供应商兼容 |
| 编程 Agent | macOS 只读/审批写入/命令/取消、版本冲突与真实 Diff | Windows 写入/执行、复杂任务质量保证 |
| 桌面工作区 | Monaco 本地 Worker、Git 本地操作、macOS 受限 PTY、主题/布局 | Windows 完整运行、远端 Git/个人工具链 |
| 多任务扩展 | 有界队列、worktree、MCP HTTP 子集、真实 Skill、一层子任务 | 全部 MCP 协议/任意扩展、无限递归/自动合并 |
| 附件与网页 | 受限文本/图片传输、隔离预览、审批浏览器及实际截图 | 真实视觉模型、商业搜索端点、任意复杂网站/IPv6 |
| 自动化 | 显式启用的本地只读任务、预算、停止、重启记录 | 云端常驻、机器物理睡眠/系统通知实测 |
| 发行 | 本机 ARM64 未签名预览和源码快照 | Developer ID/公证、Windows 签名/安装、正式分发 |

V08 的完整版本验收未通过，不能勾选“全部完成”。完成本轮后只保留上述未通过事项，不自动增加范围或后台任务。
