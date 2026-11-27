import { useState } from 'react'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { RecoveryReport } from '@shared/stability-contracts'
const labels = {
  history: '历史与事件',
  approvals: '审批',
  files: '文件',
  processes: '进程',
  model: '供应商 / 模型',
}
const states = { verified: '已核对', changed: '有变化', unknown: '状态未知', unavailable: '不可用' }
export function RecoveryAction({
  scope,
  busy,
  onAccepted,
}: {
  scope: { projectId: string; sessionId: string; turnId: string }
  busy: boolean
  onAccepted(mode: 'chat' | 'read-only'): void
}) {
  const [report, setReport] = useState<RecoveryReport | null>(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState('')
  const inspect = async () => {
    setWorking(true)
    setError('')
    try {
      setReport(await desktop.data('chat.recovery.inspect', scope))
    } catch {
      setError('恢复状态读取失败，请先重新读取历史、检查项目和设置。')
    } finally {
      setWorking(false)
    }
  }
  const proceed = async () => {
    if (!report) return
    setWorking(true)
    setError('')
    try {
      await desktop.data('chat.recovery.continue', {
        ...scope,
        token: report.token,
        newTurnId: crypto.randomUUID(),
      })
      onAccepted(report.mode)
      setReport(null)
    } catch {
      setError('状态已变化或请求未能确认，请重新核对历史；不会自动重发。')
    } finally {
      setWorking(false)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy || working} onClick={() => void inspect()}>
        核对恢复状态
      </Button>
      {error && <span role="alert">{error}</span>}
      <Dialog
        open={!!report}
        onOpenChange={(open) => {
          if (!open && !working) setReport(null)
        }}
      >
        <DialogContent className="recovery-dialog">
          <DialogTitle>核对后继续会话</DialogTitle>
          <DialogDescription>
            不会重新连接旧请求或重放旧命令。项目任务将开启只读核对回合，后续修改仍需重新发起并审批。
          </DialogDescription>
          <ScrollArea className="recovery-review">
            <div className="recovery-checks">
              {report?.checks.map((check) => (
                <div key={check.kind}>
                  <strong>
                    {labels[check.kind]} · {states[check.state]}
                  </strong>
                  <p>{check.detail}</p>
                </div>
              ))}
              {report?.files.map((file) => (
                <p key={file.path}>
                  {file.path} ·{' '}
                  {file.state === 'matched'
                    ? '哈希一致'
                    : file.state === 'changed'
                      ? '文件已改变'
                      : '无法读取'}
                </p>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" disabled={working} onClick={() => setReport(null)}>
              关闭
            </Button>
            <Button variant="outline" disabled={working} onClick={() => void inspect()}>
              重新核对
            </Button>
            <Button
              disabled={busy || working || !report?.canContinue}
              onClick={() => void proceed()}
            >
              {report?.mode === 'chat' ? '确认开启新聊天回合' : '确认只读核对并继续'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
