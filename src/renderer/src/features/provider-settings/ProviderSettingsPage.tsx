import { useRef, useState } from 'react'
import { SettingsEditor } from './SettingsEditor'
import { savePreferences, exportPreferences } from './hooks'
import { ProviderManager } from './ProviderManager'
import { SettingsGroup, type SettingsGroupId } from './SettingsGroup'
import { useWorkspace } from '@/store'
import {
  ArrowLeft,
  Blocks,
  Bot,
  ChevronRight,
  Code2,
  Palette,
  PlugZap,
  ShieldCheck,
} from 'lucide-react'
import { SelectField } from '@/components/forms/SelectField'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { EnvironmentPanel, type useEnvironment } from '@/features/environment'

const groups = [
  { id: 'providers', label: '模型供应商', icon: PlugZap },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'models', label: '默认模型', icon: Bot },
  { id: 'permissions', label: '权限与限额', icon: ShieldCheck },
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
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>('providers')
  const pageRef = useRef<HTMLDivElement>(null)
  const settings = scope === 'project' ? state.projectSettings : state.settings
  const preferenceGroup =
    activeGroup === 'appearance' || activeGroup === 'models' || activeGroup === 'permissions'
      ? activeGroup
      : null
  function goToGroup(id: SettingsGroupId) {
    const page = pageRef.current
    const viewport = page?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    setActiveGroup(id)
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
          <SettingsGroup
            id="providers"
            title="模型供应商"
            description="管理 API 地址、密钥和模型，检查连接状态。"
            hidden={activeGroup !== 'providers'}
          >
            <ProviderManager />
          </SettingsGroup>
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
            key={`${scope}:${state.project?.id ?? 'global'}`}
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
