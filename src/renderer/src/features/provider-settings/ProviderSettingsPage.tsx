import { useState } from 'react'
import { SettingsEditor } from './SettingsEditor'
import { savePreferences, changeCredential, exportPreferences } from './hooks'
import { useWorkspace } from '@/store'
import { toast } from 'sonner'
import { ArrowLeft, Blocks, ChevronRight, PlugZap } from 'lucide-react'
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
          <p>
            {state.providers.length ? `${state.providers.length} 个供应商` : '供应商配置待接入'}
          </p>
        </div>
        <span className="setting-state">{state.providers.length ? '已保存' : '未配置'}</span>
      </section>
      {state.providers.map((provider) => (
        <div className="provider-row" key={provider.id}>
          <span>
            {provider.name}
            <small>{provider.hasCredential ? '密钥已保存' : '未设置密钥'}</small>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!state.credentialAvailable}
            onClick={() =>
              void changeCredential(provider.id).catch((error) => toast.error(error.message))
            }
          >
            {provider.hasCredential ? '替换密钥' : '设置密钥'}
          </Button>
          {provider.hasCredential && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void changeCredential(provider.id, true).catch((error) =>
                  toast.error(error.message),
                )
              }
            >
              清除密钥
            </Button>
          )}
        </div>
      ))}
      <div className="settings-scope">
        <h2>偏好设置</h2>
        <select
          aria-label="设置范围"
          value={scope}
          onChange={(event) => setScope(event.target.value as typeof scope)}
        >
          <option value="global">应用默认值</option>
          <option value="project" disabled={!state.project}>
            当前项目
          </option>
        </select>
      </div>
      <SettingsEditor
        onExport={() => exportPreferences(scope === 'project' ? state.project!.id : null)}
        key={`${scope}:${state.project?.id ?? 'global'}`}
        value={settings}
        providers={state.providers}
        onSave={(value) => savePreferences(scope === 'project' ? state.project!.id : null, value)}
      />
      <details className="developer-options">
        <summary>
          开发者选项
          <ChevronRight size={14} />
        </summary>
        <div className="developer-content">
          <EnvironmentPanel {...environmentState} />
          <Button variant="outline" size="sm" onClick={onShowComponents}>
            <Blocks size={14} />
            查看 AI 组件
          </Button>
        </div>
      </details>
    </div>
  )
}
