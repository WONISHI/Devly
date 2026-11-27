import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DataResult } from '@shared/data-contracts'
export function PreviewPanel({ projectId }: { projectId: string }) {
  const [entry, setEntry] = useState('index.html'),
    [current, setCurrent] = useState<DataResult<'preview.status'>>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const value = await desktop.data('preview.status', { projectId })
        if (active) setCurrent(value)
      } catch {
        if (active) setMessage('预览状态读取失败，请重新检查项目')
      } finally {
        if (active) timer = setTimeout(() => void poll(), 1500)
      }
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [projectId])
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '预览操作失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="extension-panel">
      <p>
        预览项目内静态 HTML 和入口目录的本地资源，可选择 dist/index.html 等构建产物，不执行
        npm、Shell 或启动任意开发服务器。独立窗口无应用 IPC、Node、登录
        Cookie、下载和弹窗；外部网络、连接和表单提交关闭。动态后端、HMR 和外部 CDN
        不属于当前预览范围。
      </p>
      <Label htmlFor="preview-entry">项目内 HTML 路径</Label>
      <Input
        id="preview-entry"
        value={entry}
        maxLength={1000}
        onChange={(event) => setEntry(event.target.value)}
      />
      <div className="settings-actions">
        <Button
          disabled={busy || !entry.trim()}
          onClick={() =>
            void run(async () => {
              setCurrent(await desktop.data('preview.start', { projectId, entry }))
              setMessage('隔离静态预览已启动；关闭预览窗口、重载主界面或退出会释放临时端口')
            })
          }
        >
          启动隔离预览
        </Button>
        <Button
          variant="outline"
          disabled={busy || !current}
          onClick={() =>
            void run(async () => {
              await desktop.data('preview.stop', { projectId })
              setCurrent(null)
              setMessage('预览窗口和临时端口已关闭')
            })
          }
        >
          停止预览
        </Button>
      </div>
      {current && (
        <p role="status">
          运行中：{current.entry} · {new URL(current.url).origin}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
