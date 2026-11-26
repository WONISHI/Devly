import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, File, Folder, RefreshCw, X } from 'lucide-react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { desktop } from '@/platform/desktop'
import type { FileEntry, FileChange } from '@shared/editor-contracts'
import { useEditorStore, isDirty, documentKey } from './store'
const EditorPane = lazy(() => import('./EditorPane'))
type Page = { entries: FileEntry[]; nextOffset: number | null }
function WorkbenchPanel({ projectId }: { projectId: string }) {
  const state = useEditorStore(),
    section = state.section[projectId] ?? 'files'
  const [pages, setPages] = useState<Record<string, Page>>({}),
    [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [degraded, setDegraded] = useState(false)
  const [changes, setChanges] = useState<{
    available: boolean
    changes: FileChange[]
    truncated: boolean
    reason: string
  } | null>(null)
  const [closing, setClosing] = useState<{ path: string; reload?: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const version = useRef(0),
    alive = useRef(true)
  const requestedCounts = useRef(new Map<string, number>()),
    requests = useRef(new Map<string, number>())
  const documents = Object.values(state.documents).filter(
    (document) => document.projectId === projectId,
  )
  const active = state.active[projectId]
  const openedParents = documents.map(
    (document) => document.path.split('/').slice(0, -1).join('/') || '.',
  )
  const watchPaths = [...new Set(['.', ...expanded, ...openedParents])].slice(0, 64)
  const signature = JSON.stringify(watchPaths)
  const load = useCallback(
    async (path: string, offset = 0) => {
      const current = version.current
      const request = (requests.current.get(path) ?? 0) + 1
      requests.current.set(path, request)
      const count = Math.max(requestedCounts.current.get(path) ?? 100, offset + 100)
      requestedCounts.current.set(path, count)
      let page = await desktop.data('editor.list', { projectId, path, offset })
      // A watcher refresh must retain the directory pages the user already opened.
      while (offset === 0 && page.nextOffset !== null && page.entries.length < count) {
        const next = await desktop.data('editor.list', { projectId, path, offset: page.nextOffset })
        page = { ...next, entries: [...page.entries, ...next.entries] }
      }
      if (alive.current && current === version.current && requests.current.get(path) === request)
        setPages((old) => ({
          ...old,
          [path]:
            offset && old[path]
              ? { ...page, entries: [...old[path].entries, ...page.entries] }
              : page,
        }))
    },
    [projectId],
  )
  const refresh = async () => {
    const current = version.current
    try {
      const paths = JSON.parse(signature) as string[]
      const settled = await Promise.allSettled(paths.map((path) => load(path)))
      const firstFailure = settled.find((item) => item.status === 'rejected')
      await useEditorStore.getState().refresh(projectId)
      const next = await desktop.data('editor.changes', { projectId })
      if (alive.current && current === version.current) {
        setChanges(next)
        setError(
          firstFailure?.status === 'rejected' ? '部分目录已删除或不可用，已刷新其余路径。' : null,
        )
        if (firstFailure)
          setExpanded(
            (previous) =>
              new Set(
                [...previous].filter(
                  (path) =>
                    !paths.some(
                      (failed, index) =>
                        settled[index].status === 'rejected' &&
                        (path === failed || path.startsWith(failed + '/')),
                    ),
                ),
              ),
          )
        setRevision((value) => value + 1)
      }
    } catch (error) {
      if (alive.current && current === version.current)
        setError(error instanceof Error ? error.message : '刷新失败，文件可能已删除')
    }
  }
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })
  useEffect(() => {
    alive.current = true
    version.current++
    const watchId = crypto.randomUUID()
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      previous = -1,
      polls = 0
    const poll = async () => {
      try {
        const snapshot = await desktop.data('editor.observe', {
          projectId,
          watchId,
          paths: JSON.parse(signature) as string[],
        })
        if (stopped) return
        setDegraded(snapshot.degraded)
        if (snapshot.revision !== previous || ++polls % 5 === 0) {
          previous = snapshot.revision
          await refreshRef.current()
        }
      } catch (error) {
        if (!stopped)
          setError(error instanceof Error ? error.message : '目录监听不可用，请手动刷新')
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => {
      stopped = true
      alive.current = false
      clearTimeout(timer)
      void desktop.data('editor.release', { watchId }).catch(() => {})
    }
  }, [projectId, signature])
  const run = (operation: () => Promise<unknown>) => {
    setLoading(true)
    void operation()
      .catch((error) => setError(error instanceof Error ? error.message : '操作失败'))
      .finally(() => setLoading(false))
  }
  const open = (path: string, mode: 'file' | 'git' = 'file') =>
    run(() => state.open(projectId, path, mode))
  function directory(path: string, depth = 0): ReactNode {
    const page = pages[path]
    if (!page) return <p className="editor-tree-note">加载目录…</p>
    return (
      <>
        {page.entries.map((entry) =>
          entry.type === 'directory' ? (
            <div key={entry.path}>
              <Button
                variant="ghost"
                className="editor-tree-row"
                style={{ paddingLeft: 8 + depth * 12 }}
                aria-expanded={expanded.has(entry.path)}
                onClick={() => {
                  const next = new Set(expanded)
                  if (next.has(entry.path)) next.delete(entry.path)
                  else next.add(entry.path)
                  setExpanded(next)
                }}
              >
                {expanded.has(entry.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Folder size={14} />
                <span>{entry.path.split('/').at(-1)}</span>
              </Button>
              {expanded.has(entry.path) && directory(entry.path, depth + 1)}
            </div>
          ) : (
            <Button
              key={entry.path}
              variant="ghost"
              className={`editor-tree-row ${active?.path === entry.path ? 'selected' : ''}`}
              style={{ paddingLeft: 24 + depth * 12 }}
              title={entry.path}
              onClick={() => open(entry.path)}
            >
              <File size={14} />
              <span>{entry.path.split('/').at(-1)}</span>
            </Button>
          ),
        )}
        {page.nextOffset !== null && (
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => run(() => load(path, page.nextOffset!))}
          >
            加载更多文件
          </Button>
        )}
      </>
    )
  }
  async function closeOrReload(save: boolean) {
    if (!closing) return
    if (save && !(await state.save(projectId, closing.path))) return
    if (closing.reload) await state.reload(projectId, closing.path)
    else state.close(projectId, closing.path)
    setClosing(null)
  }
  return (
    <div className="project-editor" aria-label="项目文件工作区">
      <div className="editor-browser-toolbar">
        <Button
          size="sm"
          variant={section === 'files' ? 'secondary' : 'ghost'}
          onClick={() => state.show(projectId, 'files')}
        >
          文件
        </Button>
        <Button
          size="sm"
          variant={section === 'changes' ? 'secondary' : 'ghost'}
          onClick={() => state.show(projectId, 'changes')}
        >
          更改{changes?.available ? ` ${changes.changes.length}` : ''}
        </Button>
        <Button
          aria-label="刷新项目文件"
          size="icon-sm"
          variant="ghost"
          onClick={() => run(refresh)}
        >
          <RefreshCw size={14} />
        </Button>
        <Button
          aria-label="收起文件工作区"
          size="icon-sm"
          variant="ghost"
          onClick={() => state.hide(projectId)}
        >
          <X size={14} />
        </Button>
      </div>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      <PanelGroup direction="vertical" className="editor-body-split">
        <Panel defaultSize={28} minSize={12} maxSize={55}>
          <ScrollArea className="editor-tree-scroll" type="auto">
            {section === 'files' ? (
              directory('.')
            ) : changes?.available ? (
              <div className="editor-changes">
                <p className="editor-tree-note">
                  HEAD → 磁盘；仅项目内且符合忽略/保护规则的路径。
                  {changes.truncated ? '列表达到 1000 项上限。' : ''}
                </p>
                {changes.changes.length ? (
                  changes.changes.map((change) => (
                    <Button
                      key={change.path}
                      className="editor-change-row"
                      variant="ghost"
                      onClick={() => open(change.path, 'git')}
                      title={change.oldPath ? `${change.oldPath} → ${change.path}` : change.path}
                    >
                      <span>{change.path}</span>
                      <span>
                        {
                          (
                            {
                              added: '新增',
                              modified: '修改',
                              deleted: '删除',
                              renamed: '重命名',
                              unmerged: '冲突',
                              other: '类型变化',
                            } as const
                          )[change.kind]
                        }
                      </span>
                    </Button>
                  ))
                ) : (
                  <p className="editor-tree-note">没有符合范围的更改</p>
                )}
              </div>
            ) : (
              <p className="editor-tree-note">
                {changes?.reason === 'non_git'
                  ? '当前不是 Git 项目；文件编辑和未保存内容比较仍可使用。'
                  : 'Git 基线不可用，请检查仓库或系统执行约束。'}
              </p>
            )}
            {degraded && (
              <p className="editor-tree-note">部分目录监听不可用，保留定期与手动刷新。</p>
            )}
          </ScrollArea>
        </Panel>
        <PanelResizeHandle className="editor-resize-horizontal" />
        <Panel minSize={35}>
          <div className="editor-document-area">
            <ScrollArea className="editor-tabs-scroll">
              <div className="editor-tabs" role="tablist" aria-label="已打开文件">
                {documents.map((document) => (
                  <div
                    className={`editor-tab ${active?.path === document.path ? 'selected' : ''}`}
                    key={document.path}
                  >
                    <Button
                      role="tab"
                      aria-selected={active?.path === document.path}
                      variant="ghost"
                      size="sm"
                      title={document.path}
                      onClick={() => open(document.path)}
                    >
                      {document.path.split('/').at(-1)}
                      {isDirty(document) ? ' •' : ''}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`关闭文件 ${document.path}`}
                      disabled={document.saving}
                      onClick={() =>
                        isDirty(document)
                          ? setClosing({ path: document.path })
                          : state.close(projectId, document.path)
                      }
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {active && documents.find((document) => document.path === active.path)?.disk && (
              <Button
                variant="link"
                size="sm"
                className="editor-reload"
                onClick={() => {
                  const document = state.documents[documentKey(projectId, active.path)]
                  if (isDirty(document)) setClosing({ path: active.path, reload: true })
                  else run(() => state.reload(projectId, active.path))
                }}
              >
                重新载入磁盘版本
              </Button>
            )}
            <Suspense fallback={<p className="editor-notice">加载本地编辑器资源…</p>}>
              <EditorPane projectId={projectId} revision={revision} />
            </Suspense>
          </div>
        </Panel>
      </PanelGroup>
      <Dialog open={!!closing} onOpenChange={(open) => !open && setClosing(null)}>
        <DialogContent>
          <DialogTitle>{closing?.reload ? '重新载入文件？' : '关闭未保存的文件？'}</DialogTitle>
          <DialogDescription>
            文件 {closing?.path} 有未保存内容。放弃会丢弃当前缓冲区；磁盘文件不会被删除。
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              继续编辑
            </Button>
            <Button variant="outline" onClick={() => run(() => closeOrReload(false))}>
              放弃未保存内容
            </Button>
            <Button disabled={loading} onClick={() => run(() => closeOrReload(true))}>
              保存后{closing?.reload ? '重新载入' : '关闭'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export function ProjectWorkbench({
  projectId,
  children,
}: {
  projectId: string | null
  children: ReactNode
}) {
  const visible = useEditorStore((state) => (projectId ? state.visible[projectId] : false))
  const panel = useRef<ImperativePanelHandle>(null)
  useEffect(() => {
    if (visible) {
      panel.current?.expand()
      panel.current?.resize(60)
    } else panel.current?.collapse()
  }, [visible])
  if (!projectId) return <>{children}</>
  return (
    <PanelGroup
      direction="horizontal"
      className={`project-workbench ${visible ? 'with-editor' : 'editor-hidden'}`}
    >
      <Panel ref={panel} collapsible collapsedSize={0} minSize={32} defaultSize={visible ? 60 : 0}>
        {visible && <WorkbenchPanel key={projectId} projectId={projectId} />}
      </Panel>
      <PanelResizeHandle className="editor-resize-vertical" disabled={!visible} />
      <Panel minSize={28} defaultSize={visible ? 40 : 100}>
        <div className="workbench-chat">{children}</div>
      </Panel>
    </PanelGroup>
  )
}
