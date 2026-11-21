import { useState } from 'react'
import { ChevronDown, FolderOpen, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [changing, setChanging] = useState(false)
  const baseSettings = state.project ? state.projectSettings : state.settings
  const settings = session
    ? { ...baseSettings, defaultProviderId: session.providerId, defaultModel: session.model }
    : baseSettings
  const configured =
    state.providers.some(
      (provider) =>
        provider.id === settings.defaultProviderId && provider.protocol === 'chat-completions',
    ) && !!settings.defaultModel.trim()
  const blocked =
    chat.loading || state.loading || !!state.loadError || !!session?.archived || changing
  async function applyModel(next: Choice, newSession = false, allowHistory = false) {
    setChanging(true)
    try {
      await changeChatModel({
        projectId: state.project?.id ?? null,
        sessionId: session?.id ?? null,
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
  const composer = (
    <>
      <PromptInput
        className="task-composer"
        maxFiles={0}
        onError={() => setInputError('当前只支持纯文本，附件输入尚未接入')}
        onSubmit={async ({ text }) => {
          if (!text.trim() || chat.busy || blocked) throw new Error('当前不可发送')
          setInputError(null)
          await chat.send(text, {
            providerId: settings.defaultProviderId,
            model: settings.defaultModel,
          })
          setDraft('')
        }}
      >
        <PromptInputBody>
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
              aria-label="添加附件（尚未支持）"
              title="当前支持纯文本，附件输入将在后续阶段开放"
              disabled
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
              <span>{state.project?.name || '选择项目'}</span>
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
              onManage={() => state.setTab('providers')}
            />
            <PromptInputSubmit
              className="task-send"
              aria-label={chat.busy ? '停止生成' : '发送消息'}
              status={chat.busy ? 'streaming' : 'ready'}
              onStop={() => void chat.cancel()}
              disabled={
                chat.busy
                  ? chat.starting || chat.stopping
                  : blocked || !state.project || !configured || !draft.trim()
              }
            />
          </div>
        </PromptInputFooter>
      </PromptInput>
      <p className="task-availability">
        {session?.archived
          ? '此会话已归档，恢复后可继续'
          : chat.stopping
            ? '正在停止…'
            : chat.busy
              ? '正在生成，可停止或切换会话'
              : !state.project
                ? '选择本地项目后开始对话；只发送输入和会话历史'
                : !configured
                  ? '请选择已配置的供应商和模型'
                  : 'Enter 发送 · Shift+Enter 换行 · 当前为普通聊天'}
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
            此会话已有历史。新建会话会保留原历史；在当前会话切换后，下一次发送会将已完成的对话历史交给所选供应商。切换本身不会发送消息。
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
            messages={chat.messages}
            busy={chat.busy}
            hasOlder={chat.hasOlder}
            paging={chat.paging}
            onLoadOlder={chat.loadOlder}
            onRetry={(text) =>
              chat.send(text, {
                providerId: settings.defaultProviderId,
                model: settings.defaultModel,
              })
            }
          />
        ) : null
      }
    />
  )
}
