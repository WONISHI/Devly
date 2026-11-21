import { useId, useState } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useWorkspace } from '@/store'
import type { Provider } from '@shared/data-contracts'
import {
  defaultCompatibility,
  type Compatibility,
  type ProbeKind,
} from '@shared/provider-contracts'
import { saveProvider, removeProvider, changeCredential, useProviderProbe } from './hooks'

const kindLabels: Record<ProbeKind, string> = {
  text: '文本',
  streaming: '流式文本',
  tools: '工具调用及结果',
  structuredOutput: '结构化输出',
  models: '模型列表',
}
function fail(error: unknown) {
  toast.error(error instanceof Error ? error.message : '操作失败')
}
const capabilityOptions = [
  { value: 'unknown', label: '未知' },
  { value: 'supported', label: '手工声明支持' },
  { value: 'unsupported', label: '不支持' },
]

export function ProviderManager() {
  const { providers, credentialAvailable } = useWorkspace()
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const value = providers.find((provider) => provider.id === editing) ?? null
  return (
    <section className="provider-manager" aria-label="供应商管理">
      <div className="provider-list-heading">
        <p>{providers.length ? `${providers.length} 个供应商` : '添加你的第一个 API 供应商'}</p>
        <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
          <Plus size={14} />
          添加供应商
        </Button>
      </div>
      {providers.map((provider) => (
        <div key={provider.id} className="provider-row">
          <Button
            variant="ghost"
            className="provider-select"
            onClick={() => setEditing(provider.id)}
            aria-pressed={editing === provider.id}
          >
            <span>
              {provider.name}
              <small>
                {provider.model || '未选择模型'} ·{' '}
                {provider.hasCredential ? '密钥已保存' : '未设置密钥'}
              </small>
            </span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(provider.id)}>
            编辑 {provider.name}
          </Button>
        </div>
      ))}
      {editing !== undefined && (
        <ProviderEditor
          key={value ? `${value.id}:${value.revision}` : 'new'}
          value={value}
          credentialAvailable={credentialAvailable}
          onSave={async (value) => {
            const saved = await saveProvider(value)
            setEditing(saved.id)
            toast.success('供应商已保存')
          }}
          onClose={() => setEditing(undefined)}
          onRemove={async () => {
            if (value) await removeProvider(value.id)
            setEditing(undefined)
          }}
        />
      )}
    </section>
  )
}

function ProviderEditor({
  value,
  credentialAvailable,
  onSave,
  onClose,
  onRemove,
}: {
  value: Provider | null
  credentialAvailable: boolean
  onSave(value: unknown): Promise<void>
  onClose(): void
  onRemove(): Promise<void>
}) {
  const id = useId()
  const initial = {
    ...(value ? { id: value.id } : {}),
    name: value?.name ?? '',
    protocol: value?.protocol ?? 'chat-completions',
    baseUrl: value?.baseUrl ?? '',
    model: value?.model ?? '',
    compatibility: value?.compatibility ?? defaultCompatibility,
  }
  const [draft, setDraft] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [confirmRemove, setConfirmRemove] = useState(false),
    [timeoutSeconds, setTimeoutSeconds] = useState(30)
  const probe = useProviderProbe(value?.id)
  const dirty = !value || JSON.stringify(initial) !== JSON.stringify(draft)
  function option<K extends keyof Compatibility>(key: K, value: Compatibility[K]) {
    setDraft((old) => ({ ...old, compatibility: { ...old.compatibility, [key]: value } }))
  }
  const supportedProtocol = draft.protocol === 'chat-completions'
  const canCheck = !!value && !dirty && supportedProtocol && !probe.busy
  const currentKinds = new Set(probe.snapshot?.checks.map((check) => check.kind) ?? [])
  const checks = [
    ...(value?.report?.checks ?? []).filter((check) => !currentKinds.has(check.kind)),
    ...(probe.snapshot?.checks ?? []),
  ]
  const test = (kind: ProbeKind | 'all') => {
    void probe.start(kind, timeoutSeconds * 1000).catch(fail)
  }
  function capability(kind: ProbeKind) {
    const check = checks.find((check) => check.kind === kind)
    if (kind === 'tools' && draft.compatibility.tools === 'disabled') return '已禁用'
    if (kind === 'structuredOutput' && draft.compatibility.structuredOutput === 'unsupported')
      return '不支持（手工）'
    return check?.ok
      ? '检查通过'
      : check
        ? `未通过 · ${check.error?.code ?? '未知'}`
        : kind === 'structuredOutput' && draft.compatibility.structuredOutput === 'supported'
          ? '手工声明支持，待检查'
          : '未知'
  }
  return (
    <div className="provider-editor">
      <form
        className="provider-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          setError(null)
          try {
            await onSave(draft)
          } catch (error) {
            setError(error instanceof Error ? error.message : '保存失败')
          } finally {
            setSaving(false)
          }
        }}
      >
        <h3>{value ? `编辑 ${value.name}` : '添加供应商'}</h3>
        <div className="provider-fields">
          <div className="settings-field">
            <Label htmlFor={`${id}-name`}>供应商名称</Label>
            <Input
              id={`${id}-name`}
              required
              maxLength={200}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="settings-field">
            <Label htmlFor={`${id}-protocol`}>协议</Label>
            <SelectField
              id={`${id}-protocol`}
              label="协议"
              value={draft.protocol}
              onValueChange={(protocol) =>
                setDraft({ ...draft, protocol: protocol as Provider['protocol'] })
              }
              options={[
                { value: 'chat-completions', label: 'OpenAI-compatible Chat Completions' },
                { value: 'responses', label: 'Responses（暂未接入）', disabled: true },
                {
                  value: 'anthropic-messages',
                  label: 'Anthropic Messages（暂未接入）',
                  disabled: true,
                },
              ]}
            />
          </div>
          <div className="settings-field provider-wide">
            <Label htmlFor={`${id}-url`}>Base URL</Label>
            <Input
              id={`${id}-url`}
              type="url"
              required
              placeholder="https://api.example.com/v1"
              maxLength={2048}
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
            <small>
              填写 API 根路径（如 /v1），自动追加 /chat/completions 和 /models。HTTP
              会明文传输密钥。
            </small>
          </div>
          <div className="settings-field provider-wide">
            <Label htmlFor={`${id}-model`}>模型 ID</Label>
            <Input
              id={`${id}-model`}
              maxLength={200}
              placeholder="手工填写供应商提供的模型 ID"
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            />
            {!!probe.snapshot?.models.length && (
              <SelectField
                label="从列表选择模型"
                value={
                  probe.snapshot.models.includes(draft.model) ? draft.model : 'devly-unselected'
                }
                onValueChange={(model) => setDraft({ ...draft, model })}
                options={[
                  { value: 'devly-unselected', label: '从模型列表选择', disabled: true },
                  ...probe.snapshot.models.map((model) => ({ value: model, label: model })),
                ]}
              />
            )}
          </div>
        </div>
        <Collapsible className="provider-compatibility">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              兼容参数
              <ChevronDown size={14} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="provider-fields">
            <div className="settings-field">
              <Label>Token 参数</Label>
              <SelectField
                label="Token 参数"
                value={draft.compatibility.tokenParameter}
                onValueChange={(v) =>
                  option('tokenParameter', v as Compatibility['tokenParameter'])
                }
                options={[
                  { value: 'max_tokens', label: 'max_tokens' },
                  { value: 'max_completion_tokens', label: 'max_completion_tokens' },
                  { value: 'omit', label: '不发送（由供应商控制上限）' },
                ]}
              />
            </div>
            <div className="settings-field">
              <Label htmlFor={`${id}-temperature`}>Temperature（可留空）</Label>
              <Input
                id={`${id}-temperature`}
                type="number"
                min={0}
                max={2}
                step="0.1"
                value={draft.compatibility.temperature ?? ''}
                onChange={(event) =>
                  option(
                    'temperature',
                    event.target.value === '' ? null : event.target.valueAsNumber,
                  )
                }
              />
            </div>
            <div className="settings-field">
              <Label>流式用量参数</Label>
              <SelectField
                label="流式用量参数"
                value={draft.compatibility.streamUsage ? 'yes' : 'no'}
                onValueChange={(v) => option('streamUsage', v === 'yes')}
                options={[
                  { value: 'no', label: '不发送 stream_options' },
                  { value: 'yes', label: '请求 include_usage' },
                ]}
              />
            </div>
            <div className="settings-field">
              <Label>工具参数</Label>
              <SelectField
                label="工具参数"
                value={draft.compatibility.tools}
                onValueChange={(v) => option('tools', v as Compatibility['tools'])}
                options={[
                  { value: 'auto', label: '允许检查 tools / tool_choice' },
                  { value: 'disabled', label: '禁用工具调用' },
                ]}
              />
            </div>
            <div className="settings-field">
              <Label>视觉能力声明</Label>
              <SelectField
                label="视觉能力声明"
                value={draft.compatibility.vision}
                onValueChange={(v) => option('vision', v as Compatibility['vision'])}
                options={capabilityOptions}
              />
            </div>
            <div className="settings-field">
              <Label>结构化输出声明</Label>
              <SelectField
                label="结构化输出声明"
                value={draft.compatibility.structuredOutput}
                onValueChange={(v) =>
                  option('structuredOutput', v as Compatibility['structuredOutput'])
                }
                options={capabilityOptions}
              />
            </div>
            <div className="settings-field">
              <Label htmlFor={`${id}-context`}>上下文窗口（可留空）</Label>
              <Input
                id={`${id}-context`}
                type="number"
                min={256}
                max={10000000}
                value={draft.compatibility.contextWindow ?? ''}
                onChange={(event) =>
                  option(
                    'contextWindow',
                    event.target.value === '' ? null : event.target.valueAsNumber,
                  )
                }
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <Button type="submit" disabled={saving || probe.busy}>
            {saving ? '保存中…' : '保存供应商'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            关闭
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              disabled={probe.busy}
              onClick={() => setConfirmRemove(true)}
            >
              删除供应商
            </Button>
          )}
        </div>
        {confirmRemove && (
          <div className="provider-delete" role="alert">
            删除供应商并清除已保存密钥？
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void onRemove().catch(fail)}
            >
              确认删除
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
              保留
            </Button>
          </div>
        )}
      </form>
      {value && (
        <>
          <div className="provider-credentials">
            <span>
              API Key ·{' '}
              {value.hasCredential ? '已受系统保护保存' : '未设置（无认证端点可直接测试）'}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!credentialAvailable || probe.busy}
              onClick={() => void changeCredential(value.id).catch(fail)}
            >
              {value.hasCredential ? '替换密钥' : '设置密钥'}
            </Button>
            {value.hasCredential && (
              <Button
                size="sm"
                variant="ghost"
                disabled={probe.busy}
                onClick={() => void changeCredential(value.id, true).catch(fail)}
              >
                清除密钥
              </Button>
            )}
            {!credentialAvailable && <small>系统凭据保护不可用，无法保存密钥。</small>}
          </div>
          <div
            className="provider-diagnostics"
            data-probe-run={probe.snapshot?.runId ?? ''}
            data-probe-state={probe.busy ? 'running' : (probe.snapshot?.state ?? 'idle')}
          >
            <h3>连接与能力检查</h3>
            <p className="settings-footnote">
              向已保存端点发送固定测试内容，可能产生少量费用；不发送项目文件。
            </p>
            {dirty && <p className="settings-footnote">先保存更改，再运行检查。</p>}
            {!supportedProtocol && <p role="alert">此协议暂未接入，请切换为 Chat Completions。</p>}
            <div className="probe-actions">
              <Button disabled={!canCheck || !value.model.trim()} onClick={() => test('all')}>
                检查连接
              </Button>
              <Button variant="outline" disabled={!canCheck} onClick={() => test('models')}>
                读取模型列表
              </Button>
              <div className="probe-timeout">
                <Label htmlFor={`${id}-timeout`}>超时（秒）</Label>
                <Input
                  id={`${id}-timeout`}
                  type="number"
                  min={1}
                  max={120}
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(event.target.valueAsNumber)}
                  disabled={probe.busy}
                />
              </div>
              {probe.busy && (
                <Button variant="outline" onClick={() => void probe.cancel().catch(fail)}>
                  取消检查
                </Button>
              )}
            </div>
            <table className="capability-table">
              <thead>
                <tr>
                  <th>能力</th>
                  <th>结果</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(['text', 'streaming', 'tools', 'structuredOutput'] as const).map((kind) => (
                  <tr key={kind}>
                    <td>{kindLabels[kind]}</td>
                    <td>{capability(kind)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          !canCheck ||
                          !value.model.trim() ||
                          (kind === 'tools' && draft.compatibility.tools === 'disabled') ||
                          (kind === 'structuredOutput' &&
                            draft.compatibility.structuredOutput === 'unsupported')
                        }
                        onClick={() => test(kind)}
                      >
                        检查{kindLabels[kind]}
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>视觉</td>
                  <td>
                    {draft.compatibility.vision === 'unknown'
                      ? '未知，未检查'
                      : draft.compatibility.vision === 'supported'
                        ? '手工声明支持，未检查'
                        : '不支持（手工）'}
                  </td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>上下文窗口</td>
                  <td>
                    {draft.compatibility.contextWindow
                      ? `${draft.compatibility.contextWindow.toLocaleString()}（手工）`
                      : '未知'}
                  </td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
            {probe.busy && (
              <p role="status">正在检查{kindLabels[probe.snapshot?.phase ?? 'text']}…</p>
            )}
            {probe.error && (
              <p role="alert" className="error-text">
                {probe.error}
              </p>
            )}
            {probe.snapshot && !probe.busy && (
              <p role="status">
                {probe.snapshot.state === 'completed'
                  ? '本次检查完成'
                  : probe.snapshot.state === 'cancelled'
                    ? '检查已取消'
                    : '本次检查未通过'}
              </p>
            )}
            {checks
              .filter((check) => !check.ok)
              .map((check) => (
                <p key={check.kind} role="alert" className="error-text">
                  {kindLabels[check.kind]}：{check.error?.message}
                  {check.error?.retryAfterSeconds != null
                    ? `（建议等待 ${check.error.retryAfterSeconds} 秒）`
                    : ''}
                  {check.kind === 'models' ? '；可继续手工填写模型 ID。' : ''}
                </p>
              ))}
            {probe.snapshot?.preview && (
              <pre className="probe-preview" aria-label="测试响应">
                {probe.snapshot.preview}
              </pre>
            )}
            {!!value.report?.checks.length && (
              <p className="settings-footnote">
                最近检查：
                {new Date(
                  Math.max(...value.report.checks.map((check) => check.checkedAt)),
                ).toLocaleString()}{' '}
                · {value.model}。修改配置或密钥后重新检查。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
