import {
  Archive,
  ArchiveRestore,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  Pencil,
  Plus,
  Settings2,
  SquarePen,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Session } from '@shared/data-contracts'
import type { useWorkspace } from '@/store'
import devlyLogo from '../../../../../../resources/branding/devly-logo-dark-v2.png'

type State = ReturnType<typeof useWorkspace.getState>
type Props = {
  state: State
  openProject: () => Promise<void>
  newSession: () => Promise<void>
  createProject: () => Promise<void>
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
          <Input
            aria-label="会话名称"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
            }}
            autoFocus
          />
          <Button
            variant="ghost"
            type="button"
            size="icon"
            className="rename-cancel"
            aria-label="取消重命名"
            onClick={() => setEditing(false)}
          >
            <X size={12} />
          </Button>
        </form>
      ) : (
        <>
          <Button
            variant="ghost"
            type="button"
            className="session-title"
            aria-current={state.activeSession?.id === session.id ? 'page' : undefined}
            onClick={() => run(() => state.selectSession(session.id))}
            title={session.title}
          >
            <MessageSquare size={13} />
            <span>{session.title}</span>
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="row-action"
            aria-label={`重命名 ${session.title}`}
            onClick={() => {
              setTitle(session.title)
              setEditing(true)
            }}
          >
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="row-action"
            aria-label={`${session.archived ? '恢复' : '归档'} ${session.title}`}
            onClick={() => run(() => state.archiveSession(session.id, !session.archived))}
          >
            {session.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </Button>
        </>
      )}
    </div>
  )
}
export function WorkspaceSidebar({ state, openProject, newSession, createProject, run }: Props) {
  const [creating, setCreating] = useState(false)
  async function createSession() {
    if (creating) return
    setCreating(true)
    try {
      await newSession()
    } finally {
      setCreating(false)
    }
  }
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
      <Button
        variant="ghost"
        type="button"
        className="nav-item new-session-button"
        disabled={creating || state.loading || !!state.loadError}
        onClick={() => run(createSession)}
      >
        <SquarePen size={16} />
        {creating ? '正在新建…' : '新聊天'}
      </Button>
      <section className="project-section" aria-label="项目">
        <div className="project-section-heading">
          <span>项目</span>
          <div className="sidebar-section-actions">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => run(createProject)}
              aria-label="新建项目"
              title="创建项目文件夹"
            >
              <FolderPlus size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={openProject}
              aria-label="打开项目"
              title="打开已有项目"
            >
              <Plus size={15} />
            </Button>
          </div>
        </div>
        <ScrollArea className="project-scroll-area" type="auto">
          <div className="project-list">
            {state.projects
              .filter((project) => !project.managed)
              .map((project) => (
                <div
                  className={`project-row ${project.id === state.project?.id ? 'selected' : ''}`}
                  key={project.id}
                >
                  <Button
                    variant="ghost"
                    type="button"
                    className="project-item"
                    aria-pressed={project.id === state.project?.id}
                    onClick={() => run(() => state.selectProject(project.id))}
                    title={project.path}
                  >
                    <FolderOpen size={15} />
                    <span>{project.name}</span>
                    {!project.available && <span className="path-invalid">路径失效</span>}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    className="row-action"
                    aria-label={`移除项目 ${project.name}`}
                    title="仅移除记录，保留文件"
                    onClick={() => run(() => state.removeProject(project.id))}
                  >
                    <X size={13} />
                  </Button>
                </div>
              ))}
          </div>
          {!state.projects.some((project) => !project.managed) && (
            <p className="sidebar-empty">{state.loading ? '加载中…' : '未打开项目'}</p>
          )}
        </ScrollArea>
      </section>
      <section className="session-section" aria-label="最近聊天">
        <div className="project-section-heading">
          <span>{state.archived ? '已归档聊天' : '最近'}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={state.archived ? '查看活动会话' : '查看已归档会话'}
            disabled={state.loading}
            onClick={() => run(() => state.showArchived(!state.archived))}
          >
            {state.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </Button>
        </div>
        <p className="session-scope">所有项目的最近聊天</p>
        <ScrollArea className="session-scroll-area" type="auto">
          <div className="session-list">
            {state.sessions.map((session) => (
              <SessionRow key={session.id} session={session} state={state} run={run} />
            ))}
            {!state.sessions.length && (
              <p className="sidebar-empty">
                {!state.project
                  ? '还没有会话'
                  : state.archived
                    ? '暂无归档会话'
                    : '暂无会话，点击上方新建'}
              </p>
            )}
            {state.nextCursor && (
              <Button
                variant="ghost"
                type="button"
                className="load-more"
                onClick={() => run(state.loadMore)}
              >
                加载更多
              </Button>
            )}
          </div>
        </ScrollArea>
      </section>
      <div className="sidebar-footer">
        <Button
          variant="ghost"
          type="button"
          className={`nav-item ${state.tab === 'providers' ? 'active' : ''}`}
          onClick={() => state.setTab('providers')}
          aria-label="打开设置"
        >
          <Settings2 size={16} />
          设置
        </Button>
      </div>
    </aside>
  )
}
