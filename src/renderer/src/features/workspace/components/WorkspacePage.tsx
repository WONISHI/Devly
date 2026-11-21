import { ArrowUp, Blocks, ChevronRight, FolderOpen, Plus, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnvironmentPanel, type useEnvironment } from '@/features/environment'
import type { Project } from '@shared/contracts'

type WorkspacePageProps = {
  project: Project | null
  openProject: () => Promise<void>
  showComponents: () => void
  environmentState: ReturnType<typeof useEnvironment>
}

export function WorkspacePage({
  project,
  openProject,
  showComponents,
  environmentState,
}: WorkspacePageProps) {
  return (
    <div className="workspace-content">
      <div className="eyebrow">
        <span className="status-dot" /> YOUR LOCAL CODING WORKSPACE
      </div>
      <h1>
        从一个想法，
        <br />
        <span>到下一次提交。</span>
      </h1>
      <p className="intro">
        在自己的工作空间里，与 AI 一起构建。
        <br />
        工程基础已就绪，Codex 对话与工具执行将在后续阶段接入。
      </p>
      <div className="composer">
        <div className="composer-input text-muted-foreground">你想在这个项目中实现什么？</div>
        <div className="composer-toolbar">
          <span className="flex items-center gap-2">
            <Plus size={16} />
            <span className="text-xs">Codex · 尚未连接</span>
          </span>
          <Button size="icon" disabled aria-label="对话功能待接入">
            <ArrowUp size={16} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button variant="outline" onClick={openProject}>
          <FolderOpen size={14} />
          {project ? '切换项目' : '打开本地项目'}
        </Button>
        <Button variant="ghost" onClick={showComponents}>
          <Blocks size={14} />
          查看 AI 组件
          <ChevronRight size={14} />
        </Button>
      </div>
      <EnvironmentPanel {...environmentState} />
      <div className="milestone">
        <Zap size={16} />
        <span>当前阶段：工程初始化</span>
        <span className="ml-auto text-muted-foreground">Electron + React + AI Elements</span>
      </div>
    </div>
  )
}
