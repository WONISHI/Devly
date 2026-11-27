import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import type { ContextRecord } from '@shared/extension-contracts'
export function useProjectContext(projectId: string) {
  const [items, setItems] = useState<ContextRecord[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void desktop
      .data('project.context.list', { projectId })
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setError('读取项目上下文失败，请重新进入此分组')
      })
    return () => {
      active = false
    }
  }, [projectId])
  async function run<T>(work: () => Promise<T>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await work()
      setItems(await desktop.data('project.context.list', { projectId }))
      return result
    } catch {
      setError('操作失败，请检查内容、项目归属与本地存储；原记录保留')
    } finally {
      setBusy(false)
    }
  }
  return {
    items,
    error,
    busy,
    save: (
      input: Omit<ContextRecord, 'source' | 'updatedAt' | 'projectId' | 'id'> & { id?: string },
    ) => run(() => desktop.data('project.context.save', { ...input, projectId })),
    remove: (id: string) => run(() => desktop.data('project.context.remove', { projectId, id })),
  }
}
