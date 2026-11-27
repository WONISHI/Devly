import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import type { DataResult } from '@shared/data-contracts'
import type { WebConfig } from '@shared/web-contracts'
export function WebPanel({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState<WebConfig | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [query, setQuery] = useState(''),
    [result, setResult] = useState<DataResult<'web.test'> | null>(null)
  useEffect(() => {
    let active = true
    void desktop
      .data('web.get', { projectId })
      .then((value) => {
        if (active) setDraft(value)
      })
      .catch(() => {
        if (active) setMessage('配置读取失败，请重新打开此分组')
      })
    return () => {
      active = false
    }
  }, [projectId])
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成，请检查网络与配置')
    } finally {
      setBusy(false)
    }
  }
  if (!draft) return <p role="status">{message || '读取网页工具配置…'}</p>
  async function save() {
    if (!draft) return
    const {
      fetchEnabled,
      searchEnabled,
      searchProtocol,
      searchUrl,
      browserEnabled,
      browserOrigins,
    } = draft
    setDraft(
      await desktop.data('web.save', {
        projectId,
        fetchEnabled,
        searchEnabled,
        searchProtocol,
        searchUrl,
        browserEnabled,
        browserOrigins: browserOrigins.map((value) => value.trim()).filter(Boolean),
      }),
    )
  }
  return (
    <div className="extension-panel">
      <p>
        网页工具权限独立于本地写入。每次请求都显示发送范围并审批；网页正文和搜索摘要是外部数据。搜索可能产生服务费用，本地验证不代表真实端点已接通。
      </p>
      <SelectField
        label="网页抓取"
        value={String(draft.fetchEnabled)}
        options={[
          { value: 'false', label: '不提供给 Agent' },
          { value: 'true', label: '允许提议公共 HTTPS 抓取（逐次审批）' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, fetchEnabled: value === 'true' })}
      />
      <SelectField
        label="网页搜索"
        value={String(draft.searchEnabled)}
        options={[
          { value: 'false', label: '不提供给 Agent' },
          { value: 'true', label: '允许提议搜索（逐次审批）' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, searchEnabled: value === 'true' })}
      />
      <SelectField
        label="搜索协议"
        value={draft.searchProtocol}
        options={[
          { value: 'brave', label: 'Brave Search API' },
          { value: 'json', label: '自定义 JSON（q/count → results）' },
        ]}
        onValueChange={(value) =>
          setDraft({ ...draft, searchProtocol: value as WebConfig['searchProtocol'] })
        }
      />
      <Label htmlFor="web-endpoint">搜索 API 地址</Label>
      <Input
        id="web-endpoint"
        value={draft.searchUrl}
        onChange={(event) => setDraft({ ...draft, searchUrl: event.target.value })}
      />
      <p>
        搜索凭据：{draft.hasCredential ? '已受系统保护保存' : '未设置'}。与模型 Key
        分开，不发送到网页目标；自定义服务用 Bearer，Brave 用 X-Subscription-Token。
      </p>
      <div className="settings-actions">
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save()
              setMessage('网页配置已保存；每次 Agent 请求仍需审批')
            })
          }
        >
          保存网页配置
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save()
              await desktop.data('web.credentials.set', { projectId })
              setDraft(await desktop.data('web.get', { projectId }))
              setMessage('凭据操作完成，原有模型凭据未更改')
            })
          }
        >
          设置搜索凭据
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !draft.hasCredential}
          onClick={() =>
            void run(async () => {
              await desktop.data('web.credentials.clear', { projectId })
              setDraft(await desktop.data('web.get', { projectId }))
            })
          }
        >
          清除搜索凭据
        </Button>
      </div>
      <SelectField
        label="浏览器自动化"
        value={String(draft.browserEnabled)}
        options={[
          { value: 'false', label: '关闭' },
          { value: 'true', label: '隔离浏览器，导航/读取/截图/交互逐次审批' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, browserEnabled: value === 'true' })}
      />
      <Label htmlFor="browser-origins">允许的 HTTPS 来源（每行一个，最多 8 个）</Label>
      <Textarea
        id="browser-origins"
        value={draft.browserOrigins.join('\n')}
        placeholder="https://example.com"
        onChange={(event) => setDraft({ ...draft, browserOrigins: event.target.value.split('\n') })}
      />
      <p>
        本地仅可打开已启动的项目隔离预览。浏览器不提供上传、密码输入、下载或主界面
        IPC；截图是实际文件，不自动作为模型视觉输入。每个回合结束会关闭浏览器。
      </p>
      <Label htmlFor="web-test-query">测试搜索词</Label>
      <Input
        id="web-test-query"
        value={query}
        maxLength={600}
        placeholder="测试会发送此搜索词，可能产生费用"
        onChange={(event) => setQuery(event.target.value)}
      />
      <Button
        variant="outline"
        disabled={busy || !query.trim() || !draft.searchEnabled}
        onClick={() =>
          void run(async () => {
            await save()
            setResult(await desktop.data('web.test', { projectId, query }))
            setMessage('已收到搜索服务实际响应；这不代表任意网页都可抓取')
          })
        }
      >
        保存并测试搜索
      </Button>
      {message && <p role="status">{message}</p>}
      {result && (
        <div className="web-source-list">
          <p>
            {result.sources.length
              ? `服务返回 ${result.sources.length} 个来源`
              : '服务未返回来源，不生成搜索结果'}
          </p>
          {result.sources.map((source) => (
            <div key={source.url}>
              <strong>{source.title}</strong>
              <p>{source.url}</p>
              <p>{source.excerpt}</p>
              <small>{new Date(source.retrievedAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
