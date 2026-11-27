import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspace } from '@/store'
import { useTasks } from './use-tasks'
export function TaskPanel({ projectId }: { projectId: string }) {
  const workspace = useWorkspace(),
    state = useTasks(projectId),
    [text, setText] = useState(''),
    [target, setTarget] = useState('main'),
    [mode, setMode] = useState<'read-only' | 'project-write'>('read-only'),
    [commit, setCommit] = useState('')
  const [delegation, setDelegation] = useState(false)
  const settings = workspace.projectSettings
  const phases: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    waiting_children: '等待子任务',
    waiting_approval: '等待审批',
    stopping: '正在停止',
    completed: '已完成',
    failed: '失败',
    cancelled: '已停止',
  }
  return (
    <div className="extension-panel">
      <p>
        最多 4 个并发回合；重叠目录的写任务串行。worktree 基于已提交
        HEAD，独立于主目录未提交内容；运行命令仍受系统约束。
      </p>
      <Label htmlFor="parallel-task">新任务</Label>
      <Textarea
        id="parallel-task"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={32768}
      />
      <SelectField
        label="任务工作区"
        value={target}
        options={[
          { value: 'main', label: '当前项目目录' },
          ...state.workspaces
            .filter((w) => w.state === 'ready')
            .map((w) => ({ value: w.id, label: w.branch })),
        ]}
        onValueChange={setTarget}
      />
      <SelectField
        label="任务模式"
        value={mode}
        options={[
          { value: 'read-only', label: '只读 Agent' },
          {
            value: 'project-write',
            label: '项目 Agent（逐次审批）',
            disabled: settings.projectPermission !== 'ask',
          },
        ]}
        onValueChange={(value) => setMode(value as typeof mode)}
      />
      {mode === 'project-write' && (
        <SelectField
          label="任务委派"
          value={String(delegation)}
          onValueChange={(value) => setDelegation(value === 'true')}
          options={[
            { value: 'false', label: '单任务' },
            { value: 'true', label: '允许提议子任务（另行审批）' },
          ]}
        />
      )}
      <p>
        使用当前项目已选模型：{settings.defaultModel || '尚未选择'}。新建任务不会更改已有会话绑定。
      </p>
      <div className="settings-actions">
        <Button
          disabled={
            state.busy || !text.trim() || !settings.defaultProviderId || !settings.defaultModel
          }
          onClick={() =>
            void state.start({
              text,
              mode,
              allowDelegation: mode === 'project-write' && delegation,
              workspaceId: target === 'main' ? null : target,
              providerId: settings.defaultProviderId!,
              model: settings.defaultModel,
            })
          }
        >
          创建任务
        </Button>
        <Button variant="outline" disabled={state.busy} onClick={state.create}>
          创建隔离工作区
        </Button>
      </div>
      <h3>任务队列与历史</h3>
      {state.tasks.length === 0 && <p>尚无任务。每个任务使用独立会话、回合与审批。</p>}
      {state.tasks.map((task) => (
        <div className="extension-row" key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <p>
              {task.parentTurnId ? `子任务（父 ${task.parentTurnId.slice(0, 8)}） · ` : ''}
              {phases[task.phase] || task.phase} · {task.id.slice(0, 8)}
            </p>
          </div>
          <Button variant="ghost" onClick={() => void state.open(task)}>
            打开任务
          </Button>
          {['running', 'pending'].includes(task.state) && (
            <Button variant="outline" disabled={state.busy} onClick={() => void state.cancel(task)}>
              停止任务
            </Button>
          )}
        </div>
      ))}
      <h3>隔离工作区</h3>
      {state.workspaces.map((w) => (
        <div className="extension-row" key={w.id}>
          <div>
            <strong>{w.branch}</strong>
            <p>{w.state === 'ready' ? '可用' : '已关闭（分支保留）'}</p>
          </div>
          <Button
            variant="outline"
            disabled={state.busy || w.state !== 'ready'}
            onClick={() => void state.inspect(w.id)}
          >
            审查工作区
          </Button>
        </div>
      ))}
      {state.message && <p role="status">{state.message}</p>}
      <Dialog open={!!state.review} onOpenChange={(open) => !open && state.setReview(null)}>
        <DialogContent className="workspace-review-dialog">
          <DialogTitle>审查任务工作区</DialogTitle>
          <DialogDescription>
            先检查实际差异，再提交或快进合并。分叉、冲突、外部改动和未提交内容会阻止合并；关闭不会删除任务分支。
          </DialogDescription>
          <ScrollArea className="workspace-review-scroll">
            <pre>{state.review?.diff || '没有文本差异'}</pre>
            {!!state.review?.preservedRecoveryFiles.length && (
              <p>
                另有 {state.review.preservedRecoveryFiles.length}{' '}
                个补丁前恢复副本，保留在工作区，不纳入提交；关闭前请手动妥善保存。
              </p>
            )}
          </ScrollArea>
          <Label htmlFor="workspace-commit-message">提交说明</Label>
          <Input
            id="workspace-commit-message"
            value={commit}
            onChange={(e) => setCommit(e.target.value)}
            maxLength={1000}
          />
          <DialogFooter className="workspace-review-actions">
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => void state.action('workspaces.remove', commit)}
            >
              关闭干净工作区
            </Button>
            <Button
              variant="outline"
              disabled={state.busy || !state.review?.dirty || !commit.trim()}
              onClick={() => void state.action('workspaces.commit', commit)}
            >
              提交审查文件
            </Button>
            <Button
              disabled={state.busy || state.review?.dirty}
              onClick={() => void state.action('workspaces.merge', commit)}
            >
              快进合并到主目录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
