import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/app/AppHeader'
import { AppShell } from '@/app/AppShell'
import { ComponentPreviewPage } from '@/features/component-preview'
import { ProviderSettingsPage } from '@/features/provider-settings'
import { useEnvironment } from '@/features/environment'
import { WorkspaceSidebar, useOpenProject } from '@/features/workspace'
import { useWorkspace } from '@/store'
import { ChatWorkspace } from '@/features/chat'
import { useCreateProject } from '@/features/workspace/hooks/use-create-project'
import { ProjectWorkbench } from '@/features/editor/ProjectWorkbench'
import { useEditorStore, isDirty } from '@/features/editor/store'
import { DesktopWorkbench } from '@/features/desktop/DesktopWorkbench'

export function App() {
  const state = useWorkspace()
  const { project, tab, setTab } = state
  const openProject = useOpenProject()
  const environmentState = useEnvironment()
  async function newSession() {
    await useWorkspace.getState().newSession()
  }
  const createProject = useCreateProject()

  useEffect(() => {
    void useWorkspace
      .getState()
      .refresh()
      .catch(() => {})
  }, [])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (Object.values(useEditorStore.getState().documents).some(isDirty)) {
        event.preventDefault()
        event.returnValue = false
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
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
      projectId={project && !project.managed ? project.id : null}
      scrollKey={tab}
      chatLayout={tab === 'workspace'}
      isMac={environmentState.isMac}
      sidebar={
        <WorkspaceSidebar
          state={state}
          openProject={openProject}
          newSession={newSession}
          createProject={createProject}
          run={run}
        />
      }
      header={<AppHeader project={project} tab={tab} />}
    >
      {state.loadError && (
        <div className="storage-error" role="alert">
          {state.loadError}
          <Button
            variant="link"
            size="sm"
            disabled={state.loading}
            onClick={() => run(state.reopenStorage)}
          >
            重新连接存储
          </Button>
        </div>
      )}
      {state.storageRecoveryError && (
        <div className="storage-error" role="alert">
          恢复检查未通过，当前保留可读的旧存储；请核对历史后处理备份。
          <Button variant="link" size="sm" onClick={() => state.setSettingsGroup('data')}>
            打开数据与恢复
          </Button>
        </div>
      )}
      {tab === 'workspace' ? (
        <DesktopWorkbench projectId={project && !project.managed ? project.id : null}>
          <ProjectWorkbench projectId={project && !project.managed ? project.id : null}>
            <ChatWorkspace
              key={`${project?.id || 'none'}:${state.activeSession?.id || 'new'}`}
              openProject={openProject}
            />
          </ProjectWorkbench>
        </DesktopWorkbench>
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
