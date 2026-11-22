import { useState } from 'react'
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AgentTool, AgentInfo } from '@shared/agent-contracts'
function jsonPreview(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function AgentTrace({
  tools,
  info,
  onReadLog,
}: {
  tools: AgentTool[]
  info: AgentInfo
  onReadLog(blobId: string): Promise<string>
}) {
  const [log, setLog] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null)
  const status = {
    proposed: 'input-streaming',
    running: 'input-available',
    completed: 'output-available',
    failed: 'output-error',
    cancelled: 'output-error',
  } as const
  return (
    <div className="agent-trace">
      <p className="agent-context-summary">
        只读 Agent · {info.rounds} 轮 · {info.calls} 次工具调用
      </p>
      {info.sources.length > 0 && (
        <p
          className="agent-context-sources"
          title={info.sources.map((s) => `${s.kind}: ${s.path} (${s.chars})`).join('\n')}
        >
          发送范围：
          {info.sources
            .map((s) =>
              s.kind === 'policy'
                ? '只读工具规则'
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
      {tools.map((tool) => (
        <Tool
          key={tool.id}
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
            <p className="agent-call-id">
              调用 ID：{tool.callId || '接收中'}
              {tool.truncated ? ' · 结果已截断' : ''}
            </p>
            <ToolInput input={jsonPreview(tool.input)} />
            <ToolOutput
              output={tool.output ? jsonPreview(tool.output) : undefined}
              errorText={tool.error || undefined}
            />
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
