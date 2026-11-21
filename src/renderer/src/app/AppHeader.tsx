import { Code2, Settings2 } from 'lucide-react'
import type { Project } from '@shared/contracts'
import type { WorkspaceTab } from '@/store'

export function AppHeader({ project, tab }: { project: Project | null; tab: WorkspaceTab }) {
  return (
    <header className="topbar">
      <div className="flex items-center gap-2">
        <Code2 size={15} />
        <span>{project?.name ?? '工作台'}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{tab === 'components' ? '组件预览' : '概览'}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="local-badge">LOCAL</span>
        <Settings2 size={15} />
      </div>
    </header>
  )
}
