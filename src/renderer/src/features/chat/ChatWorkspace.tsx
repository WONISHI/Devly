import { useState } from 'react'
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
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [changing, setChanging] = useState(false)
  const preferences = session ? state.chatPreferences[session.id] : undefined
  const [mode, setMode] = useState<'chat' | 'read-only'>(preferences?.mode ?? 'chat')
  const [selectedPaths, setSelectedPaths] = useState(preferences?.selectedPaths.join(', ') ?? '')
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
      <fieldset className="agent-mode-controls" disabled={chat.busy || blocked}>
        <SelectField
          label="运行模式"
          value={mode}
          onValueChange={(value) => setMode(value as typeof mode)}
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
          ]}
        />
        {mode === 'read-only' && (
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
      {mode === 'read-only' && (
        <p className="agent-scope-notice">
          将向当前模型发送项目约定、选中文件及工具读取的内容；只允许目录、文件与文本搜索，不执行写入或命令。
        </p>
      )}
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
            mode,
            selectedPaths:
              mode === 'read-only'
                ? selectedPaths
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean)
                : [],
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
                  : blocked ||
                    !configured ||
                    !draft.trim() ||
                    (mode === 'read-only' && (!state.project || state.project.managed))
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
              : !state.project || state.project.managed
                ? '可直接聊天；选择本地项目后可使用只读 Agent'
                : !configured
                  ? '请选择已配置的供应商和模型'
                  : `Enter 发送 · Shift+Enter 换行 · 当前为${mode === 'read-only' ? '只读 Agent' : '普通聊天'}`}
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
            projectId={state.project!.id}
            messages={chat.messages}
            busy={chat.busy}
            hasOlder={chat.hasOlder}
            paging={chat.paging}
            onLoadOlder={chat.loadOlder}
            onRetry={(text) =>
              chat.send(text, {
                providerId: settings.defaultProviderId,
                model: settings.defaultModel,
                mode,
                selectedPaths:
                  mode === 'read-only'
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
