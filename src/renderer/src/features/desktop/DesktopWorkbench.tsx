import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels'
import { useTerminalWorkspace } from '@/features/terminal/store'
import { useEditorStore } from '@/features/editor/store'
import { useDesktopLayout } from './use-layout'
import { currentLayout } from './layout-store'
const TerminalPanel = lazy(() => import('@/features/terminal/TerminalPanel'))
export function DesktopWorkbench({
  projectId,
  children,
}: {
  projectId: string | null
  children: ReactNode
}) {
  const visible = useTerminalWorkspace((state) => (projectId ? state.visible[projectId] : false)),
    panel = useRef<ImperativePanelHandle>(null)
  const { layout, ready, patch, flush } = useDesktopLayout(projectId)
  const element = useRef<HTMLDivElement>(null),
    [height, setHeight] = useState(800)
  useEffect(() => {
    if (!element.current) return
    const observer = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height || 800),
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [projectId])
  useEffect(() => {
    if (projectId && ready) {
      const saved = currentLayout(projectId)
      useTerminalWorkspace.setState((state) => ({
        visible: { ...state.visible, [projectId]: saved.showTerminal },
      }))
      useEditorStore.setState((state) => ({
        visible: { ...state.visible, [projectId]: saved.showEditor },
      }))
    }
  }, [projectId, ready])
  const minTerminal = Math.min(30, Math.max(18, (150 / height) * 100)),
    minMain = Math.min(100 - minTerminal, Math.max(35, (420 / height) * 100)),
    maxTerminal = 100 - minMain
  useEffect(() => {
    if (visible) {
      panel.current?.expand()
      const area = element.current?.clientHeight || 800,
        min = Math.min(30, Math.max(18, (150 / area) * 100)),
        max = 100 - Math.min(100 - min, Math.max(35, (420 / area) * 100))
      panel.current?.resize(Math.max(min, Math.min(max, currentLayout(projectId).terminal)))
    } else panel.current?.collapse()
  }, [visible, projectId, ready])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!projectId || event.isComposing || event.repeat || (!event.metaKey && !event.ctrlKey))
        return
      if (event.key.toLowerCase() === 'j' && !event.shiftKey) {
        event.preventDefault()
        const opening = !useTerminalWorkspace.getState().visible[projectId]
        useTerminalWorkspace.getState().toggle(projectId)
        setTimeout(() => {
          if (!opening) {
            document.querySelector<HTMLTextAreaElement>('[aria-label="任务输入"]')?.focus()
            return
          }
          const host = document.querySelector('.interactive-terminal-host')
          if (host) host.dispatchEvent(new Event('devly:focus-terminal'))
          else document.querySelector<HTMLElement>('.terminal-toolbar button')?.focus()
        }, 100)
      }
      if (event.key.toLowerCase() === 'l' && !event.shiftKey) {
        event.preventDefault()
        document.querySelector<HTMLTextAreaElement>('[aria-label="任务输入"]')?.focus()
      }
      if (event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        useEditorStore.getState().show(projectId, 'files')
        setTimeout(
          () => document.querySelector<HTMLElement>('.editor-browser-toolbar button')?.focus(),
          50,
        )
      }
      if (event.shiftKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        useEditorStore.getState().show(projectId, 'git')
        setTimeout(
          () => document.querySelector<HTMLElement>('.editor-browser-toolbar button')?.focus(),
          50,
        )
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [projectId])
  if (!projectId) return <>{children}</>
  return (
    <div ref={element} className="desktop-workbench">
      <PanelGroup
        direction="vertical"
        className="desktop-workbench"
        onLayout={(sizes) => {
          if (visible && ready && sizes[1] >= 18) patch({ terminal: Math.min(65, sizes[1]) })
        }}
      >
        <Panel minSize={minMain} defaultSize={visible ? 100 - layout.terminal : 100}>
          {children}
        </Panel>
        <PanelResizeHandle
          className="editor-resize-horizontal terminal-resize"
          disabled={!visible}
          aria-label="调整终端高度"
          onDragging={(dragging) => {
            if (!dragging) void flush()
          }}
        />
        <Panel
          ref={panel}
          collapsible
          collapsedSize={0}
          minSize={minTerminal}
          maxSize={maxTerminal}
          defaultSize={visible ? layout.terminal : 0}
        >
          {visible && (
            <Suspense fallback={<p>加载本地终端…</p>}>
              <TerminalPanel
                key={projectId}
                projectId={projectId}
                onHide={() => useTerminalWorkspace.getState().hide(projectId)}
              />
            </Suspense>
          )}
        </Panel>
      </PanelGroup>
    </div>
  )
}
