import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import type { DataResult } from '@shared/data-contracts'
export function useSkills(projectId: string) {
  const [items, setItems] = useState<DataResult<'skills.discover'>>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void desktop
      .data('skills.discover', { projectId })
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setMessage('扫描失败，请检查项目与 Skill 文件权限')
      })
    return () => {
      active = false
    }
  }, [projectId])
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await work()
      setItems(await desktop.data('skills.discover', { projectId }))
    } catch {
      setMessage('Skill 已变化或操作失败，请重新扫描和查看；没有自动接受变更内容')
    } finally {
      setBusy(false)
    }
  }
  return {
    items,
    busy,
    message,
    scan: () => run(async () => {}),
    toggle: (item: DataResult<'skills.discover'>[number], enabled: boolean) =>
      run(async () => {
        const entries = items
          .filter((s) => s.enabled && !s.changed && s.path !== item.path)
          .map((s) => ({ path: s.path, hash: s.hash }))
        if (enabled) entries.push({ path: item.path, hash: item.hash })
        await desktop.data('skills.select', { projectId, entries })
        setMessage('已保存项目 Skills；未重新审查的变更项已停用，脚本不会自动执行')
      }),
  }
}
