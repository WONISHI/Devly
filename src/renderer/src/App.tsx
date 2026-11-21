import { AppHeader } from '@/app/AppHeader'
import { AppShell } from '@/app/AppShell'
import { ComponentPreviewPage } from '@/features/component-preview'
import { useEnvironment } from '@/features/environment'
import { WorkspacePage, WorkspaceSidebar, useOpenProject } from '@/features/workspace'
import { useWorkspace } from '@/store'

export function App() {
  const project = useWorkspace((state) => state.project)
  const tab = useWorkspace((state) => state.tab)
  const setTab = useWorkspace((state) => state.setTab)
  const openProject = useOpenProject()
  const environmentState = useEnvironment()

  return (
    <AppShell
      sidebar={
        <WorkspaceSidebar project={project} tab={tab} setTab={setTab} openProject={openProject} />
      }
      header={<AppHeader project={project} tab={tab} />}
    >
      {tab === 'workspace' ? (
        <WorkspacePage
          project={project}
          openProject={openProject}
          showComponents={() => setTab('components')}
          environmentState={environmentState}
        />
      ) : (
        <ComponentPreviewPage onClose={() => setTab('workspace')} />
      )}
    </AppShell>
  )
}
