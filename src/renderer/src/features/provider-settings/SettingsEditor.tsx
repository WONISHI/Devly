import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
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
      <div className="settings-field">
        <Label htmlFor={`${id}-provider`}>默认供应商</Label>
        <SelectField
          id={`${id}-provider`}
          label="默认供应商"
          value={draft.defaultProviderId ?? 'none'}
          onValueChange={(value) => update('defaultProviderId', value === 'none' ? null : value)}
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
      <p className="settings-footnote">权限和限额已保存；工具执行与费用统计尚未接入。</p>
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
