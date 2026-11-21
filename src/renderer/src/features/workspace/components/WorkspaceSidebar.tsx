import { Blocks, ChevronRight, FolderOpen, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project } from '@shared/contracts'
import type { WorkspaceTab } from '@/store'
import devlyLogo from '../../../../../../resources/branding/devly-logo-dark-v2.png'

type WorkspaceSidebarProps = {
  project: Project | null
  tab: WorkspaceTab
  setTab: (tab: WorkspaceTab) => void
  openProject: () => Promise<void>
}

export function WorkspaceSidebar({ project, tab, setTab, openProject }: WorkspaceSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={devlyLogo} alt="Devly" width={32} height={32} />
        </div>
        <span>
          devly<span className="brand-dot">.</span>
        </span>
        <span className="version-tag">PREVIEW</span>
      </div>
      <Button onClick={openProject} className="open-project" variant="outline">
        <FolderOpen size={15} />
        打开项目
      </Button>
      <div className="nav-label">工作空间</div>
      <button
        className={`nav-item ${tab === 'workspace' ? 'active' : ''}`}
        onClick={() => setTab('workspace')}
      >
        <PanelLeft size={16} />
        项目工作台
        <ChevronRight size={14} className="ml-auto" />
      </button>
      <button
        className={`nav-item ${tab === 'components' ? 'active' : ''}`}
        onClick={() => setTab('components')}
      >
        <Blocks size={16} />
        AI Elements 预览
      </button>
      <div className="nav-label mt-8">当前项目</div>
      {project ? (
        <div className="project-item">
          <FolderOpen size={15} />
          <div>
            <strong>{project.name}</strong>
            <p title={project.path}>{project.path}</p>
          </div>
        </div>
      ) : (
        <div className="sidebar-empty">
          打开本地文件夹
          <br />
          开始构建你的下一个想法
        </div>
      )}
      <div className="sidebar-footer">
        <span className="status-dot" />
        本地工作空间<span className="ml-auto text-muted-foreground">v0.1.0</span>
      </div>
    </aside>
  )
}
