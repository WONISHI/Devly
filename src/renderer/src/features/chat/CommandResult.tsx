import { useState } from 'react'
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalContent,
} from '@/components/ai-elements/terminal'
import {
  TestResults,
  TestResultsHeader,
  TestResultsSummary,
  TestResultsContent,
  Test,
} from '@/components/ai-elements/test-results'
import {
  StackTrace,
  StackTraceHeader,
  StackTraceError,
  StackTraceErrorType,
  StackTraceErrorMessage,
  StackTraceContent,
  StackTraceFrames,
} from '@/components/ai-elements/stack-trace'
import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/features/editor/store'
import { useWorkspace } from '@/store'
import type { AgentTool } from '@shared/agent-contracts'
export function projectTracePath(file: string, root: string): string | null {
  let path = file
  try {
    if (path.startsWith('file://')) path = decodeURIComponent(new URL(path).pathname)
  } catch {
    return null
  }
  if (path.startsWith(root + '/')) path = path.slice(root.length + 1)
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-z]+:/i.test(path) ||
    path.includes('\\') ||
    path.split('/').includes('..')
  )
    return null
  return path
}
export function CommandResult({ tool, projectId }: { tool: AgentTool; projectId?: string }) {
  const [follow, setFollow] = useState(true),
    [stackOpen, setStackOpen] = useState(false),
    [error, setError] = useState(''),
    record = tool.execution,
    validation = record?.validation
  const output = record
    ? [record.stdout, record.stderr ? `\n[stderr]\n${record.stderr}` : ''].join('')
    : tool.output || ''
  const open = (file: string, line?: number) => {
    if (!projectId) return
    const root = useWorkspace.getState().projects.find((project) => project.id === projectId)?.path
    const path = root ? projectTracePath(file, root) : null
    if (!path) {
      setError('堆栈路径不在当前项目，未打开')
      return
    }
    void useEditorStore
      .getState()
      .open(projectId, path, 'file', line)
      .catch(() => setError('堆栈对应的项目文件不可用'))
  }
  return (
    <div className="command-result" data-command-record={tool.callId}>
      <Terminal
        output={output}
        isStreaming={tool.state === 'running'}
        autoScroll={follow}
        className="agent-command-terminal border-border bg-background text-foreground"
      >
        <TerminalHeader className="border-border">
          <TerminalTitle className="text-muted-foreground">Agent 命令日志（只读）</TerminalTitle>
          <span>
            {record
              ? `${record.state} · 退出码 ${record.exitCode ?? '未知'} · ${record.durationMs}ms`
              : tool.state === 'running'
                ? '实际执行中'
                : '尚无实际命令结果'}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setFollow((value) => !value)}>
            {follow ? '暂停跟随' : '跟随输出'}
          </Button>
        </TerminalHeader>
        <TerminalContent />
      </Terminal>
      {(tool.truncated || record?.previewTruncated) && (
        <p className="agent-context-summary">此处为截断预览，完整脱敏输出请查看原始日志。</p>
      )}
      {validation?.state === 'complete' ? (
        <TestResults
          summary={{
            total: validation.total,
            passed: validation.passed,
            failed: validation.failed,
            skipped: validation.skipped,
            duration: record?.durationMs,
          }}
          data-validation-state={validation.failed ? 'failed' : 'passed'}
        >
          <TestResultsHeader>
            <strong>{validation.failed ? '验证失败' : '结构化测试报告'} · TAP</strong>
            <TestResultsSummary />
          </TestResultsHeader>
          <TestResultsContent>
            {validation.tests.map((test, index) => (
              <Test key={index} name={test.name} status={test.status} />
            ))}
            {validation.truncated && <p>测试项列表已截断，总数来自完整报告。</p>}
          </TestResultsContent>
        </TestResults>
      ) : (
        <p
          className="agent-context-summary"
          data-validation-state={validation?.state ?? 'unreported'}
        >
          {validation?.state === 'conflict'
            ? '测试报告与退出码不一致，未标为验证通过'
            : validation?.state === 'incomplete'
              ? '测试报告不完整或执行被中断，尚未验证'
              : record && record.exitCode !== 0
                ? `命令未成功（退出码 ${record.exitCode ?? '未知'}），没有可解析的测试报告`
                : '未验证测试结果；命令退出码为 0 只表示进程完成，不代表测试通过。'}
        </p>
      )}
      {record?.trace && (
        <StackTrace
          trace={record.trace}
          open={stackOpen}
          onOpenChange={setStackOpen}
          onFilePathClick={open}
          data-execution-stack={tool.callId}
        >
          <StackTraceHeader
            role="button"
            tabIndex={0}
            aria-label={`查看实际堆栈 ${tool.callId}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setStackOpen((value) => !value)
              }
            }}
          >
            <StackTraceError>
              <StackTraceErrorType />
              <StackTraceErrorMessage />
            </StackTraceError>
          </StackTraceHeader>
          <StackTraceContent>
            <StackTraceFrames />
          </StackTraceContent>
        </StackTrace>
      )}
      {error && <p role="alert">{error}</p>}
      {tool.error && (
        <p className="editor-error" role="alert">
          {tool.error}
        </p>
      )}
    </div>
  )
}
