import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import { useMcp } from './use-mcp'
const empty = { id: undefined as string | undefined, name: '', url: '', enabled: false }
export function McpPanel({ projectId }: { projectId: string }) {
  const state = useMcp(projectId),
    [draft, setDraft] = useState(empty)
  const selected = state.items.find((item) => item.id === draft.id)
  return (
    <div className="extension-panel">
      <p>
        支持 Streamable HTTP。仅接受 HTTPS 或本机回环 HTTP；凭据通过系统保护输入。启用后，项目 Agent
        才会注册工具，每次外部调用仍需审批。服务可能在项目沙箱之外修改数据。
      </p>
      {state.items.map((item) => (
        <div className="extension-row" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <p>
              {item.enabled ? '允许 Agent 逐次审批调用' : '仅配置，未启用'} ·{' '}
              {item.hasCredential ? '已保存凭据' : '未设置凭据'}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft({ id: item.id, name: item.name, url: item.url, enabled: item.enabled })
              state.setTest(null)
            }}
          >
            编辑 MCP {item.name}
          </Button>
        </div>
      ))}
      <Label htmlFor="mcp-name">MCP 名称</Label>
      <Input
        id="mcp-name"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <Label htmlFor="mcp-url">MCP 地址</Label>
      <Input
        id="mcp-url"
        placeholder="https://example.com/mcp"
        value={draft.url}
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
      />
      <SelectField
        label="MCP 工具权限"
        value={String(draft.enabled)}
        options={[
          { value: 'false', label: '不提供给 Agent' },
          { value: 'true', label: '项目 Agent 逐次审批调用' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, enabled: value === 'true' })}
      />
      <div className="settings-actions">
        <Button
          disabled={state.busy || !draft.name.trim() || !draft.url.trim()}
          onClick={async () => {
            const saved = await state.save(draft)
            if (saved)
              setDraft({ id: saved.id, name: saved.name, url: saved.url, enabled: saved.enabled })
          }}
        >
          保存 MCP
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(empty)
            state.setTest(null)
          }}
        >
          新增 MCP
        </Button>
      </div>
      {selected && (
        <div className="settings-actions">
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => void state.connect(selected.id)}
          >
            测试 MCP 连接
          </Button>
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => void state.key(selected.id)}
          >
            设置 MCP 凭据
          </Button>
          <Button
            variant="ghost"
            disabled={state.busy || !selected.hasCredential}
            onClick={() => void state.key(selected.id, true)}
          >
            清除 MCP 凭据
          </Button>
          <Button
            variant="ghost"
            disabled={state.busy}
            onClick={() => void state.remove(selected.id)}
          >
            移除 MCP
          </Button>
        </div>
      )}
      {state.test && (
        <div role="status">
          <p>{state.test.message}</p>
          {state.test.tools.map((tool) => (
            <p key={tool.alias}>
              {tool.name} · {tool.alias} · schema {tool.schemaHash.slice(0, 12)}
            </p>
          ))}
        </div>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </div>
  )
}
