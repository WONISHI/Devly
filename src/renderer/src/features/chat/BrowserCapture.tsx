import { useEffect, useState } from 'react'
import { attachmentInfo } from '@shared/attachment-contracts'
import type { AgentTool } from '@shared/agent-contracts'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
export function BrowserCapture({
  tool,
  scope,
}: {
  tool: AgentTool
  scope: { projectId: string; sessionId: string }
}) {
  const [url, setURL] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  let info
  try {
    info = attachmentInfo.parse(JSON.parse(tool.output).data?.image)
  } catch {
    return null
  }
  if (info.mime !== 'image/png') return null
  async function open() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const parts: number[] = []
      while (parts.length < info!.bytes) {
        const chunk = await desktop.data('blobs.read', {
          projectId: scope.projectId,
          sessionId: scope.sessionId,
          blobId: info!.id,
          offset: parts.length,
          length: 65536,
        })
        const bytes = atob(chunk.base64)
        if (!bytes.length) throw Error()
        for (const c of bytes) parts.push(c.charCodeAt(0))
        if (parts.length > info!.bytes) throw Error()
      }
      const data = new Uint8Array(parts),
        digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('')
      if (digest !== info!.digest) throw Error()
      setURL(URL.createObjectURL(new Blob([data], { type: 'image/png' })))
    } catch {
      setError('截图读取或摘要核对失败，请检查本地文件与保留策略')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void open()}>
        查看实际浏览器截图
      </Button>
      {error && <p role="alert">{error}</p>}
      <Dialog
        open={!!url}
        onOpenChange={(open) => {
          if (!open) setURL('')
        }}
      >
        <DialogContent>
          <DialogTitle>实际浏览器截图</DialogTitle>
          <p>本地截图供审查，未自动发给模型视觉接口。</p>
          <ScrollArea className="max-h-[65vh]">
            <img src={url || undefined} alt="已审批浏览器的实际截图" />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
