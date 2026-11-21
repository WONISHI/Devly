import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Settings, Provider } from '@shared/data-contracts'

type Props = {
  value: Settings
  providers: Provider[]
  onSave: (settings: Settings) => Promise<void>
  onExport: () => Promise<void>
}
export function SettingsEditor({ value, providers, onSave, onExport }: Props) {
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
      <label>
        主题
        <select
          aria-label="主题"
          value={draft.theme}
          onChange={(event) => update('theme', event.target.value as Settings['theme'])}
        >
          <option value="dark">深色</option>
          <option value="light">浅色</option>
          <option value="system">跟随系统</option>
        </select>
      </label>
      <label>
        默认供应商
        <select
          aria-label="默认供应商"
          value={draft.defaultProviderId ?? ''}
          onChange={(event) => update('defaultProviderId', event.target.value || null)}
        >
          <option value="">未选择</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        默认模型
        <input
          aria-label="默认模型"
          maxLength={200}
          value={draft.defaultModel}
          onChange={(event) => update('defaultModel', event.target.value)}
        />
      </label>
      <label>
        项目权限
        <select
          aria-label="项目权限"
          value={draft.projectPermission}
          onChange={(event) =>
            update('projectPermission', event.target.value as Settings['projectPermission'])
          }
        >
          <option value="read-only">只读</option>
          <option value="ask">每次询问</option>
        </select>
      </label>
      <label>
        Token 上限
        <input
          aria-label="Token 上限"
          type="number"
          min={256}
          max={1000000}
          required
          value={draft.maxTokens}
          onChange={(event) => update('maxTokens', event.target.valueAsNumber)}
        />
      </label>
      <label>
        费用上限（USD）
        <input
          aria-label="费用上限"
          type="number"
          min={0}
          max={10000}
          step="0.01"
          required
          value={draft.maxCost}
          onChange={(event) => update('maxCost', event.target.valueAsNumber)}
        />
      </label>
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
