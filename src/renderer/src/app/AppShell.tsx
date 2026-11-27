import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useDesktopLayout } from '@/features/desktop/use-layout'
import { useLayoutStore } from '@/features/desktop/layout-store'

export function AppShell({
  sidebar,
  header,
  children,
  isMac,
  scrollKey,
  chatLayout = false,
  projectId,
}: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
  isMac: boolean
  scrollKey: string
  chatLayout?: boolean
  projectId: string | null
}) {
  const { layout, ready, error, patch, flush } = useDesktopLayout(projectId),
    frame = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  const maximum = Math.floor(Math.min(360, Math.max(180, width * 0.3))),
    sidebarWidth = Math.min(layout.sidebar, maximum)
  const change = (value: number) =>
    patch({ sidebar: Math.max(180, Math.min(maximum, Math.round(value))) })
  return (
    <div
      className="desktop-frame"
      ref={frame}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      {isMac && (
        <div className="window-titlebar">
          <span>Devly</span>
        </div>
      )}
      {error && (
        <div className="layout-save-error" role="status">
          {error}
          <Button
            size="sm"
            variant="link"
            onClick={() => void (ready ? flush() : useLayoutStore.getState().load(projectId))}
          >
            重试布局
          </Button>
        </div>
      )}
      <div className="app-shell">
        {sidebar}
        <div
          role="separator"
          tabIndex={0}
          aria-label="调整侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={180}
          aria-valuemax={maximum}
          aria-valuenow={Math.round(sidebarWidth)}
          className="sidebar-resize-handle"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            event.currentTarget.dataset.dragging = 'true'
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              change(event.clientX - (frame.current?.getBoundingClientRect().left ?? 0))
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId)
            delete event.currentTarget.dataset.dragging
            void flush()
          }}
          onPointerCancel={(event) => {
            delete event.currentTarget.dataset.dragging
            void flush()
          }}
          onDoubleClick={() => {
            change(232)
            void flush()
          }}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              change(
                event.key === 'Home'
                  ? 180
                  : event.key === 'End'
                    ? maximum
                    : sidebarWidth + (event.key === 'ArrowLeft' ? -10 : 10),
              )
              void flush()
            }
          }}
        />
        <main className="main-area">
          {header}
          <ScrollArea
            key={scrollKey}
            className={`main-scroll-area ${chatLayout ? 'chat-layout' : ''}`}
            type="auto"
          >
            <div className="main-content">{children}</div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
