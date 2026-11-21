import type { ReactNode } from 'react'

export function AppShell({
  sidebar,
  header,
  children,
  isMac,
}: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
  isMac: boolean
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
          {children}
        </main>
      </div>
    </div>
  )
}
