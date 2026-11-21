import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

export function AppShell({
  sidebar,
  header,
  children,
  isMac,
  scrollKey,
}: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
  isMac: boolean
  scrollKey: string
}) {
  return (
    <div className="desktop-frame">
      {isMac && (
        <div className="window-titlebar">
          <span>Devly</span>
        </div>
      )}
      <div className="app-shell">
        {sidebar}
        <main className="main-area">
          {header}
          <ScrollArea key={scrollKey} className="main-scroll-area" type="auto">
            <div className="main-content">{children}</div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
