import { useEffect, useState } from 'react'
import type { LocalSchedule } from '@shared/schedule-contracts'
import type { DataResult } from '@shared/data-contracts'
import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
export function SchedulesPanel({ projectId }: { projectId: string }) {
  const providers = useWorkspace((s) => s.providers)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [items, setItems] = useState<LocalSchedule[]>([]),
    [name, setName] = useState(''),
    [prompt, setPrompt] = useState(''),
    [providerId, setProvider] = useState(''),
    [model, setModel] = useState(''),
    [interval, setInterval] = useState('60'),
    [misfire, setMisfire] = useState<'skip' | 'once'>('skip'),
    [enabled, setEnabled] = useState(false),
    [notify, setNotify] = useState(false),
    [maximum, setMaximum] = useState('5'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [history, setHistory] = useState<DataResult<'schedules.history'>>([])
  useEffect(() => {
    let active = true
    void desktop
      .data('schedules.list', { projectId })
      .then((value) => {
        if (active) setItems(value)
      })
      .catch(() => {
        if (active) setMessage('任务读取失败，请重新进入分组')
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
      setItems(await desktop.data('schedules.list', { projectId }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请检查配置与运行记录')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="extension-panel">
      <p>
        只在 Devly 正在运行且电脑唤醒时执行。退出后不会执行；macOS
        仅关闭窗口但应用仍在运行时任务仍可执行。睡眠会停止当前任务；恢复时按“跳过”或“补一次”处理，不补跑全部遗漏。只读项目
        Agent，每次最多输出 2048 Token、6 次工具、4 轮、30
        秒，不开放命令、写入、MCP、网页或浏览器；仍会把任务及所需项目内容发给下面指定模型并可能计费。
      </p>
      <Label htmlFor="schedule-name">任务名称</Label>
      <Input
        id="schedule-name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
      />
      <Label htmlFor="schedule-prompt">只读任务内容</Label>
      <Textarea
        id="schedule-prompt"
        value={prompt}
        maxLength={4000}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <SelectField
        label="任务供应商"
        value={providerId || 'none'}
        options={[
          { value: 'none', label: '请选择' },
          ...providers.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onValueChange={(value) => {
          setProvider(value === 'none' ? '' : value)
          setModel(providers.find((p) => p.id === value)?.model ?? '')
        }}
      />
      <Label htmlFor="schedule-model">固定模型 ID</Label>
      <Input
        id="schedule-model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        maxLength={200}
      />
      <Label htmlFor="schedule-interval">间隔秒数（60–2592000）</Label>
      <Input
        id="schedule-interval"
        type="number"
        min={60}
        max={2592000}
        value={interval}
        onChange={(e) => setInterval(e.target.value)}
      />
      <SelectField
        label="错过执行策略"
        value={misfire}
        options={[
          { value: 'skip', label: '超过 30 秒未执行则跳过' },
          { value: 'once', label: '恢复后最多补执行一次' },
        ]}
        onValueChange={(value) => setMisfire(value as 'skip' | 'once')}
      />
      <Label htmlFor="schedule-max">每日运行上限（UTC 日期，1–20）</Label>
      <Input
        id="schedule-max"
        type="number"
        min={1}
        max={20}
        value={maximum}
        onChange={(e) => setMaximum(e.target.value)}
      />
      <SelectField
        label="完成通知"
        value={String(notify)}
        options={[
          { value: 'false', label: '关闭' },
          { value: 'true', label: '发送系统完成/失败通知（不含任务内容）' },
        ]}
        onValueChange={(value) => setNotify(value === 'true')}
      />
      <SelectField
        label="明确启用自动执行"
        value={String(enabled)}
        options={[
          { value: 'false', label: '保存为停用，不发送请求' },
          { value: 'true', label: '同意按上述范围定时发送项目上下文并承担 API 用量' },
        ]}
        onValueChange={(value) => setEnabled(value === 'true')}
      />
      <Button
        disabled={busy || !name.trim() || !prompt.trim() || !providerId || !model.trim()}
        onClick={() =>
          void run(async () => {
            await desktop.data('schedules.save', {
              projectId,
              ...(editingId ? { id: editingId } : {}),
              name,
              prompt,
              providerId,
              model,
              intervalSeconds: Number(interval),
              misfire,
              maxRunsPerDay: Number(maximum),
              enabled,
              notify,
            })
            setEditingId(undefined)
            setName('')
            setPrompt('')
            setEnabled(false)
            setMessage('本地任务已保存；备份恢复后必须重新启用')
          })
        }
      >
        {editingId ? '保存任务修改' : '保存本地任务'}
      </Button>
      {!items.length && <p>尚无本地任务。默认不会执行任何定时请求。</p>}
      {items.map((item) => (
        <div className="extension-record" key={item.id}>
          <strong>{item.name}</strong>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setEditingId(item.id)
              setName(item.name)
              setPrompt(item.prompt)
              setProvider(item.providerId)
              setModel(item.model)
              setInterval(String(item.intervalSeconds))
              setMisfire(item.misfire)
              setMaximum(String(item.maxRunsPerDay))
              setNotify(item.notify)
              setEnabled(item.enabled)
            }}
          >
            编辑任务
          </Button>
          <p>
            {item.enabled ? '已启用' : '已停用'} · {item.model} · 每 {item.intervalSeconds} 秒 · UTC
            每日最多 {item.maxRunsPerDay} 次
          </p>
          <p>
            {item.enabled
              ? `下次检查时间 ${new Date(item.nextAt).toLocaleString()}（应用运行时）`
              : '如需执行，请显式启用'}
          </p>
          <div className="settings-actions">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || item.enabled}
              onClick={() =>
                void run(async () => {
                  const config = {
                    id: item.id,
                    projectId: item.projectId,
                    name: item.name,
                    prompt: item.prompt,
                    providerId: item.providerId,
                    model: item.model,
                    intervalSeconds: item.intervalSeconds,
                    misfire: item.misfire,
                    maxRunsPerDay: item.maxRunsPerDay,
                    notify: item.notify,
                  }
                  await desktop.data('schedules.save', { ...config, enabled: true })
                  setMessage('已启用；固定供应商，不自动切换')
                })
              }
            >
              启用任务
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !item.enabled}
              onClick={() =>
                void run(async () => {
                  const result = await desktop.data('schedules.run', { projectId, id: item.id })
                  setHistory(await desktop.data('schedules.history', { projectId, id: item.id }))
                  setMessage(
                    result.state === 'skipped'
                      ? '已达次数限制，未发送请求'
                      : '已安排一次执行，请刷新记录查看真实结果',
                  )
                })
              }
            >
              执行一次
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await desktop.data('schedules.stop', { projectId, id: item.id })
                  setHistory(await desktop.data('schedules.history', { projectId, id: item.id }))
                  setMessage('已停用，当前执行已收尾；不影响其他手动会话')
                })
              }
            >
              停止并停用
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setHistory(await desktop.data('schedules.history', { projectId, id: item.id })),
                )
              }
            >
              刷新运行记录
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await desktop.data('schedules.remove', { projectId, id: item.id })
                  setHistory([])
                })
              }
            >
              移除任务记录
            </Button>
          </div>
        </div>
      ))}
      {history.length > 0 && (
        <div>
          <h3>最近运行记录（最多 30 条）</h3>
          {history.map((item) => (
            <div key={item.id}>
              <p>
                {new Date(item.startedAt).toLocaleString()} ·{' '}
                {
                  (
                    {
                      claimed: '已领取',
                      running: '运行中',
                      completed: '已完成',
                      failed: '失败',
                      cancelled: '已停止',
                      interrupted: '重启中断',
                      skipped: '已跳过',
                    } as const
                  )[item.state]
                }{' '}
                {item.reason}
              </p>
              {item.sessionId && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={() =>
                    void run(async () => {
                      await desktop.data('sessions.select', {
                        projectId,
                        sessionId: item.sessionId!,
                      })
                      await useWorkspace.getState().refresh()
                      useWorkspace.getState().setTab('workspace')
                    })
                  }
                >
                  查看此会话
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
