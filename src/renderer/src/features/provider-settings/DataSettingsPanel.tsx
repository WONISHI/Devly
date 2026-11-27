import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useDataSettings } from './use-data-settings'
export function DataSettingsPanel() {
  const {
    status,
    preview,
    message,
    busy,
    confirm,
    setConfirm,
    backup,
    inspect,
    refresh,
    cancel,
    stage,
    configPreview,
    setConfigPreview,
    exportConfig,
    inspectConfig,
    applyConfig,
    diagnostics,
  } = useDataSettings()
  return (
    <div className="data-settings-panel">
      <p>
        数据库版本：{status?.version ?? '尚未读取'}
        。备份包含历史、设置和日志附件，不包含系统保护密钥；请妥善保存备份中的项目内容。
      </p>
      {status?.recoveryError && (
        <p role="alert">上次恢复检查失败，仍使用原数据。请重新检查备份，或取消待恢复操作。</p>
      )}
      {status?.pendingRestore && (
        <p role="status">
          已安排恢复。请正常退出并重新打开 Devly；之后的操作不会加入选定备份。所有供应商 Key
          需重新设置。
        </p>
      )}
      <div className="settings-actions">
        <Button disabled={busy} variant="outline" onClick={backup}>
          创建数据备份
        </Button>
        <Button disabled={busy} variant="outline" onClick={inspect}>
          检查备份并恢复
        </Button>
        <Button disabled={busy} variant="ghost" onClick={refresh}>
          重新检查存储
        </Button>
        {status?.pendingRestore && (
          <Button disabled={busy} variant="ghost" onClick={cancel}>
            取消待恢复操作
          </Button>
        )}
      </div>
      {preview && (
        <div className="settings-group">
          <p>
            备份检查通过：{new Date(preview.summary.createdAt).toLocaleString()}，版本{' '}
            {preview.summary.version}，{preview.summary.projects} 个项目、{preview.summary.sessions}{' '}
            个会话，{preview.summary.blobs} 个日志/附件。
          </p>
          <Button disabled={busy} onClick={() => setConfirm(true)}>
            审查恢复操作
          </Button>
        </div>
      )}
      <div className="settings-group">
        <h3>配置与诊断</h3>
        <p>
          配置只包含供应商元数据和应用默认偏好；诊断只包含版本、计数和运行状态，不导出日志正文或路径。
        </p>
        <div className="settings-actions">
          <Button disabled={busy} variant="outline" onClick={exportConfig}>
            导出配置（不含密钥）
          </Button>
          <Button disabled={busy} variant="outline" onClick={inspectConfig}>
            导入配置并审查
          </Button>
          <Button disabled={busy} variant="ghost" onClick={diagnostics}>
            导出诊断
          </Button>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      <Dialog
        open={!!configPreview}
        onOpenChange={(open) => {
          if (!open && !busy) setConfigPreview(null)
        }}
      >
        <DialogContent className="recovery-dialog">
          <DialogTitle>审查配置导入</DialogTitle>
          <DialogDescription>
            供应商将作为新配置添加，不覆盖已有会话绑定或密钥。应用默认偏好会替换，并清除未保存的偏好草稿；项目覆盖保留。导入不会发送
            API 请求，Key 需重新设置。
          </DialogDescription>
          <ScrollArea className="recovery-review">
            <p>
              主题{' '}
              {configPreview &&
                { dark: '深色', light: '浅色', system: '跟随系统' }[configPreview.theme]}{' '}
              · 权限 {configPreview?.projectPermission === 'ask' ? '逐次询问' : '只读'} · Token 限额{' '}
              {configPreview?.maxTokens} · 费用限额 {configPreview?.maxCost}
            </p>
            {configPreview?.providers.map((provider, index) => (
              <p key={index}>
                {provider.name} ·{' '}
                {
                  {
                    'chat-completions': 'Chat Completions',
                    responses: 'Responses',
                    'anthropic-messages': 'Anthropic Messages',
                  }[provider.protocol]
                }{' '}
                · {provider.host} · {provider.model}
              </p>
            ))}
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setConfigPreview(null)}>
              取消
            </Button>
            <Button disabled={busy} onClick={applyConfig}>
              确认导入配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>下次启动恢复这份备份？</DialogTitle>
          <DialogDescription>
            将使用备份中的历史和设置。当前数据库和日志会保留在旧存储位置；不会删除项目文件。所有 API
            Key 都需要重新设置。正在执行的任务必须先停止，旧审批与命令不会重放。
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              取消
            </Button>
            <Button disabled={busy || !preview} onClick={stage}>
              确认下次启动恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
