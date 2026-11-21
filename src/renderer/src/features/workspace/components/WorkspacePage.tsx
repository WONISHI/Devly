import { ArrowUp, ChevronDown, FolderOpen } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { Project } from '@shared/contracts'

type WorkspacePageProps = {
  sessionTitle?: string
  project: Project | null
  openProject: () => Promise<void>
  openProviders: () => void
}

export function WorkspacePage({
  project,
  openProject,
  openProviders,
  sessionTitle,
}: WorkspacePageProps) {
  return (
    <section className="task-page" aria-labelledby="task-title">
      <div className="task-start">
        <h1 id="task-title">{sessionTitle ?? '今天想完成什么？'}</h1>
        <div className="task-composer">
          <Textarea
            className="task-input"
            aria-label="任务输入"
            placeholder="描述你想完成的任务…"
            rows={3}
            disabled
          />
          <div className="task-toolbar">
            <Button
              variant="ghost"
              size="sm"
              onClick={openProject}
              aria-label="选择项目"
              className="task-project-selector"
            >
              <FolderOpen size={15} />
              <span>{project?.name ?? '选择项目'}</span>
              <ChevronDown size={12} />
            </Button>
            <div className="task-model-controls">
              <Button variant="ghost" size="sm" onClick={openProviders} aria-label="选择模型">
                选择模型
                <ChevronDown size={12} />
              </Button>
              <Button size="icon" disabled aria-label="对话功能待接入" className="task-send">
                <ArrowUp size={17} />
              </Button>
            </div>
          </div>
        </div>
        <p className="task-availability">可在设置中检查模型连接，聊天功能待接入</p>
      </div>
    </section>
  )
}
