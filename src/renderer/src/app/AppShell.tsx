import type { ReactNode } from 'react'

export function AppShell({
  sidebar,
  header,
  children,
}: {
  sidebar: ReactNode
  header: ReactNode
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      {sidebar}
      <main className="main-area">
        {header}
        {children}
        <footer className="statusbar">
          <span className="flex items-center gap-2">
            <span className="status-dot" />
            工程基础已就绪
          </span>
          <span className="ml-auto">
            UTF-8<span className="mx-4">TypeScript</span>Devly
          </span>
        </footer>
      </main>
    </div>
  )
}
