import type { RecentProject as Project } from '@shared/data-contracts'
import type { WorkspaceTab } from '@/store'
import { Button } from '@/components/ui/button'
import { useEditorStore, isDirty } from '@/features/editor/store'
import { useTerminalWorkspace } from '@/features/terminal/store'

export function AppHeader({ project, tab }: { project: Project | null; tab: WorkspaceTab }) {
  const editor = useEditorStore()
  const dirty = Object.values(editor.documents).filter(isDirty).length
  return (
    <header className="topbar">
      <span>
        {tab === 'providers'
          ? '设置'
          : tab === 'components'
            ? '组件预览'
            : (project?.name ?? '新会话')}
      </span>
      {tab === 'workspace' && project && !project.managed && (
        <div className="workspace-file-actions">
          {dirty > 0 && (
            <span className="editor-draft-count">{dirty} 个未保存（切换项目会保留）</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => editor.show(project.id, 'files')}>
            项目文件
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.show(project.id, 'changes')}>
            项目更改
          </Button>
          <Button variant="ghost" size="sm" onClick={() => editor.show(project.id, 'git')}>
            Git 工作区
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useTerminalWorkspace.getState().show(project.id)}
          >
            交互终端
          </Button>
        </div>
      )}
    </header>
  )
}
