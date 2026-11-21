import { useState } from 'react'
import { Check, ChevronDown, LoaderCircle, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
} from '@/components/ai-elements/model-selector'
import type { Provider, Settings } from '@shared/data-contracts'
import { modelOptions } from '../model-options'

type Props = {
  providers: Provider[]
  settings: Settings
  scopeLabel: string
  disabled: boolean
  onSelect(providerId: string, model: string): Promise<void>
  onManage(): void
}
export function WorkspaceModelPicker({
  providers,
  settings,
  scopeLabel,
  disabled,
  onSelect,
  onManage,
}: Props) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null)
  const options = modelOptions(providers, settings)
  const selected = options.find(
    (option) =>
      option.providerId === settings.defaultProviderId && option.model === settings.defaultModel,
  )
  async function choose(option: (typeof options)[number]) {
    if (saving || option.disabled) return
    setSaving(true)
    setError(null)
    try {
      await onSelect(option.providerId, option.model)
      setOpen(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '模型选择保存失败')
    } finally {
      setSaving(false)
    }
  }
  return (
    <ModelSelector
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        setError(null)
      }}
    >
      <ModelSelectorTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="选择模型"
          className="workspace-model-trigger"
          disabled={disabled || saving}
          title={selected ? `${selected.providerName} · ${selected.model}` : '选择模型'}
        >
          <ModelSelectorName>{selected?.model || '选择模型'}</ModelSelectorName>
          {saving ? <LoaderCircle size={12} className="animate-spin" /> : <ChevronDown size={12} />}
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent title="选择模型" className="workspace-model-picker">
        <ModelSelectorInput placeholder="搜索模型或供应商…" aria-label="搜索模型" />
        <ModelSelectorList>
          <ModelSelectorEmpty>未找到已保存的模型</ModelSelectorEmpty>
          {providers.map((provider) => (
            <ModelSelectorGroup
              key={provider.id}
              heading={`${provider.name} · ${new URL(provider.baseUrl).host}`}
            >
              {options
                .filter((option) => option.providerId === provider.id)
                .map((option) => (
                  <ModelSelectorItem
                    key={option.key}
                    value={option.key}
                    keywords={[option.model, option.providerName, option.host]}
                    disabled={option.disabled || saving}
                    onSelect={() => void choose(option)}
                  >
                    <div className="workspace-model-option">
                      <ModelSelectorName>{option.model || '未设置模型'}</ModelSelectorName>
                      {option.hint && <small>{option.hint}</small>}
                    </div>
                    {selected?.key === option.key && <Check size={15} aria-label="当前使用" />}
                  </ModelSelectorItem>
                ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
        {error && (
          <p role="alert" className="error-text workspace-model-error">
            {error}
          </p>
        )}
        <div className="workspace-model-footer">
          <span>{scopeLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            <Settings2 size={14} />
            {providers.length ? '管理供应商' : '添加供应商'}
          </Button>
        </div>
      </ModelSelectorContent>
    </ModelSelector>
  )
}
