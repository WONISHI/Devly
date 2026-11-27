import { useWorkspace } from '@/store'
import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import type { DataResult } from '@shared/data-contracts'
export function useDataSettings() {
  const [status, setStatus] = useState<DataResult<'storage.status'> | null>(null),
    [preview, setPreview] = useState<DataResult<'storage.restore.inspect'>>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [configPreview, setConfigPreview] = useState<DataResult<'config.import.inspect'>>(null)
  const refresh = async () => {
    const value = await desktop.data('storage.status', {})
    setStatus(value)
    useWorkspace.setState({ pendingRestore: value.pendingRestore })
  }
  useEffect(() => {
    let active = true
    void desktop
      .data('storage.status', {})
      .then((value) => {
        if (active) setStatus(value)
      })
      .catch(() => {
        if (active) setMessage('本地存储读取失败，请重试；原数据未删除。')
      })
    return () => {
      active = false
    }
  }, [])
  const run = (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    void work()
      .catch(() =>
        setMessage('操作未完成：请检查备份完整性、可用磁盘空间与权限后重试；已有数据保留。'),
      )
      .finally(() => setBusy(false))
  }
  return {
    status,
    preview,
    message,
    busy,
    confirm,
    setConfirm,
    configPreview,
    setConfigPreview,
    exportConfig: () =>
      run(async () => {
        const result = await desktop.data('config.export', {})
        if (result.saved)
          setMessage('配置已导出：包含供应商元数据和应用偏好，不含 Key、诊断报告或会话。')
      }),
    inspectConfig: () =>
      run(async () => setConfigPreview(await desktop.data('config.import.inspect', {}))),
    applyConfig: () =>
      run(async () => {
        if (!configPreview) return
        const result = await desktop.data('config.import.apply', {
          previewId: configPreview.previewId,
        })
        setConfigPreview(null)
        useWorkspace.setState((state) => ({ settingsEpoch: state.settingsEpoch + 1 }))
        await useWorkspace.getState().refresh()
        setMessage(
          `已新增 ${result.imported} 个供应商配置并导入应用偏好；Key 需要重新设置，已有会话绑定保留。`,
        )
      }),
    diagnostics: () =>
      run(async () => {
        const result = await desktop.data('diagnostics.export', {})
        if (result.saved)
          setMessage('诊断已导出：只含版本、计数和状态，不含日志正文、路径或供应商秘密。')
      }),
    refresh: () => run(refresh),
    backup: () =>
      run(async () => {
        const result = await desktop.data('storage.backup', {})
        if (result)
          setMessage(
            `备份已创建：${result.sessions} 个会话、${result.blobs} 个日志/附件，不含密钥。`,
          )
      }),
    inspect: () => run(async () => setPreview(await desktop.data('storage.restore.inspect', {}))),
    cancel: () =>
      run(async () => {
        await desktop.data('storage.restore.cancel', {})
        await refresh()
        setMessage('已取消待恢复操作，当前数据保留。')
      }),
    stage: () =>
      run(async () => {
        if (!preview) return
        await desktop.data('storage.restore.stage', {
          previewId: preview.previewId,
          digest: preview.summary.digest,
        })
        setConfirm(false)
        setPreview(null)
        await refresh()
      }),
  }
}
