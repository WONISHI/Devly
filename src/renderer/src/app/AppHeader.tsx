import type { RecentProject as Project } from '@shared/data-contracts'
import type { WorkspaceTab } from '@/store'

export function AppHeader({ project, tab }: { project: Project | null; tab: WorkspaceTab }) {
  return (
    <header className="topbar">
      <span>
        {tab === 'providers'
          ? '设置'
          : tab === 'components'
            ? '组件预览'
            : (project?.name ?? '新会话')}
      </span>
    </header>
  )
}
