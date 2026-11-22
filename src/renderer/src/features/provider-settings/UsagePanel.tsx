import { useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useWorkspace } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import type { Provider } from '@shared/data-contracts'
import {
  accountCapability,
  remainingBudget,
  type UsageStats,
  type UsageSummary,
} from '@shared/usage-contracts'
import { useProviderUsage } from './usage-hooks'

const number = new Intl.NumberFormat('zh-CN')
function metricText(stats: UsageStats, key: 'input' | 'output' | 'total') {
  const metric = stats[key]
  if (stats.turns && !metric.reportedTurns) return '未上报'
  return `${metric.reportedTurns < stats.turns ? '≥ ' : ''}${number.format(metric.tokens)}`
}
export function UsagePanel() {
  const providers = useWorkspace((state) => state.providers)
  const [selected, setSelected] = useState('')
  const provider = providers.find((item) => item.id === selected) ?? providers[0]
  if (!provider) return <p className="settings-footnote">请先在“模型供应商”中添加 API 供应商。</p>
  return (
    <div className="usage-panel">
      <div className="settings-field">
        <Label>统计供应商</Label>
        <SelectField
          label="统计供应商"
          value={provider.id}
          onValueChange={setSelected}
          options={providers.map((item) => ({ value: item.id, label: item.name }))}
        />
      </div>
      <ProviderUsage key={`${provider.id}:${provider.revision}`} provider={provider} />
    </div>
  )
}
function ProviderUsage({ provider }: { provider: Provider }) {
  const usage = useProviderUsage(provider.id)
  const capability = accountCapability(provider.baseUrl)
  return (
    <>
      <section className="usage-section" aria-label="本地用量">
        <div className="usage-heading">
          <h3>本地已记录用量</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={usage.busy}
            onClick={() => void usage.refresh()}
          >
            <RefreshCw size={14} />
            刷新用量
          </Button>
        </div>
        <p className="settings-footnote">
          当前供应商在本机的聊天与 Agent
          历史，包含所有模型及失败、取消的回合。按供应商记录归集，包含历史配置；更换密钥不会清零。连接测试、其他设备与其他应用的消耗不在其中。
        </p>
        {usage.summary ? (
          <>
            <div className="usage-metrics">
              {(['input', 'output', 'total'] as const).map((key, index) => (
                <div className="usage-metric" key={key}>
                  <span>{['输入 Token', '输出 Token', '累计 Token'][index]}</span>
                  <strong>{metricText(usage.summary!.lifetime, key)}</strong>
                  <small>
                    {usage.summary!.lifetime[key].reportedTurns} / {usage.summary!.lifetime.turns}{' '}
                    个已结束回合已上报
                  </small>
                </div>
              ))}
            </div>
            <p className="settings-footnote">
              {usage.summary.activeTurns > 0 &&
                `${usage.summary.activeTurns} 个回合正在运行，结束后刷新查看。`}
              “≥”表示已确认的下限；未上报或部分缺失的回合无法精确计费。统计单位是回合，Agent
              回合可能调用多次 API。
            </p>
            <BudgetEditor
              key={usage.summary.updatedAt}
              summary={usage.summary}
              busy={usage.busy}
              onSave={usage.save}
            />
          </>
        ) : (
          <p role="status">{usage.error ? '暂时无法读取用量，请刷新重试。' : '正在读取用量…'}</p>
        )}
      </section>
      <section className="usage-section" aria-label="供应商账户额度">
        <div className="usage-heading">
          <h3>供应商账户额度</h3>
          {capability === 'deepseek' && (
            <Button
              variant="outline"
              size="sm"
              disabled={usage.querying || !provider.hasCredential}
              onClick={() => void usage.queryAccount()}
            >
              {usage.querying ? '查询中…' : '查询账户余额'}
            </Button>
          )}
        </div>
        {capability === 'deepseek' ? (
          <>
            <p className="settings-footnote">
              DeepSeek 官方账户返回金额余额，不提供账户累计或剩余
              Token。点击查询时使用当前已保存密钥；金额不会换算为 Token。
            </p>
            {!provider.hasCredential && <p role="status">请先在模型供应商中保存 API Key。</p>}
            {usage.account?.ok && (
              <div className="usage-account-result" role="status">
                {usage.account.balance.balances.map((balance) => (
                  <div key={balance.currency}>
                    <span>可用余额（{balance.currency}）</span>
                    <strong>{balance.total}</strong>
                    <small>
                      赠送 {balance.granted} · 充值 {balance.toppedUp}
                    </small>
                  </div>
                ))}
                <p>
                  {usage.account.balance.available ? '账户余额可用' : '账户余额不足'} · 查询于{' '}
                  {new Date(usage.account.balance.checkedAt).toLocaleString()}
                </p>
              </div>
            )}
            {usage.account && !usage.account.ok && (
              <p role="alert">{usage.account.error.message}</p>
            )}
          </>
        ) : (
          <p className="settings-footnote">
            {capability === 'ark'
              ? '当前接入火山方舟。账户用量与资源包额度需单独的管理接口鉴权，不能用当前推理 API Key 查询；请在火山方舟控制台查看。本页仍可统计本地用量并设置预算。'
              : '当前端点尚未接入账户额度查询。OpenAI 兼容协议不包含统一余额接口，请在供应商控制台查看；本地预算不代表账户额度。'}
          </p>
        )}
        <p className="settings-footnote">
          账户剩余 Token：{capability === 'deepseek' ? '该接口未提供' : '暂不可查询'}。账户已用
          Token：暂不可查询。
        </p>
      </section>
      {usage.error && <p role="alert">{usage.error}</p>}
    </>
  )
}
function BudgetEditor({
  summary,
  busy,
  onSave,
}: {
  summary: UsageSummary
  busy: boolean
  onSave: (value: number | null, reset?: boolean) => Promise<void>
}) {
  const id = useId()
  const [draft, setDraft] = useState(summary.budgetTokens?.toString() ?? '')
  const [error, setError] = useState('')
  const remaining = remainingBudget(summary)
  const save = async (reset = false) => {
    if (draft && (!/^\d+$/.test(draft) || Number(draft) > 1_000_000_000_000)) {
      setError('请输入 0 到 1,000,000,000,000 的整数，留空可取消预算。')
      return
    }
    setError('')
    await onSave(draft === '' ? null : Number(draft), reset)
  }
  return (
    <form
      className="usage-budget"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="usage-heading">
        <h3>本地 Token 预算</h3>
        <strong className="usage-remaining" data-testid="usage-remaining">
          {remaining
            ? `${remaining.partial ? '至多 ' : ''}${number.format(remaining.remaining)} Token 剩余`
            : '未设置预算'}
        </strong>
      </div>
      <p className="settings-footnote">
        统计起点：{summary.since ? new Date(summary.since).toLocaleString() : '全部历史'}
        （按回合开始时间）。本期已确认 {metricText(summary.period, 'total')} Token。
        {remaining &&
          remaining.exceeded > 0 &&
          ` 已确认超出预算 ${number.format(remaining.exceeded)} Token。`}
      </p>
      <div className="settings-field">
        <Label htmlFor={id}>预算总量（Token）</Label>
        <Input
          id={id}
          inputMode="numeric"
          placeholder="留空表示不设预算"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      <div className="usage-actions">
        <Button type="submit" size="sm" disabled={busy}>
          保存预算
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void save(true)}
        >
          保存并从现在重新计数
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="settings-footnote">
        预算仅作本地提示，不会阻止请求，也不是供应商账单。重新计数保留全部历史；清空预算不会清除历史用量。运行中或未上报用量存在时，“至多”为剩余上限。
      </p>
    </form>
  )
}
