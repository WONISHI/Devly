import { useId, useState } from 'react'
import { Plus, ChevronDown, CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProviderBrandIcon } from '@/components/provider-brand-icon'
import { SelectField } from '@/components/forms/SelectField'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useWorkspace } from '@/store'
import type { Provider, DataArgs } from '@shared/data-contracts'
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
type SetupAction = 'save' | 'credential' | 'clear-credential' | 'test'
type ProviderDraft = DataArgs<'providers.save'>
function editable(provider: Provider | null) {
  return {
    ...(provider ? { id: provider.id } : {}),
    name: provider?.name ?? '',
    protocol: provider?.protocol ?? 'chat-completions',
    baseUrl: provider?.baseUrl ?? '',
    model: provider?.model ?? '',
    compatibility: provider?.compatibility ?? defaultCompatibility,
  }
}

export function ProviderManager() {
  const { providers, credentialAvailable } = useWorkspace()
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [action, setAction] = useState<SetupAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quickTest, setQuickTest] = useState(false)
  const probe = useProviderProbe()
  const value = providers.find((provider) => provider.id === editing) ?? null
  function edit(id: typeof editing) {
    probe.reset()
    setQuickTest(false)
    setError(null)
    setEditing(id)
  }
  async function save(draft: ProviderDraft, next: SetupAction, timeoutMs: number) {
    setAction(next)
    setError(null)
    probe.reset()
    setQuickTest(next === 'test')
    try {
      const saved =
        !value || JSON.stringify(editable(value)) !== JSON.stringify(draft)
          ? await saveProvider(draft)
          : value
      setEditing(saved.id)
      if (next === 'credential') await changeCredential(saved.id)
      else if (next === 'clear-credential') await changeCredential(saved.id, true)
      else if (next === 'test') await probe.start(saved.id, 'text', timeoutMs)
      else toast.success('供应商已保存')
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败')
    } finally {
      setAction(null)
    }
  }
  return (
    <section className="provider-manager" aria-label="供应商管理">
      <div className="provider-list-heading">
        <p>{providers.length ? `${providers.length} 个供应商` : '添加你的第一个 API 供应商'}</p>
        <Button variant="outline" size="sm" disabled={!!action} onClick={() => edit(null)}>
          <Plus size={14} />
          添加供应商
        </Button>
      </div>
      {providers.map((provider) => (
        <div key={provider.id} className="provider-row">
          <Button
            variant="ghost"
            className="provider-select"
            disabled={!!action}
            onClick={() => edit(provider.id)}
            aria-pressed={editing === provider.id}
          >
            <ProviderBrandIcon provider={provider} />
            <span className="provider-select-copy">
              {provider.name}
              <small>
                {provider.model || '未选择模型'} ·{' '}
                {provider.hasCredential ? '密钥已保存' : '未设置密钥'}
              </small>
            </span>
          </Button>
          <Button variant="ghost" size="sm" disabled={!!action} onClick={() => edit(provider.id)}>
            编辑 {provider.name}
          </Button>
        </div>
      ))}
      {editing !== undefined && (
        <ProviderEditor
          key={value ? `${value.id}:${value.revision}` : 'new'}
          value={value}
          credentialAvailable={credentialAvailable}
          action={action}
          error={error}
          quickTest={quickTest}
          probe={probe}
          onSave={save}
          onTest={(kind, timeoutMs) => {
            if (!value) return
            setQuickTest(false)
            setError(null)
            void probe.start(value.id, kind, timeoutMs).catch(fail)
          }}
          onClose={() => edit(undefined)}
          onRemove={async () => {
            probe.reset()
            if (value) await removeProvider(value.id)
            edit(undefined)
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
  action,
  error,
  quickTest,
  probe,
  onTest,
}: {
  value: Provider | null
  credentialAvailable: boolean
  onSave(value: ProviderDraft, action: SetupAction, timeoutMs: number): Promise<void>
  action: SetupAction | null
  error: string | null
  quickTest: boolean
  probe: ReturnType<typeof useProviderProbe>
  onTest(kind: ProbeKind | 'all', timeoutMs: number): void
  onClose(): void
  onRemove(): Promise<void>
}) {
  const id = useId()
  const initial = editable(value)
  const [draft, setDraft] = useState(initial),
    [confirmRemove, setConfirmRemove] = useState(false),
    [timeoutSeconds, setTimeoutSeconds] = useState(30)
  const saving = action !== null
  const dirty = !value || JSON.stringify(initial) !== JSON.stringify(draft)
  function option<K extends keyof Compatibility>(key: K, value: Compatibility[K]) {
    setDraft((old) => ({ ...old, compatibility: { ...old.compatibility, [key]: value } }))
  }
  const supportedProtocol = ['chat-completions', 'responses', 'anthropic-messages'].includes(
    draft.protocol,
  )
  const canCheck = !!value && !dirty && supportedProtocol && !probe.busy
  const currentKinds = new Set(probe.snapshot?.checks.map((check) => check.kind) ?? [])
  const checks = [
    ...(value?.report?.checks ?? []).filter((check) => !currentKinds.has(check.kind)),
    ...(probe.snapshot?.checks ?? []),
  ]
  const test = (kind: ProbeKind | 'all') => {
    onTest(kind, timeoutSeconds * 1000)
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
        onSubmit={(event) => {
          event.preventDefault()
          const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
          void onSave(
            draft,
            next === 'test' || next === 'credential' ? next : 'save',
            timeoutSeconds * 1000,
          )
        }}
      >
        <h3>{value ? `编辑 ${value.name}` : '添加供应商'}</h3>
        <fieldset className="provider-fields" disabled={saving || probe.busy}>
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
                { value: 'responses', label: 'OpenAI Responses' },
                {
                  value: 'anthropic-messages',
                  label: 'Anthropic Messages',
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
              填写 API 根路径（如 /v1），按协议追加 /chat/completions、/responses 或
              /messages，模型列表使用 /models。HTTP 会明文传输密钥。
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
        </fieldset>
        <div className="provider-key-field" aria-label="API Key 配置">
          <Label>API Key</Label>
          <span className="key-status">
            {value?.hasCredential ? '已设置 · 受系统保护' : '未设置'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!credentialAvailable || saving || probe.busy}
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity())
                void onSave(draft, 'credential', timeoutSeconds * 1000)
            }}
          >
            {action === 'credential' ? '处理中…' : value?.hasCredential ? '替换密钥' : '设置密钥'}
          </Button>
          {value?.hasCredential && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving || probe.busy}
              onClick={(event) => {
                if (event.currentTarget.form?.reportValidity())
                  void onSave(draft, 'clear-credential', timeoutSeconds * 1000)
              }}
            >
              清除密钥
            </Button>
          )}
          <small>
            {credentialAvailable
              ? '通过系统安全输入框设置；无认证端点可留空。'
              : '系统凭据保护不可用，无法保存密钥。'}
          </small>
        </div>
        <Collapsible className="provider-compatibility">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={saving || probe.busy}>
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
          <Button type="submit" name="action" value="save" disabled={saving || probe.busy}>
            {action === 'save' ? '保存中…' : '保存供应商'}
          </Button>
          <Button
            type="submit"
            name="action"
            value="test"
            variant="outline"
            disabled={saving || probe.busy || !supportedProtocol || !draft.model.trim()}
            title={
              !draft.model.trim()
                ? '先填写模型 ID'
                : '保存当前配置并发送固定文本测试，可能产生少量费用'
            }
          >
            {quickTest && (saving || probe.busy) ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                测试中…
              </>
            ) : (
              '测试连接'
            )}
          </Button>
          {quickTest && probe.busy && (
            <Button type="button" variant="ghost" onClick={() => void probe.cancel().catch(fail)}>
              取消测试
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            关闭
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              disabled={saving || probe.busy}
              onClick={() => setConfirmRemove(true)}
            >
              删除供应商
            </Button>
          )}
        </div>
        {quickTest && <ConnectionTestStatus probe={probe} saving={saving} dirty={dirty} />}
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
          <div
            className="provider-diagnostics"
            data-probe-run={probe.snapshot?.runId ?? ''}
            data-probe-state={probe.busy ? 'running' : (probe.snapshot?.state ?? 'idle')}
          >
            <h3>连接与能力检查</h3>
            <p className="settings-footnote">
              向已保存端点发送固定测试内容，可能产生少量费用；不发送项目文件。
            </p>
            {dirty && <p className="settings-footnote">下方能力检查使用已保存配置。</p>}
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
              .filter((check) => !check.ok && !(quickTest && check.kind === 'text'))
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

function ConnectionTestStatus({
  probe,
  saving,
  dirty,
}: {
  probe: ReturnType<typeof useProviderProbe>
  saving: boolean
  dirty: boolean
}) {
  const check = probe.snapshot?.checks.find((check) => check.kind === 'text')
  const busy = saving || probe.busy
  const cancelled = probe.snapshot?.state === 'cancelled'
  const success = !busy && !dirty && probe.snapshot?.state === 'completed' && check?.ok
  const message = busy
    ? '正在测试连接…'
    : dirty
      ? '配置已更改，请重新测试'
      : cancelled
        ? '测试已取消'
        : success
          ? '连接成功：已收到模型文本响应'
          : (probe.error ?? check?.error?.message ?? '连接测试未完成，请重试')
  const state = busy
    ? 'running'
    : dirty
      ? 'stale'
      : cancelled
        ? 'cancelled'
        : success
          ? 'success'
          : 'error'
  return (
    <div
      className="connection-test-result"
      data-state={state}
      role={state === 'error' ? 'alert' : 'status'}
    >
      {busy ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : success ? (
        <CheckCircle2 size={16} />
      ) : state === 'error' ? (
        <XCircle size={16} />
      ) : null}
      <span>{message}</span>
    </div>
  )
}
