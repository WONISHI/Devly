import {
  Archive,
  ArchiveRestore,
  FolderOpen,
  Pencil,
  Plus,
  Settings2,
  SquarePen,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Session } from '@shared/data-contracts'
import type { useWorkspace } from '@/store'
import devlyLogo from '../../../../../../resources/branding/devly-logo-dark-v2.png'

type State = ReturnType<typeof useWorkspace.getState>
type Props = {
  state: State
  openProject: () => Promise<void>
  run: (operation: () => Promise<void>) => void
}
function SessionRow({
  session,
  state,
  run,
}: {
  session: Session
  state: State
  run: Props['run']
}) {
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(session.title)
  return (
    <div className={`session-row ${state.activeSession?.id === session.id ? 'selected' : ''}`}>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!title.trim()) return
            run(async () => {
              await state.renameSession(session.id, title.trim())
              setEditing(false)
            })
          }}
        >
          <input
            aria-label="会话名称"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
            }}
            autoFocus
          />
          <button type="button" aria-label="取消重命名" onClick={() => setEditing(false)}>
            <X size={12} />
          </button>
        </form>
      ) : (
        <>
          <button
            className="session-title"
            onClick={() => run(() => state.selectSession(session.id))}
            title={session.title}
          >
            {session.title}
          </button>
          <button
            className="row-action"
            aria-label={`重命名 ${session.title}`}
            onClick={() => {
              setTitle(session.title)
              setEditing(true)
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            className="row-action"
            aria-label={`${session.archived ? '恢复' : '归档'} ${session.title}`}
            onClick={() => run(() => state.archiveSession(session.id, !session.archived))}
          >
            {session.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
        </>
      )}
    </div>
  )
}
export function WorkspaceSidebar({ state, openProject, run }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={devlyLogo} alt="Devly" width={24} height={24} />
        </div>
        <span>
          devly<span className="brand-dot">.</span>
        </span>
      </div>
      <button
        className={`nav-item ${state.tab === 'workspace' ? 'active' : ''}`}
        disabled={state.loading || !!state.loadError}
        onClick={() => run(state.newSession)}
      >
        <SquarePen size={16} />
        新任务
      </button>
      <div className="project-section-heading">
        <span>项目</span>
        <Button variant="ghost" size="icon" onClick={openProject} aria-label="打开项目">
          <Plus size={15} />
        </Button>
      </div>
      <div className="project-list">
        {state.projects.map((project) => (
          <div
            className={`project-row ${project.id === state.project?.id ? 'selected' : ''}`}
            key={project.id}
          >
            <button
              className="project-item"
              onClick={() => run(() => state.selectProject(project.id))}
              title={project.path}
            >
              <FolderOpen size={15} />
              <span>{project.name}</span>
              {!project.available && <span className="path-invalid">路径失效</span>}
            </button>
            <button
              className="row-action"
              aria-label={`移除项目 ${project.name}`}
              title="仅移除记录，保留文件"
              onClick={() => run(() => state.removeProject(project.id))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {!state.projects.length && (
        <p className="sidebar-empty">{state.loading ? '加载中…' : '未打开项目'}</p>
      )}
      {state.project && (
        <section className="session-section" aria-label="项目会话">
          <div className="project-section-heading">
            <span>{state.archived ? '已归档' : '会话'}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={state.archived ? '查看活动会话' : '查看已归档会话'}
              onClick={() => run(() => state.showArchived(!state.archived))}
            >
              {state.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </Button>
          </div>
          <div className="session-list">
            {state.sessions.map((session) => (
              <SessionRow key={session.id} session={session} state={state} run={run} />
            ))}
            {!state.sessions.length && (
              <p className="sidebar-empty">{state.archived ? '暂无归档' : '暂无会话'}</p>
            )}
            {state.nextCursor && (
              <button className="load-more" onClick={() => run(state.loadMore)}>
                加载更多
              </button>
            )}
          </div>
        </section>
      )}
      <div className="sidebar-footer">
        <button
          className={`nav-item ${state.tab === 'providers' ? 'active' : ''}`}
          onClick={() => state.setTab('providers')}
          aria-label="打开设置"
        >
          <Settings2 size={16} />
          设置
        </button>
      </div>
    </aside>
  )
}
