import { useState } from 'react'
import { SettingsEditor } from './SettingsEditor'
import { savePreferences, exportPreferences } from './hooks'
import { ProviderManager } from './ProviderManager'
import { useWorkspace } from '@/store'
import { ArrowLeft, Blocks, ChevronRight, PlugZap } from 'lucide-react'
import { SelectField } from '@/components/forms/SelectField'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { EnvironmentPanel, type useEnvironment } from '@/features/environment'

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
  const settings = scope === 'project' ? state.projectSettings : state.settings
  return (
    <div className="settings-page">
      <div className="settings-heading">
        <h1>设置</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={15} />
          返回工作台
        </Button>
      </div>
      <section className="model-setting" aria-labelledby="provider-title">
        <div className="setting-icon">
          <PlugZap size={20} />
        </div>
        <div>
          <h2 id="provider-title">模型供应商</h2>
          <p>OpenAI-compatible Chat Completions</p>
        </div>
        <span className="setting-state">{state.providers.length ? '已保存' : '未配置'}</span>
      </section>
      <ProviderManager />
      <div className="settings-scope">
        <h2>偏好设置</h2>
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
      <SettingsEditor
        onExport={() => exportPreferences(scope === 'project' ? state.project!.id : null)}
        key={`${scope}:${state.project?.id ?? 'global'}`}
        value={settings}
        providers={state.providers}
        onSave={(value) => savePreferences(scope === 'project' ? state.project!.id : null, value)}
      />
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
    </div>
  )
}
