import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import type { DataResult, DataArgs } from '@shared/data-contracts'
export function useTasks(projectId: string) {
  const [tasks, setTasks] = useState<DataResult<'tasks.list'>>([]),
    [workspaces, setWorkspaces] = useState<DataResult<'workspaces.list'>>([]),
    [review, setReview] = useState<DataResult<'workspaces.review'> | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const [t, w] = await Promise.all([
          desktop.data('tasks.list', { projectId }),
          desktop.data('workspaces.list', { projectId }),
        ])
        if (active) {
          setTasks(t)
          setWorkspaces(w)
        }
      } catch {
        if (active) setMessage('读取失败，请检查项目是否为 Git 根目录和本地存储')
      } finally {
        if (active) timer = setTimeout(() => void poll(), 1000)
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
    } catch {
      setMessage('操作未完成，请重新读取并检查目录、权限或 Git 状态；已有文件保留')
    } finally {
      setBusy(false)
    }
  }
  return {
    tasks,
    workspaces,
    review,
    setReview,
    busy,
    message,
    start: (input: Omit<DataArgs<'tasks.start'>, 'projectId'>) =>
      run(async () => {
        await desktop.data('tasks.start', { ...input, projectId })
        setMessage('已创建独立会话并加入任务队列')
      }),
    create: () =>
      run(async () => {
        await desktop.data('workspaces.create', { projectId })
        setWorkspaces(await desktop.data('workspaces.list', { projectId }))
        setMessage('已基于当前 HEAD 创建隔离 worktree；主工作区未提交内容未复制')
      }),
    inspect: (workspaceId: string) =>
      run(async () =>
        setReview(await desktop.data('workspaces.review', { projectId, workspaceId })),
      ),
    action: (
      operation: 'workspaces.commit' | 'workspaces.merge' | 'workspaces.remove',
      message: string,
    ) =>
      run(async () => {
        if (!review) return
        const result = await desktop.data(operation, {
          projectId,
          workspaceId: review.workspace.id,
          token: review.token,
          ...(operation === 'workspaces.commit' ? { message } : {}),
        } as never)
        setMessage(result.message)
        setReview(null)
      }),
    cancel: (task: DataResult<'tasks.list'>[number]) =>
      run(async () => {
        await desktop.data('chat.cancel', {
          projectId: task.projectId,
          sessionId: task.sessionId,
          turnId: task.id,
        })
        setMessage('已请求停止；请等待实际回合收尾状态')
      }),
    open: (task: DataResult<'tasks.list'>[number]) =>
      run(async () => {
        await desktop.data('tasks.open', { projectId, turnId: task.id })
        await useWorkspace.getState().refresh()
        useWorkspace.getState().setTab('workspace')
      }),
  }
}
