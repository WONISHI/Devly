import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import type { DataArgs, DataResult } from '@shared/data-contracts'
export function useMcp(projectId: string) {
  const [items, setItems] = useState<DataResult<'mcp.servers'>>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [test, setTest] = useState<DataResult<'mcp.connect'> | null>(null)
  useEffect(() => {
    let active = true
    void desktop
      .data('mcp.servers', { projectId })
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setMessage('读取 MCP 配置失败，请重新打开分组')
      })
    return () => {
      active = false
    }
  }, [projectId])
  async function run<T>(work: () => Promise<T>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await work()
      setItems(await desktop.data('mcp.servers', { projectId }))
      return result
    } catch {
      setMessage('MCP 操作失败，请检查地址、系统凭据与本地存储；未自动重试外部操作')
    } finally {
      setBusy(false)
    }
  }
  return {
    items,
    busy,
    message,
    test,
    setTest,
    save: (input: Omit<DataArgs<'mcp.save'>, 'projectId'>) =>
      run(async () => {
        const result = await desktop.data('mcp.save', { ...input, projectId })
        setTest(null)
        setMessage('配置已保存；连接和工具能力需要单独检查')
        return result
      }),
    connect: (serverId: string) =>
      run(async () => setTest(await desktop.data('mcp.connect', { projectId, serverId }))),
    key: (serverId: string, clear = false) =>
      run(async () => {
        setTest(null)
        const result = await desktop.data(clear ? 'mcp.credentials.clear' : 'mcp.credentials.set', {
          projectId,
          serverId,
        })
        setMessage(
          clear
            ? '已清除凭据'
            : 'saved' in result && result.saved
              ? '凭据已受系统保护保存'
              : '未更改凭据',
        )
      }),
    remove: (serverId: string) =>
      run(async () => {
        await desktop.data('mcp.remove', { projectId, serverId })
        setTest(null)
        setMessage('已移除 MCP 配置和凭据引用')
      }),
  }
}
