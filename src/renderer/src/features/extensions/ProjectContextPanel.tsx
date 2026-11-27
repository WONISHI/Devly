import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import { useProjectContext } from './use-project-context'
const empty = {
  id: undefined as string | undefined,
  kind: 'memory' as 'memory' | 'instruction',
  name: '',
  scope: '.',
  content: '',
  enabled: true,
}
export function ProjectContextPanel({ projectId }: { projectId: string }) {
  const state = useProjectContext(projectId),
    [draft, setDraft] = useState(empty)
  return (
    <div className="extension-panel">
      <p>
        仅用于当前项目的 Agent
        任务。来源为用户记录，不能扩大工具权限或覆盖当前请求；工具输出不会自动存为记忆。
      </p>
      <div className="extension-list">
        {state.items.length === 0 && <p>尚无持久记录，可添加项目约定或记忆。</p>}
        {state.items.map((item) => (
          <div className="extension-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <p>
                {item.kind === 'memory' ? '记忆' : '项目指令'} · {item.scope} · 用户记录 ·{' '}
                {item.enabled ? '已启用' : '已停用'}
              </p>
            </div>
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() =>
                setDraft({
                  id: item.id,
                  kind: item.kind,
                  name: item.name,
                  scope: item.scope,
                  content: item.content,
                  enabled: item.enabled,
                })
              }
            >
              查看/编辑 {item.name}
            </Button>
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => void state.remove(item.id)}
            >
              移除 {item.name}
            </Button>
          </div>
        ))}
      </div>
      <Label htmlFor="context-name">记录名称</Label>
      <Input
        id="context-name"
        value={draft.name}
        maxLength={100}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <SelectField
        label="记录类型"
        value={draft.kind}
        options={[
          { value: 'memory', label: '项目记忆' },
          { value: 'instruction', label: '项目指令' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, kind: value as typeof draft.kind })}
      />
      <Label htmlFor="context-scope">目录范围</Label>
      <Input
        id="context-scope"
        value={draft.scope}
        placeholder=". 或 src/components"
        onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
      />
      <Label htmlFor="context-content">记录内容</Label>
      <Textarea
        id="context-content"
        value={draft.content}
        maxLength={8192}
        rows={6}
        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
      />
      <SelectField
        label="记录状态"
        value={String(draft.enabled)}
        options={[
          { value: 'true', label: '启用' },
          { value: 'false', label: '停用' },
        ]}
        onValueChange={(value) => setDraft({ ...draft, enabled: value === 'true' })}
      />
      <div className="settings-actions">
        <Button
          disabled={state.busy || !draft.name.trim() || !draft.content.trim()}
          onClick={async () => {
            const saved = await state.save(draft)
            if (saved)
              setDraft({
                id: saved.id,
                kind: saved.kind,
                name: saved.name,
                scope: saved.scope,
                content: saved.content,
                enabled: saved.enabled,
              })
          }}
        >
          保存项目记录
        </Button>
        <Button variant="ghost" onClick={() => setDraft(empty)}>
          新增记录
        </Button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
    </div>
  )
}
