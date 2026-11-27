import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SelectField } from '@/components/forms/SelectField'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Commit,
  CommitHeader,
  CommitHash,
  CommitMessage,
  CommitInfo,
  CommitAuthor,
  CommitMetadata,
  CommitTimestamp,
  CommitCopyButton,
  CommitContent,
  CommitFiles,
  CommitFile,
  CommitFilePath,
  CommitFileStatus,
  CommitFileChanges,
  CommitFileAdditions,
  CommitFileDeletions,
} from '@/components/ai-elements/commit'
import { useEditorStore, isDirty } from '@/features/editor/store'
import type { DataResult } from '@shared/data-contracts'
import type { GitCommit, GitSnapshot } from '@shared/workbench-contracts'

function HistoryCommit({ commit, projectId }: { commit: GitCommit; projectId: string }) {
  const [open, setOpen] = useState(false),
    [details, setDetails] = useState<DataResult<'git.details'> | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    if (!open || details) return
    let active = true
    void desktop
      .data('git.details', { projectId, hash: commit.hash })
      .then((value) => {
        if (active) setDetails(value)
      })
      .catch(() => {
        if (active) setError('提交详情读取失败')
      })
    return () => {
      active = false
    }
  }, [open, details, projectId, commit.hash])
  return (
    <Commit open={open} onOpenChange={setOpen} data-git-hash={commit.hash}>
      <CommitHeader
        role="button"
        tabIndex={0}
        aria-label={`提交 ${commit.hash.slice(0, 7)}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <CommitInfo>
          <CommitMessage>{commit.subject}</CommitMessage>
          <CommitMetadata>
            <CommitAuthor>{commit.author}</CommitAuthor>
            <CommitHash>{commit.hash.slice(0, 7)}</CommitHash>
            <CommitTimestamp date={new Date(commit.timestamp)} />
          </CommitMetadata>
        </CommitInfo>
        <CommitCopyButton hash={commit.hash} aria-label="复制提交哈希" />
      </CommitHeader>
      <CommitContent>
        {error ? (
          <p role="alert">{error}</p>
        ) : details ? (
          <CommitFiles>
            {details.files.map((file) => (
              <CommitFile key={file.path}>
                <CommitFileStatus status={file.status} />
                <CommitFilePath>
                  {file.oldPath ? `${file.oldPath} → ` : ''}
                  {file.path}
                </CommitFilePath>
                <CommitFileChanges>
                  {file.additions === null ? (
                    <span>二进制/统计不可用</span>
                  ) : (
                    <>
                      <CommitFileAdditions count={file.additions} />
                      <CommitFileDeletions count={file.deletions ?? 0} />
                    </>
                  )}
                </CommitFileChanges>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void useEditorStore
                      .getState()
                      .open(projectId, file.path)
                      .catch(() => setError('当前文件不可用'))
                  }
                >
                  打开当前文件
                </Button>
              </CommitFile>
            ))}
            {details.truncated && <p>变化列表已截断</p>}
          </CommitFiles>
        ) : (
          <p>读取实际提交详情…</p>
        )}
      </CommitContent>
    </Commit>
  )
}
export function GitPanel({ projectId }: { projectId: string }) {
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null),
    [history, setHistory] = useState<GitCommit[]>([]),
    [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [view, setView] = useState<'changes' | 'history'>('history')
  const [commitMessage, setCommitMessage] = useState(''),
    [author, setAuthor] = useState(''),
    [email, setEmail] = useState(''),
    [branch, setBranch] = useState('')
  const [confirm, setConfirm] = useState<'commit' | 'delete' | null>(null)
  const refresh = async () => {
    const [value, log] = await Promise.all([
      desktop.data('git.snapshot', { projectId }),
      desktop.data('git.history', { projectId }),
    ])
    setSnapshot(value)
    setHistory(log.commits)
    setNext(log.next)
    setAuthor((old) => old || value.author)
    setEmail((old) => old || value.email)
  }
  useEffect(() => {
    let active = true
    void Promise.all([
      desktop.data('git.snapshot', { projectId }),
      desktop.data('git.history', { projectId }),
    ])
      .then(([value, log]) => {
        if (active) {
          setSnapshot(value)
          setHistory(log.commits)
          setNext(log.next)
          setAuthor(value.author)
          setEmail(value.email)
        }
      })
      .catch(() => {
        if (active) setMessage('Git 读取失败')
      })
    return () => {
      active = false
    }
  }, [projectId])
  const run = (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    void work()
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Git 操作失败'))
      .finally(() => setBusy(false))
  }
  const result = async (value: DataResult<'git.commit'>) => {
    setMessage(value.message)
    if (value.ok) {
      setConfirm(null)
      if (value.hash) setCommitMessage('')
    }
    await refresh()
  }
  const dirty = Object.values(useEditorStore((state) => state.documents)).some(
    (doc) => doc.projectId === projectId && isDirty(doc),
  )
  if (!snapshot) return <p className="editor-tree-note">{message || '读取本地 Git…'}</p>
  if (!snapshot.available)
    return (
      <p className="editor-tree-note">
        {snapshot.reason === 'non_git'
          ? '当前不是 Git 仓库'
          : snapshot.reason === 'subdirectory'
            ? '请打开仓库根目录使用 Git 面板'
            : '当前平台或仓库的 Git 服务不可用'}
      </p>
    )
  return (
    <section className="git-panel" aria-label="Git 工作区">
      <div className="git-toolbar">
        <strong>
          {snapshot.branch || '分离 HEAD'} · {snapshot.head?.slice(0, 7) || '尚无提交'}
        </strong>
        <Button size="sm" variant="ghost" onClick={() => run(refresh)} disabled={busy}>
          刷新 Git
        </Button>
        <Button
          size="sm"
          variant={view === 'history' ? 'secondary' : 'ghost'}
          onClick={() => setView('history')}
        >
          提交历史
        </Button>
        <Button
          size="sm"
          variant={view === 'changes' ? 'secondary' : 'ghost'}
          onClick={() => setView('changes')}
        >
          暂存与提交
        </Button>
      </div>
      {message && (
        <p role="status" className="git-result">
          {message}
        </p>
      )}
      {snapshot.conflicts && (
        <p role="alert">存在未解决冲突；工作区内容保留，当前不能提交或切换分支。</p>
      )}
      {dirty && (
        <p className="editor-tree-note">
          有未保存编辑。Git 操作针对磁盘与暂存区，请先保存后提交或切换分支。
        </p>
      )}
      <fieldset disabled={busy || !snapshot.writable || dirty} className="git-branch-controls">
        <SelectField
          label="本地分支"
          value={snapshot.branch || '__detached'}
          options={[
            {
              value: '__detached',
              label: snapshot.branch ? '选择分支' : '分离 HEAD',
              disabled: true,
            },
            ...snapshot.branches.map((value) => ({ value, label: value })),
          ]}
          onValueChange={(name) =>
            run(async () =>
              result(
                await desktop.data('git.branch', {
                  projectId,
                  token: snapshot.token,
                  action: 'switch',
                  name,
                }),
              ),
            )
          }
        />
        <Input
          aria-label="新分支名称"
          placeholder="新分支名称"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!branch.trim()}
          onClick={() =>
            run(async () =>
              result(
                await desktop.data('git.branch', {
                  projectId,
                  token: snapshot.token,
                  action: 'create',
                  name: branch.trim(),
                }),
              ),
            )
          }
        >
          新建并切换
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!branch.trim()}
          onClick={() => setConfirm('delete')}
        >
          删除指定分支
        </Button>
      </fieldset>
      {view === 'history' ? (
        <div className="git-history">
          {history.length ? (
            history.map((commit) => (
              <HistoryCommit key={commit.hash} commit={commit} projectId={projectId} />
            ))
          ) : (
            <p>尚无提交记录</p>
          )}
          {next && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const log = await desktop.data('git.history', { projectId, before: next })
                  setHistory((old) => [...old, ...log.commits])
                  setNext(log.next)
                })
              }
            >
              加载更早提交
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="editor-tree-note">
            只提交已暂存的磁盘版本；不自动推送。当前暂存 {snapshot.staged.length} 项。
          </p>
          {snapshot.changes.map((change) => (
            <div className="git-change" key={change.path}>
              <Button
                size="sm"
                variant="link"
                title={change.oldPath || change.path}
                onClick={() => void useEditorStore.getState().open(projectId, change.path, 'git')}
              >
                {change.path}
              </Button>
              <span>{change.status}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !snapshot.writable}
                onClick={() =>
                  run(async () =>
                    result(
                      await desktop.data('git.stage', {
                        projectId,
                        token: snapshot.token,
                        paths: [change.path],
                        staged: !snapshot.staged.includes(change.path),
                      }),
                    ),
                  )
                }
              >
                {snapshot.staged.includes(change.path) ? '取消暂存' : '暂存磁盘版本'}
              </Button>
            </div>
          ))}
          <fieldset disabled={busy || !snapshot.writable || dirty} className="git-commit-form">
            <Label htmlFor="git-author">本次提交作者</Label>
            <Input
              id="git-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="作者姓名"
            />
            <Input
              aria-label="作者邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="作者邮箱"
            />
            <Label htmlFor="git-message">提交说明</Label>
            <Textarea
              id="git-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              maxLength={4000}
            />
            <Button
              disabled={
                !snapshot.staged.length ||
                !commitMessage.trim() ||
                !author.trim() ||
                !email.trim() ||
                snapshot.conflicts
              }
              onClick={() => setConfirm('commit')}
            >
              审查本地提交
            </Button>
          </fieldset>
        </>
      )}
      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>{confirm === 'commit' ? '确认本地提交' : '删除本地分支？'}</DialogTitle>
          <DialogDescription>
            {confirm === 'commit'
              ? `将提交以下 ${snapshot.staged.length} 项。暂存区发生变化时将拒绝提交；没有远端推送。`
              : `仅尝试删除已合并的分支 ${branch}；不强制删除。`}
          </DialogDescription>
          {confirm === 'commit' && (
            <>
              <ScrollArea className="git-review-scroll" aria-label="暂存文件审查">
                <pre className="git-review">{snapshot.staged.join('\n')}</pre>
              </ScrollArea>
              <p>{commitMessage}</p>
              <p>
                {author} &lt;{email}&gt;
              </p>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () =>
                  result(
                    confirm === 'commit'
                      ? await desktop.data('git.commit', {
                          projectId,
                          token: snapshot.token,
                          message: commitMessage,
                          author,
                          email,
                        })
                      : await desktop.data('git.branch', {
                          projectId,
                          token: snapshot.token,
                          action: 'delete',
                          name: branch.trim(),
                        }),
                  ),
                )
              }
            >
              确认{confirm === 'commit' ? '本地提交' : '删除分支'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
