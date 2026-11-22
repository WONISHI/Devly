import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import { SettingsGroup } from './SettingsGroup'
import type { Settings, Provider } from '@shared/data-contracts'

type Props = {
  value: Settings
  providers: Provider[]
  onSave: (settings: Settings) => Promise<void>
  onExport: () => Promise<void>
}
export function SettingsEditor({ value, providers, onSave, onExport }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(value),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false)
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((old) => ({ ...old, [key]: value }))
    setSaved(false)
  }
  return (
    <form
      className="preferences-form"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await onSave(draft)
          setSaved(true)
        } catch (error) {
          setError(error instanceof Error ? error.message : '保存失败')
        } finally {
          setSaving(false)
        }
      }}
    >
      <SettingsGroup id="appearance" title="外观" description="选择应用的显示主题。">
        <div className="settings-group-fields">
          <div className="settings-field">
            <Label htmlFor={`${id}-theme`}>主题</Label>
            <SelectField
              id={`${id}-theme`}
              label="主题"
              value={draft.theme}
              onValueChange={(value) => update('theme', value as Settings['theme'])}
              options={[
                { value: 'dark', label: '深色' },
                { value: 'light', label: '浅色' },
                { value: 'system', label: '跟随系统' },
              ]}
            />
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup
        id="models"
        title="默认模型"
        description="设置新会话使用的供应商和模型，已有会话保留自己的绑定。"
      >
        <div className="settings-group-fields">
          <div className="settings-field">
            <Label htmlFor={`${id}-provider`}>默认供应商</Label>
            <SelectField
              id={`${id}-provider`}
              label="默认供应商"
              value={draft.defaultProviderId ?? 'none'}
              onValueChange={(value) =>
                update('defaultProviderId', value === 'none' ? null : value)
              }
              options={[
                { value: 'none', label: '未选择' },
                ...providers.map((provider) => ({ value: provider.id, label: provider.name })),
              ]}
            />
          </div>
          <div className="settings-field">
            <Label htmlFor={`${id}-model`}>默认模型</Label>
            <Input
              id={`${id}-model`}
              aria-label="默认模型"
              maxLength={200}
              value={draft.defaultModel}
              onChange={(event) => update('defaultModel', event.target.value)}
            />
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup
        id="permissions"
        title="权限与限额"
        description="配置项目权限、输出与费用偏好。"
      >
        <div className="settings-group-fields">
          <div className="settings-field">
            <Label htmlFor={`${id}-permission`}>项目权限</Label>
            <SelectField
              id={`${id}-permission`}
              label="项目权限"
              value={draft.projectPermission}
              onValueChange={(value) =>
                update('projectPermission', value as Settings['projectPermission'])
              }
              options={[
                { value: 'read-only', label: '只读' },
                { value: 'ask', label: '每次询问' },
              ]}
            />
          </div>
          <div className="settings-field">
            <Label htmlFor={`${id}-tokens`}>Token 上限</Label>
            <Input
              id={`${id}-tokens`}
              aria-label="Token 上限"
              type="number"
              min={256}
              max={1000000}
              required
              value={draft.maxTokens}
              onChange={(event) => update('maxTokens', event.target.valueAsNumber)}
            />
          </div>
          <div className="settings-field">
            <Label htmlFor={`${id}-cost`}>费用上限（USD）</Label>
            <Input
              id={`${id}-cost`}
              aria-label="费用上限"
              type="number"
              min={0}
              max={10000}
              step="0.01"
              required
              value={draft.maxCost}
              onChange={(event) => update('maxCost', event.target.valueAsNumber)}
            />
          </div>
        </div>
        <div className="settings-group-fields">
          {(
            [
              ['maxCalls', 'Agent 工具次数', 1, 40],
              ['maxRounds', 'Agent 模型轮数', 1, 20],
              ['maxDurationMs', 'Agent 时间上限（毫秒）', 1000, 300000],
              ['maxOutputChars', 'Agent 输出字符上限', 1024, 262144],
              ['contextChars', 'Agent 上下文字节上限', 4096, 200000],
            ] as const
          ).map(([key, label, min, max]) => (
            <div className="settings-field" key={key}>
              <Label htmlFor={`${id}-${key}`}>{label}</Label>
              <Input
                id={`${id}-${key}`}
                type="number"
                required
                min={min}
                max={max}
                value={draft.agentLimits[key]}
                onChange={(event) =>
                  update('agentLimits', { ...draft.agentLimits, [key]: event.target.valueAsNumber })
                }
              />
            </div>
          ))}
        </div>
        <p className="settings-footnote">
          只读 Agent 使用次数、轮数、时间、输出与上下文限额；Token
          为累计输出额度，无用量时按请求预留额扣减。费用数值仍为偏好，尚不能保证美元计费硬上限；写入和命令未启用。
        </p>
      </SettingsGroup>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="settings-actions">
        <Button type="submit" disabled={saving}>
          {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void onExport().catch((error) =>
              setError(error instanceof Error ? error.message : '导出失败'),
            )
          }
        >
          导出设置
        </Button>
      </div>
    </form>
  )
}
