import type { Project } from '@shared/contracts'
import type { WorkspaceTab } from '@/store'

export function AppHeader({ project, tab }: { project: Project | null; tab: WorkspaceTab }) {
  return (
    <header className="topbar">
      <span>
        {tab === 'providers'
          ? '设置'
          : tab === 'components'
            ? '组件预览'
            : (project?.name ?? '新任务')}
      </span>
    </header>
  )
}
