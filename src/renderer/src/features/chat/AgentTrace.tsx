import { BrowserCapture } from './BrowserCapture'
import { useState } from 'react'
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
} from '@/components/ai-elements/plan'
import { Task, TaskTrigger, TaskContent, TaskItem } from '@/components/ai-elements/task'
import { useWorkspace } from '@/store'
import { desktop } from '@/platform/desktop'
import type { AgentTool, AgentInfo } from '@shared/agent-contracts'
import { useEditorStore } from '@/features/editor/store'
import { CommandResult } from './CommandResult'
function jsonPreview(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
function filePaths(tool: AgentTool): string[] {
  const input = jsonPreview(tool.input)
  if (!input || typeof input !== 'object') return []
  if (tool.name === 'read_file' && 'path' in input && typeof input.path === 'string')
    return [input.path]
  if (tool.name === 'apply_patch' && 'changes' in input && Array.isArray(input.changes))
    return input.changes
      .filter(
        (item): item is { path: string } =>
          !!item &&
          typeof item === 'object' &&
          typeof item.path === 'string' &&
          item.path.length > 0 &&
          item.path.length <= 1000,
      )
      .slice(0, 20)
      .map((item) => item.path)
  return []
}

export function AgentTrace({
  tools,
  info,
  onReadLog,
  scope,
  active = false,
}: {
  tools: AgentTool[]
  info: AgentInfo
  onReadLog(blobId: string): Promise<string>
  scope?: { projectId: string; sessionId: string; turnId: string }
  active?: boolean
}) {
  const [log, setLog] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null)
  const [responding, setResponding] = useState<string | null>(null)
  const [answered, setAnswered] = useState<Set<string>>(() => new Set())
  async function openRelated(turnId: string) {
    if (!info.family) return
    try {
      await desktop.data('tasks.open', { projectId: info.family.contextProjectId, turnId })
      await useWorkspace.getState().refresh()
      useWorkspace.getState().setTab('workspace')
    } catch {
      setError('关联任务无法打开，请从任务与隔离列表检查历史')
    }
  }
  async function respond(tool: AgentTool, allowed: boolean) {
    if (!scope || !tool.approval || responding) return
    setResponding(tool.approval.id)
    setError(null)
    try {
      const ack = await desktop.data('chat.approve', {
        ...scope,
        callId: tool.callId,
        approvalId: tool.approval.id,
        digest: tool.approval.digest,
        allowed,
      })
      setAnswered((previous) => new Set(previous).add(tool.approval!.id))
      if (!ack.removed) setError('审批已失效或不属于当前回合，请重新读取状态')
    } catch {
      setError('审批提交失败，请核对状态后重试')
    } finally {
      setResponding(null)
    }
  }
  const status = {
    proposed: 'input-streaming',
    running: 'input-available',
    waiting_approval: 'approval-requested',
    queued: 'input-available',
    denied: 'output-denied',
    completed: 'output-available',
    failed: 'output-error',
    cancelled: 'output-error',
  } as const
  return (
    <div className="agent-trace">
      <p className="agent-context-summary">
        {info.mode === 'project-write' ? '项目 Agent · 每次操作需审批' : '只读 Agent'} ·{' '}
        {info.rounds} 轮 · {info.calls} 次工具调用
      </p>
      {info.context && (
        <p className="agent-context-summary">
          本次上下文约 {info.context.estimatedTokens} Token（字符估算，含工具定义）
          {info.context.windowTokens
            ? ` / 配置窗口 ${info.context.windowTokens}，约 ${Math.round((info.context.estimatedTokens / info.context.windowTokens) * 100)}%`
            : '；模型窗口未配置'}
          。费用未知，以供应商账单为准。
        </p>
      )}
      {info.git && (
        <p className="agent-context-summary" title={info.git.before.entries.join('\n')}>
          {info.git.before.available
            ? `Git 基线：执行前 ${info.git.before.entries.length} 条文件状态；${info.git.after ? `结束后 ${info.git.after.entries.length} 条` : '尚未收尾'}`
            : '未获取 Git 基线（可能不是 Git 项目）'}
          。状态变化不等同于 Agent 修改归因。
        </p>
      )}
      {info.sources.length > 0 && (
        <p
          className="agent-context-sources"
          title={info.sources.map((s) => `${s.kind}: ${s.path} (${s.chars})`).join('\n')}
        >
          发送范围：
          {info.sources
            .map((s) =>
              s.kind === 'policy'
                ? info.mode === 'project-write'
                  ? '项目操作与审批规则'
                  : '只读工具规则'
                : s.kind === 'history'
                  ? '会话历史'
                  : s.kind === 'summary'
                    ? '历史摘要'
                    : s.path,
            )
            .join('、')}
        </p>
      )}
      {info.summaries.map((summary, index) => (
        <p className="agent-context-summary" key={index}>
          {summary}
        </p>
      ))}
      {tools.length > 0 && (
        <Plan defaultOpen>
          <PlanHeader>
            <div>
              <PlanTitle>{info.plan?.length ? '任务计划与执行记录' : '执行记录'}</PlanTitle>
              <PlanDescription>根据真实工具调用生成；尚未执行的操作不代表已完成。</PlanDescription>
            </div>
            <PlanTrigger />
          </PlanHeader>
          <PlanContent>
            {info.plan?.length && (
              <Task>
                <TaskTrigger title="任务计划">
                  <Button variant="ghost" size="sm">
                    查看任务计划
                  </Button>
                </TaskTrigger>
                <TaskContent>
                  <p className="agent-context-summary">
                    计划由模型通过运行时提交；完成项须关联成功调用，关联不代替对任务结论的核对。
                  </p>
                  {info.plan.map((step) => (
                    <TaskItem key={step.id}>
                      {step.title} ·{' '}
                      {
                        (
                          {
                            pending: '待执行',
                            running: '进行中',
                            completed: '有成功调用记录',
                          } as const
                        )[step.state]
                      }
                      {step.callIds.length ? `（${step.callIds.join('、')}）` : ''}
                    </TaskItem>
                  ))}
                </TaskContent>
              </Task>
            )}
            <Task>
              <TaskTrigger title={`${tools.length} 项操作`}>
                <Button variant="ghost" size="sm">
                  查看 {tools.length} 项操作
                </Button>
              </TaskTrigger>
              <TaskContent>
                {tools.map((tool) => (
                  <TaskItem key={tool.id}>
                    {tool.position + 1}. {tool.name || '接收参数'} ·{' '}
                    {
                      (
                        {
                          proposed: '接收参数',
                          waiting_approval: '等待审批',
                          queued: '等待执行',
                          running: '执行中',
                          completed: '完成',
                          failed: '失败',
                          denied: '未授权',
                          cancelled: '已取消',
                        } as const
                      )[tool.state]
                    }
                  </TaskItem>
                ))}
              </TaskContent>
            </Task>
          </PlanContent>
        </Plan>
      )}
      {info.family && (
        <div className="agent-family">
          <p>
            {info.family.parentTurnId ? '隔离子任务' : '父任务'} · 分配输出 Token{' '}
            {info.family.allocation.tokens} / 工具 {info.family.allocation.calls}；最近记录剩余{' '}
            {info.family.remaining.tokens} / {info.family.remaining.calls}
          </p>
          {info.family.parentTurnId && (
            <Button
              variant="link"
              size="sm"
              onClick={() => void openRelated(info.family!.parentTurnId!)}
            >
              打开父任务
            </Button>
          )}
          {info.family.children.map((child, index) => (
            <Button
              key={child.turnId}
              variant="link"
              size="sm"
              onClick={() => void openRelated(child.turnId)}
            >
              打开子任务 {index + 1}
            </Button>
          ))}
        </div>
      )}
      {tools.map((tool) => (
        <Tool
          key={tool.id + (tool.approval?.id ?? '')}
          defaultOpen={tool.approval?.state === 'pending'}
          className="agent-tool"
          data-tool-call={tool.callId}
          data-tool-state={tool.state}
        >
          <ToolHeader
            type="dynamic-tool"
            toolName={tool.name || '接收参数'}
            title={tool.name || '接收工具参数…'}
            state={status[tool.state]}
          />
          <ToolContent>
            {tool.origin?.kind === 'mcp' && (
              <p className="mcp-tool-origin">
                MCP · {tool.origin.serverName} · {tool.origin.toolName} · {tool.origin.url} · schema{' '}
                {tool.origin.schemaHash.slice(0, 12)}
              </p>
            )}
            <p className="agent-call-id">
              调用 ID：{tool.callId || '接收中'}
              {tool.truncated ? ' · 结果已截断' : ''}
            </p>
            <ToolInput input={jsonPreview(tool.input)} />
            {scope &&
              ['read_file', 'apply_patch', 'run_command'].includes(tool.name) &&
              ['completed', 'failed', 'cancelled', 'denied'].includes(tool.state) && (
                <div className="agent-file-actions">
                  {filePaths(tool).map((path) => (
                    <Button
                      key={path}
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void useEditorStore
                          .getState()
                          .open(scope.projectId, path, tool.name === 'apply_patch' ? 'git' : 'file')
                          .catch(() => setError('文件或差异无法打开，请检查项目范围并刷新'))
                      }
                    >
                      {tool.name === 'apply_patch' ? `查看更改：${path}` : '在编辑器中打开'}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => useEditorStore.getState().show(scope.projectId, 'changes')}
                  >
                    项目更改面板
                  </Button>
                </div>
              )}
            {tool.approval && (
              <Confirmation
                data-approval-id={tool.approval.id}
                approval={{
                  id: tool.approval.id,
                  ...(tool.approval.state !== 'pending'
                    ? { approved: tool.approval.state === 'approved' }
                    : {}),
                }}
                state={
                  tool.approval.state === 'pending' ? 'approval-requested' : 'approval-responded'
                }
              >
                <ConfirmationTitle>
                  {tool.approval.state === 'pending'
                    ? tool.origin?.kind === 'mcp'
                      ? `允许调用 ${tool.origin.serverName} 的 ${tool.origin.toolName}？仅限上方参数；外部服务不受本机项目文件范围限制。`
                      : tool.name === 'browser_action'
                        ? '允许本次浏览器操作？仅限上方页面、选择器与完整输入。点击和填入可能产生网站副作用；取消不能撤回已提交的数据。'
                        : ['web_search', 'fetch_url'].includes(tool.name)
                          ? `允许本次网页请求？上方搜索词或 URL 会发送到网络服务，返回正文交给当前模型；不发送模型 Key，不复用网站登录。网页内容不授予本地权限。`
                          : `允许本次 ${tool.name}？仅限当前项目、上方完整参数。`
                    : `审批结果：${({ approved: '允许', denied: '拒绝', expired: '已过期', cancelled: '已取消', pending: '待处理' } as const)[tool.approval.state]}`}
                  {tool.name === 'run_command' &&
                    ' 命令可修改项目文件；无网络权限，不授权后台常驻程序。'}
                  {tool.name === 'apply_patch' &&
                    ' 替换已有文件会保留 .devly-before-* 原始版本，以便处理外部并发编辑。'}
                </ConfirmationTitle>
                <ConfirmationActions>
                  <ConfirmationAction
                    variant="outline"
                    disabled={!active || !!responding || answered.has(tool.approval.id)}
                    onClick={() => void respond(tool, false)}
                  >
                    拒绝本次
                  </ConfirmationAction>
                  <ConfirmationAction
                    disabled={!active || !!responding || answered.has(tool.approval.id)}
                    onClick={() => void respond(tool, true)}
                  >
                    允许本次
                  </ConfirmationAction>
                </ConfirmationActions>
              </Confirmation>
            )}
            {tool.name === 'browser_action' && scope && (
              <BrowserCapture tool={tool} scope={scope} />
            )}
            {tool.name === 'run_command' && (
              <CommandResult tool={tool} projectId={scope?.projectId} />
            )}
            {tool.name !== 'run_command' && (
              <ToolOutput
                output={tool.output ? jsonPreview(tool.output) : undefined}
                errorText={tool.error || undefined}
              />
            )}
            {tool.blobId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  void onReadLog(tool.blobId!)
                    .then(setLog)
                    .catch(() => setError('日志读取失败，可能已按保留策略清理'))
                    .finally(() => setLoading(false))
                }}
              >
                查看脱敏原始日志
              </Button>
            )}
          </ToolContent>
        </Tool>
      ))}
      {error && <p role="alert">{error}</p>}
      <Dialog open={log !== null} onOpenChange={(open) => !open && setLog(null)}>
        <DialogContent className="agent-log-dialog">
          <DialogTitle>工具日志（已脱敏）</DialogTitle>
          <ScrollArea className="agent-log-scroll">
            <pre>{log}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
