import { SchedulesPanel } from '@/features/extensions/SchedulesPanel'
import { SkillsPanel } from '@/features/extensions/SkillsPanel'
import { WebPanel } from '@/features/extensions/WebPanel'
import { PreviewPanel } from '@/features/extensions/PreviewPanel'
import { McpPanel } from '@/features/extensions/McpPanel'
import { TaskPanel } from '@/features/extensions/TaskPanel'
import { ProjectContextPanel } from '@/features/extensions/ProjectContextPanel'
import { DataSettingsPanel } from './DataSettingsPanel'
import { UsagePanel } from './UsagePanel'
import { useRef, useState } from 'react'
import { SettingsEditor } from './SettingsEditor'
import { savePreferences, exportPreferences } from './hooks'
import { ProviderManager } from './ProviderManager'
import { SettingsGroup, type SettingsGroupId } from './SettingsGroup'
import { useWorkspace } from '@/store'
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Blocks,
  Bot,
  ChevronRight,
  Code2,
  Database,
  Palette,
  PlugZap,
  ShieldCheck,
} from 'lucide-react'
import { SelectField } from '@/components/forms/SelectField'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { EnvironmentPanel, type useEnvironment } from '@/features/environment'

const groups = [
  { id: 'schedules', label: '本地定时任务', icon: Blocks },
  { id: 'preview', label: '网页预览', icon: Blocks },
  { id: 'web', label: '网页工具', icon: PlugZap },
  { id: 'providers', label: '模型供应商', icon: PlugZap },
  { id: 'usage', label: '用量与额度', icon: ChartNoAxesCombined },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'models', label: '默认模型', icon: Bot },
  { id: 'permissions', label: '权限与限额', icon: ShieldCheck },
  { id: 'skills', label: 'Skills', icon: Blocks },
  { id: 'mcp', label: 'MCP 工具', icon: PlugZap },
  { id: 'tasks', label: '任务与隔离', icon: Blocks },
  { id: 'context', label: '项目上下文', icon: Blocks },
  { id: 'data', label: '数据与恢复', icon: Database },
  { id: 'developer', label: '开发者', icon: Code2 },
] as const

type ProviderSettingsProps = {
  onClose: () => void
  onShowComponents: () => void
  environmentState: ReturnType<typeof useEnvironment>
}

export function ProviderSettingsPage({
  onClose,
  onShowComponents,
  environmentState,
}: ProviderSettingsProps) {
  const state = useWorkspace()
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const activeGroup = state.settingsGroup
  const pageRef = useRef<HTMLDivElement>(null)
  const settings = scope === 'project' ? state.projectSettings : state.settings
  const preferenceGroup =
    activeGroup === 'appearance' || activeGroup === 'models' || activeGroup === 'permissions'
      ? activeGroup
      : null
  function goToGroup(id: SettingsGroupId) {
    const page = pageRef.current
    const viewport = page?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    state.setSettingsGroup(id)
    viewport?.scrollTo({ top: 0, behavior: 'instant' })
  }
  return (
    <div className="settings-page" ref={pageRef}>
      <div className="settings-heading">
        <h1>设置</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={15} />
          返回工作台
        </Button>
      </div>
      <div className="settings-layout">
        <nav className="settings-group-nav" aria-label="设置分组">
          {groups.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className="settings-group-link"
              aria-pressed={activeGroup === id}
              aria-controls={activeGroup === id ? `settings-group-${id}` : undefined}
              onClick={() => goToGroup(id)}
            >
              <Icon size={16} />
              {label}
            </Button>
          ))}
        </nav>
        <div className="settings-group-content">
          {activeGroup === 'schedules' && (
            <SettingsGroup
              id="schedules"
              title="本地定时任务"
              description="明确启用的项目只读任务、执行范围与运行记录。"
            >
              {state.project && !state.project.managed ? (
                <SchedulesPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>先打开项目再配置本地任务。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'preview' && (
            <SettingsGroup
              id="preview"
              title="隔离网页预览"
              description="静态项目入口、独立窗口与临时端口生命周期。"
            >
              {state.project && !state.project.managed ? (
                <PreviewPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>先打开项目再启动预览。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'web' && (
            <SettingsGroup
              id="web"
              title="网页搜索与抓取"
              description="独立搜索凭据、明确的网络传输和逐次审批。"
            >
              {state.project && !state.project.managed ? (
                <WebPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>先打开项目再配置网页工具。</p>
              )}
            </SettingsGroup>
          )}
          <SettingsGroup
            id="providers"
            title="模型供应商"
            description="管理 API 地址、密钥和模型，检查连接状态。"
            hidden={activeGroup !== 'providers'}
          >
            <ProviderManager />
          </SettingsGroup>
          {activeGroup === 'skills' && (
            <SettingsGroup
              id="skills"
              title="项目 Skills"
              description="查看真实技能内容、启用范围与关联资源。"
            >
              {state.project && !state.project.managed ? (
                <SkillsPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>请先打开本地项目。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'mcp' && (
            <SettingsGroup
              id="mcp"
              title="MCP 工具服务"
              description="管理当前项目的外部工具与受保护凭据。"
            >
              {state.project && !state.project.managed ? (
                <McpPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>请先打开本地项目。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'tasks' && (
            <SettingsGroup
              id="tasks"
              title="任务与隔离工作区"
              description="创建独立任务，查看队列并审查 worktree 差异。"
            >
              {state.project && !state.project.managed ? (
                <TaskPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>请先打开本地项目。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'context' && (
            <SettingsGroup
              id="context"
              title="项目指令与记忆"
              description="查看、编辑或移除当前项目的持久记录。"
            >
              {state.project && !state.project.managed ? (
                <ProjectContextPanel key={state.project.id} projectId={state.project.id} />
              ) : (
                <p>请先打开本地项目，再管理项目上下文。</p>
              )}
            </SettingsGroup>
          )}
          {activeGroup === 'data' && (
            <SettingsGroup
              id="data"
              title="数据与恢复"
              description="备份本地历史并检查恢复条件；密钥需要单独重新配置。"
            >
              <DataSettingsPanel />
            </SettingsGroup>
          )}
          {activeGroup === 'usage' && (
            <SettingsGroup
              id="usage"
              title="用量与额度"
              description="查看本机 Token 消耗、本地预算与可查询的账户余额。"
            >
              <UsagePanel />
            </SettingsGroup>
          )}
          {preferenceGroup && (
            <div className="settings-scope">
              <span>设置范围</span>
              <SelectField
                label="设置范围"
                value={scope}
                onValueChange={(value) => setScope(value as typeof scope)}
                options={[
                  { value: 'global', label: '应用默认值' },
                  { value: 'project', label: '当前项目', disabled: !state.project },
                ]}
              />
            </div>
          )}
          <SettingsEditor
            onExport={() => exportPreferences(scope === 'project' ? state.project!.id : null)}
            key={`${state.settingsEpoch}:${scope}:${state.project?.id ?? 'global'}`}
            value={settings}
            activeGroup={preferenceGroup}
            providers={state.providers}
            onSave={(value) =>
              savePreferences(scope === 'project' ? state.project!.id : null, value)
            }
          />
          <SettingsGroup
            id="developer"
            title="开发者"
            description="查看环境诊断和 AI 组件预览。"
            hidden={activeGroup !== 'developer'}
          >
            <Collapsible className="developer-options">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" type="button" className="developer-trigger">
                  开发者选项
                  <ChevronRight size={14} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="developer-content">
                <EnvironmentPanel {...environmentState} />
                <Button variant="outline" size="sm" onClick={onShowComponents}>
                  <Blocks size={14} />
                  查看 AI 组件
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </SettingsGroup>
        </div>
      </div>
    </div>
  )
}
