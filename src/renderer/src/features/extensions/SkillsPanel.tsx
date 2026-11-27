import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkills } from './use-skills'
import type { SkillInfo } from '@shared/extension-contracts'
export function SkillsPanel({ projectId }: { projectId: string }) {
  const state = useSkills(projectId),
    [selected, setSelected] = useState<SkillInfo | null>(null)
  return (
    <div className="extension-panel">
      <p>
        从项目 .agents/skills、.claude/skills、.devly/skills 发现
        SKILL.md。查看并启用后，真实内容用于后续
        Agent；关联资源按需读取，脚本执行仍须单独审批。内容改变后必须重新审查。
      </p>
      <Button variant="outline" disabled={state.busy} onClick={state.scan}>
        重新扫描 Skills
      </Button>
      {state.items.length === 0 && (
        <p>没有发现可读取的 Skill。可在上述目录下创建技能文件夹和 SKILL.md。</p>
      )}
      {state.items.map((item) => (
        <div className="extension-row" key={item.path}>
          <div>
            <strong>{item.name}</strong>
            <p>
              {item.path} ·{' '}
              {item.changed ? '内容已变化，待重新审查' : item.enabled ? '已启用' : '未启用'}
            </p>
            <p>{item.description}</p>
          </div>
          <Button variant="outline" disabled={state.busy} onClick={() => setSelected(item)}>
            查看 Skill {item.name}
          </Button>
          {item.enabled && (
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => void state.toggle(item, false)}
            >
              移除 Skill {item.name}
            </Button>
          )}
        </div>
      ))}
      {state.message && <p role="status">{state.message}</p>}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="workspace-review-dialog">
          <DialogTitle>审查 Skill</DialogTitle>
          <DialogDescription>
            {selected?.path}；内容低于当前请求和运行时权限，不自动执行关联脚本。
          </DialogDescription>
          <ScrollArea className="workspace-review-scroll">
            <pre>{selected?.content}</pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              关闭
            </Button>
            <Button
              disabled={state.busy}
              onClick={() =>
                selected && void state.toggle(selected, true).then(() => setSelected(null))
              }
            >
              启用此 Skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
