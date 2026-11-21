import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/app/AppHeader'
import { AppShell } from '@/app/AppShell'
import { ComponentPreviewPage } from '@/features/component-preview'
import { ProviderSettingsPage } from '@/features/provider-settings'
import { useEnvironment } from '@/features/environment'
import { WorkspacePage, WorkspaceSidebar, useOpenProject } from '@/features/workspace'
import { useWorkspace } from '@/store'

export function App() {
  const state = useWorkspace()
  const { project, tab, setTab } = state
  const openProject = useOpenProject()
  const environmentState = useEnvironment()

  useEffect(() => {
    void useWorkspace
      .getState()
      .refresh()
      .catch(() => {})
  }, [])
  useEffect(() => {
    const theme = state.project ? state.projectSettings.theme : state.settings.theme
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [state.project, state.projectSettings.theme, state.settings.theme])
  const run = (operation: () => Promise<void>) => {
    void operation().catch((error) =>
      toast.error(error instanceof Error ? error.message : '操作失败'),
    )
  }
  return (
    <AppShell
      scrollKey={tab}
      isMac={environmentState.isMac}
      sidebar={<WorkspaceSidebar state={state} openProject={openProject} run={run} />}
      header={<AppHeader project={project} tab={tab} />}
    >
      {state.loadError && (
        <div className="storage-error" role="alert">
          {state.loadError}
          <Button variant="link" size="sm" onClick={() => run(state.refresh)}>
            重试
          </Button>
        </div>
      )}
      {tab === 'workspace' ? (
        <WorkspacePage
          sessionTitle={state.activeSession?.title}
          project={project}
          openProject={openProject}
          openProviders={() => setTab('providers')}
        />
      ) : tab === 'providers' ? (
        <ProviderSettingsPage
          onClose={() => setTab('workspace')}
          onShowComponents={() => setTab('components')}
          environmentState={environmentState}
        />
      ) : (
        <ComponentPreviewPage onClose={() => setTab('providers')} />
      )}
    </AppShell>
  )
}
