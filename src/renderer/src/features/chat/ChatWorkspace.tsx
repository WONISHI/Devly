import { supportsHostExecution, hostExecutionNotice } from '@shared/host-support'
import {
  handoffAttachmentDraft,
  readAttachmentDraft,
  clearAttachmentDraft,
} from './attachment-draft'
import { desktop } from '@/platform/desktop'
import type { AttachmentInfo } from '@shared/attachment-contracts'
import { useState, useEffect } from 'react'
import { ChevronDown, FolderOpen, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/forms/SelectField'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'
import { WorkspacePage, WorkspaceModelPicker } from '@/features/workspace'
import { useWorkspace } from '@/store'
import { ChatHistory } from './ChatHistory'
import { useChat } from './use-chat'
import { changeChatModel } from './actions'

type Choice = { providerId: string; model: string }
export function ChatWorkspace({ openProject }: { openProject(): Promise<void> }) {
  const state = useWorkspace()
  const session = state.activeSession
  const chat = useChat(state.project?.id, session?.id)
  const [restoredDraft] = useState(() => readAttachmentDraft(session?.id))
  useEffect(() => {
    if (restoredDraft) clearAttachmentDraft(restoredDraft)
  }, [restoredDraft])
  const [delegation, setDelegation] = useState(restoredDraft?.delegation ?? false)
  const [draft, setDraft] = useState(restoredDraft?.text ?? '')
  const [attachments, setAttachments] = useState<AttachmentInfo[]>(restoredDraft?.attachments ?? [])
  const [attachmentScope, setAttachmentScope] = useState<
    { projectId: string; sessionId: string } | undefined
  >(restoredDraft?.scope)
  const [importing, setImporting] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [changing, setChanging] = useState(false)
  const preferences = session ? state.chatPreferences[session.id] : undefined
  const [mode, setMode] = useState<'chat' | 'read-only' | 'project-write'>(
    restoredDraft?.mode ?? preferences?.mode ?? 'chat',
  )
  const [selectedPaths, setSelectedPaths] = useState(
    restoredDraft?.paths ?? preferences?.selectedPaths.join(', ') ?? '',
  )
  const baseSettings = state.project ? state.projectSettings : state.settings
  const settings = session
    ? { ...baseSettings, defaultProviderId: session.providerId, defaultModel: session.model }
    : baseSettings
  const vision =
    state.providers.find((p) => p.id === settings.defaultProviderId)?.compatibility.vision ??
    'unknown'
  const invalidImages = vision !== 'supported' && attachments.some((a) => a.mime !== 'text/plain')
  const configured =
    state.providers.some((provider) => provider.id === settings.defaultProviderId) &&
    !!settings.defaultModel.trim()
  const blocked =
    chat.loading ||
    state.loading ||
    !!state.loadError ||
    !!session?.archived ||
    state.pendingRestore ||
    changing
  async function applyModel(next: Choice, newSession = false, allowHistory = false) {
    setChanging(true)
    try {
      if (attachmentScope && attachmentScope.sessionId !== session?.id)
        handoffAttachmentDraft({
          text: draft,
          attachments,
          scope: attachmentScope,
          mode,
          paths: selectedPaths,
          delegation,
        })
      await changeChatModel({
        projectId: attachmentScope?.projectId ?? state.project?.id ?? null,
        sessionId: attachmentScope?.sessionId ?? session?.id ?? null,
        settings: baseSettings,
        ...next,
        newSession,
        allowHistory,
      })
      setChoice(null)
    } catch (error) {
      setInputError(error instanceof Error ? error.message : '切换模型失败')
      throw error
    } finally {
      setChanging(false)
    }
  }
  async function selectModel(providerId: string, model: string) {
    if (providerId === settings.defaultProviderId && model === settings.defaultModel) return
    const next = { providerId, model }
    if (session?.hasMessages) setChoice(next)
    else await applyModel(next)
  }
  async function addAttachment() {
    if (importing || chat.busy || blocked || attachments.length >= 4) return
    setImporting(true)
    setInputError(null)
    try {
      const result = await desktop.data('attachments.import', {
        projectId: attachmentScope?.projectId ?? state.project?.id ?? null,
        sessionId: attachmentScope?.sessionId ?? session?.id ?? null,
      })
      if (result) {
        setAttachmentScope({ projectId: result.projectId, sessionId: result.sessionId })
        setAttachments((items) => [...items, result.attachment])
      }
    } catch (error) {
      setInputError(error instanceof Error ? error.message : '附件导入失败')
    } finally {
      setImporting(false)
    }
  }
  const composer = (
    <>
      {state.pendingRestore ? (
        <div role="status" className="chat-error">
          已安排下次启动恢复，暂停新消息以免历史被备份替换。
          <Button variant="link" onClick={() => state.setSettingsGroup('data')}>
            管理待恢复操作
          </Button>
        </div>
      ) : !configured ? (
        <div role="status" className="chat-error">
          添加供应商并选择模型后即可聊天。
          <Button variant="link" onClick={() => state.setSettingsGroup('providers')}>
            配置模型供应商
          </Button>
        </div>
      ) : null}
      {state.project && !state.project.managed && !state.project.available && (
        <div role="alert" className="chat-error">
          项目目录不可用，请重新选择有效目录。
          <Button
            variant="link"
            onClick={() =>
              void openProject().catch(() => setInputError('打开项目失败，请检查目录权限'))
            }
          >
            重新选择项目
          </Button>
        </div>
      )}
      {session?.archived && (
        <Button
          variant="outline"
          onClick={() =>
            void state
              .archiveSession(session.id, false)
              .catch(() => setInputError('恢复会话失败，请重新读取'))
          }
        >
          恢复此会话
        </Button>
      )}
      <fieldset className="agent-mode-controls" disabled={chat.busy || blocked}>
        <SelectField
          label="运行模式"
          value={mode}
          onValueChange={(value) => {
            setMode(value as typeof mode)
            if (value !== 'project-write') setDelegation(false)
          }}
          options={[
            { value: 'chat', label: '普通聊天' },
            {
              value: 'read-only',
              label: '只读 Agent',
              disabled:
                !state.project ||
                state.project.managed ||
                state.providers
                  .find((p) => p.id === settings.defaultProviderId)
                  ?.report?.checks.find((check) => check.kind === 'tools')?.ok === false ||
                state.providers.find((p) => p.id === settings.defaultProviderId)?.compatibility
                  .tools === 'disabled',
            },
            {
              value: 'project-write',
              label: '项目 Agent（逐次审批）',
              disabled:
                !state.project ||
                state.project.managed ||
                baseSettings.projectPermission !== 'ask' ||
                !supportsHostExecution(desktop.getPlatform()),
            },
          ]}
        />
        {!supportsHostExecution(desktop.getPlatform()) && (
          <p role="status">{hostExecutionNotice(desktop.getPlatform())}</p>
        )}
        {mode === 'project-write' && (
          <SelectField
            label="多 Agent 委派"
            value={String(delegation)}
            onValueChange={(value) => setDelegation(value === 'true')}
            options={[
              { value: 'false', label: '单任务' },
              { value: 'true', label: '允许提议子任务（另行审批）' },
            ]}
          />
        )}
        {mode !== 'chat' && (
          <div className="agent-selected-files">
            <Label htmlFor="agent-selected-paths">选中文件（可选）</Label>
            <Input
              id="agent-selected-paths"
              placeholder="项目相对路径，用逗号分隔"
              value={selectedPaths}
              onChange={(event) => setSelectedPaths(event.target.value)}
            />
          </div>
        )}
      </fieldset>
      {mode !== 'chat' && (
        <p className="agent-scope-notice">
          {mode === 'project-write'
            ? '将向当前模型发送项目上下文；每次修改或命令均需审批。macOS 限定在项目范围，本地命令不开放目录外和网络；已单独启用的远程工具需独立审批。'
            : '将向当前模型发送项目约定、选中文件及工具读取的内容；不执行写入或命令。已单独启用的网页工具仍需每次审批。'}
        </p>
      )}
      {mode === 'project-write' && baseSettings.projectPermission !== 'ask' && (
        <p role="status">请在设置 → 权限与限额，将项目权限设置为逐次询问后使用。</p>
      )}
      <PromptInput
        className="task-composer"
        maxFiles={0}
        onError={() =>
          setInputError('请使用附件按钮通过系统文件选择器导入；不接收网页直接拖入文件')
        }
        onSubmit={async ({ text }) => {
          if (!text.trim() || chat.busy || blocked || importing || invalidImages)
            throw new Error('当前不可发送；请检查附件和视觉能力')
          setInputError(null)
          await chat.send(text, {
            providerId: settings.defaultProviderId,
            model: settings.defaultModel,
            mode,
            allowDelegation: delegation,
            attachments: attachments.map((a) => ({ blobId: a.id, digest: a.digest })),
            attachmentScope,
            selectedPaths:
              mode !== 'chat'
                ? selectedPaths
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean)
                : [],
          })
          setDraft('')
          setAttachments([])
          setAttachmentScope(undefined)
        }}
      >
        <PromptInputBody>
          {!!attachments.length && (
            <div className="chat-attachments">
              {attachments.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.name} · {item.mime.startsWith('image/') ? '图片' : '文本'} ·{' '}
                    {(item.bytes / 1024).toFixed(1)} KiB
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={chat.busy || importing}
                    aria-label={`移除附件 ${item.name}`}
                    onClick={() => setAttachments((items) => items.filter((a) => a.id !== item.id))}
                  >
                    移除
                  </Button>
                </div>
              ))}
            </div>
          )}
          {invalidImages && (
            <p role="status">
              此模型视觉能力未知或不支持，图片不会发送；移除图片或选择已声明支持视觉的模型。
            </p>
          )}
          {!!attachments.length && (
            <p className="attachment-transfer">
              发送会把这些文件内容及会话内附件历史交给当前所选供应商；图像 Token
              为估算，实际由供应商报告。
            </p>
          )}
          <PromptInputTextarea
            aria-label="任务输入"
            className="task-input"
            placeholder="描述你想完成的任务…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={32768}
            disabled={chat.busy || blocked}
          />
        </PromptInputBody>
        <PromptInputFooter className="task-toolbar">
          <PromptInputTools>
            <PromptInputButton
              aria-label="添加附件"
              type="button"
              title="UTF-8 文本 ≤128 KiB；PNG/JPEG/WebP ≤2 MiB，最多4个；图片需模型声明支持视觉"
              disabled={chat.busy || blocked || importing || attachments.length >= 4}
              onClick={() => void addAttachment()}
            >
              <Paperclip size={15} />
            </PromptInputButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                void openProject().catch((error) =>
                  setInputError(error instanceof Error ? error.message : '打开项目失败'),
                )
              }
              aria-label="选择项目"
              className="task-project-selector"
            >
              <FolderOpen size={15} />
              <span>
                {state.project && !state.project.managed ? state.project.name : '选择项目'}
              </span>
              <ChevronDown size={12} />
            </Button>
          </PromptInputTools>
          <div className="task-model-controls">
            <WorkspaceModelPicker
              providers={state.providers}
              settings={settings}
              scopeLabel={session ? '当前会话' : state.project ? '当前项目' : '应用默认'}
              disabled={chat.busy || blocked || changing}
              onSelect={selectModel}
              onManage={() => state.setSettingsGroup('providers')}
            />
            <PromptInputSubmit
              className="task-send"
              aria-label={chat.busy ? '停止生成' : '发送消息'}
              status={chat.busy ? 'streaming' : 'ready'}
              onStop={() => void chat.cancel()}
              disabled={
                chat.busy
                  ? chat.starting || chat.stopping
                  : blocked ||
                    importing ||
                    invalidImages ||
                    !configured ||
                    !draft.trim() ||
                    (mode !== 'chat' && (!state.project || state.project.managed))
              }
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
      <p className="task-availability">
        {session?.archived
          ? '此会话已归档，恢复后可继续'
          : chat.stopping
            ? '正在停止，等待网络、审批队列与进程清理确认…'
            : chat.busy
              ? chat.snapshot.turn?.phase === 'queued'
                ? '回合排队中；最多 4 个并发，同目录写任务串行，可停止此排队项'
                : chat.snapshot.turn?.phase === 'waiting_children'
                  ? '子任务执行中；可打开子任务审批，停止父任务将传播至子任务'
                  : chat.snapshot.turn?.phase === 'waiting_approval'
                    ? '等待操作审批，可在记录中允许或拒绝'
                    : '正在生成，可停止或切换会话'
              : !state.project || state.project.managed
                ? '可直接聊天；选择本地项目后可使用只读 Agent'
                : !configured
                  ? '请选择已配置的供应商和模型'
                  : `Enter 发送 · Shift+Enter 换行 · 当前为${mode === 'project-write' ? '项目 Agent（逐次审批）' : mode === 'read-only' ? '只读 Agent' : '普通聊天'}`}
      </p>
      {(inputError || chat.error) && (
        <div role="alert" className="chat-error">
          {inputError || chat.error}
          {chat.error && (
            <Button type="button" variant="link" size="sm" onClick={chat.retry}>
              重新读取
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={!!choice}
        onOpenChange={(open) => {
          if (!open && !changing) setChoice(null)
        }}
      >
        <DialogContent>
          <DialogTitle>切换会话模型</DialogTitle>
          <DialogDescription>
            此会话已有历史。新建会话会保留原历史；在当前会话切换后，下一次发送会将已完成的对话和附件内容交给所选供应商。切换本身不会发送消息；不支持视觉的模型不能接收图片历史。
          </DialogDescription>
          <p className="chat-switch-model">
            {state.providers.find((provider) => provider.id === choice?.providerId)?.name} ·{' '}
            {choice?.model}
          </p>
          <DialogFooter className="chat-switch-actions">
            <Button variant="ghost" disabled={changing} onClick={() => setChoice(null)}>
              取消
            </Button>
            <Button
              variant="outline"
              disabled={changing}
              onClick={() => choice && void applyModel(choice, false, true).catch(() => {})}
            >
              保留历史并切换
            </Button>
            <Button
              disabled={changing}
              onClick={() => choice && void applyModel(choice, true).catch(() => {})}
            >
              新建会话使用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
  return (
    <WorkspacePage
      title={session?.title}
      hasMessages={chat.messages.length > 0}
      composer={composer}
      history={
        chat.loading ? (
          <p className="chat-loading" role="status">
            加载聊天记录…
          </p>
        ) : chat.messages.length > 0 ? (
          <ChatHistory
            projectId={state.project!.id}
            activeTurnId={chat.snapshot.turn?.id}
            stopping={chat.stopping || chat.snapshot.turn?.phase === 'stopping'}
            messages={chat.messages}
            busy={chat.busy}
            hasOlder={chat.hasOlder}
            paging={chat.paging}
            onLoadOlder={chat.loadOlder}
            onRecovered={(nextMode) => {
              setMode(nextMode)
              if (session) state.rememberChat(session.id, nextMode, [])
              chat.retry()
            }}
            onRetry={(text, originalAttachments) =>
              chat.send(text, {
                providerId: settings.defaultProviderId,
                model: settings.defaultModel,
                mode,
                allowDelegation: delegation,
                attachments: originalAttachments,
                selectedPaths:
                  mode !== 'chat'
                    ? selectedPaths
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean)
                    : [],
              })
            }
          />
        ) : null
      }
    />
  )
}
