import type { AttachmentRef } from '@shared/attachment-contracts'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useWorkspace } from '@/store'
import { RecoveryAction } from './RecoveryAction'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import { useStickToBottomContext } from 'use-stick-to-bottom'
import { Conversation, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { ScrollBar } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@shared/data-contracts'
import { isGenerating } from '@shared/chat-contracts'
import { AgentTrace } from './AgentTrace'
import { readAgentLog } from './actions'

type Props = {
  activeTurnId?: string
  stopping?: boolean
  projectId: string
  messages: ChatMessage[]
  busy: boolean
  hasOlder: boolean
  paging: boolean
  onLoadOlder(): Promise<void>
  onRecovered(mode: 'chat' | 'read-only'): void
  onRetry(text: string, attachments: AttachmentRef[]): Promise<void>
}

const MessageRow = memo(function MessageRow({
  message,
  projectId,
  activeTurnId,
  busy,
  stopping,
  originalText,
  originalAttachments,
  onRetry,
  onRecovered,
}: Pick<Props, 'projectId' | 'activeTurnId' | 'busy' | 'stopping' | 'onRetry' | 'onRecovered'> & {
  message: ChatMessage
  originalText: string
  originalAttachments: AttachmentRef[]
}) {
  return (
    <Message
      from={message.role === 'user' ? 'user' : 'assistant'}
      data-message-id={message.id}
      data-message-state={message.state || ''}
    >
      <MessageContent>
        {message.role === 'assistant' && message.agent.mode !== 'chat' && (
          <AgentTrace
            tools={message.tools}
            info={message.agent}
            scope={
              message.turnId
                ? { projectId, sessionId: message.sessionId, turnId: message.turnId }
                : undefined
            }
            active={message.turnId === activeTurnId && busy && !stopping}
            onReadLog={(blobId) => readAgentLog(projectId, message.sessionId, blobId)}
          />
        )}
        {message.parts
          .filter((part) => part.type === 'blob')
          .map((part) => (
            <p className="message-attachment" key={part.id}>
              附件：{part.attachment?.name ?? '旧附件记录'}
              {part.attachment
                ? ` · ${part.attachment.mime} · ${(part.attachment.bytes / 1024).toFixed(1)} KiB`
                : ''}
            </p>
          ))}
        {message.parts
          .filter((part) => part.type === 'text')
          .map((part) =>
            message.role === 'user' ? (
              <p className="chat-user-text" key={part.id}>
                {part.text}
              </p>
            ) : (
              <MessageResponse key={part.id} isAnimating={isGenerating(message.state ?? undefined)}>
                {part.text ||
                  (isGenerating(message.state ?? undefined)
                    ? message.tools.some((tool) => tool.state === 'waiting_approval')
                      ? '等待操作审批…'
                      : message.tools.some((tool) => tool.state === 'queued')
                        ? '等待项目执行队列…'
                        : '正在等待回复…'
                    : '')}
              </MessageResponse>
            ),
          )}
      </MessageContent>
      {message.role === 'assistant' && (
        <div className="chat-message-meta">
          {message.model && <span>{message.model}</span>}
          {isGenerating(message.state ?? undefined) && <span role="status">正在生成…</span>}
          {message.state === 'failed' && (
            <span role="status">{message.error?.message || '生成失败'}</span>
          )}
          {message.state === 'cancelled' && (
            <span role="status">
              {message.agent.mode === 'project-write'
                ? '回合已停止，保留已有修改；命令仅确认受管进程组清理，脱组后台程序状态未验证。'
                : '已停止，保留已收到的内容'}
            </span>
          )}
          {message.agent.mode === 'project-write' &&
            ['failed', 'cancelled'].includes(message.state || '') && (
              <span>
                已有改动保留；中断后可核对恢复状态，项目任务只读继续，旧命令与审批不会重放。
              </span>
            )}
          {message.error &&
            ['INTERRUPTED', 'STORAGE', 'EXECUTION_STATE_UNKNOWN'].includes(message.error.code) &&
            message.turnId && (
              <RecoveryAction
                scope={{ projectId, sessionId: message.sessionId, turnId: message.turnId }}
                busy={busy}
                onAccepted={onRecovered}
              />
            )}
          {message.state === 'failed' &&
            message.error &&
            !['INTERRUPTED', 'CANCELLED'].includes(message.error.code) && (
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  useWorkspace
                    .getState()
                    .setSettingsGroup(
                      ['STORAGE', 'EXECUTION_STATE_UNKNOWN'].includes(message.error!.code)
                        ? 'data'
                        : message.error!.code === 'LIMIT'
                          ? 'permissions'
                          : 'providers',
                    )
                }
              >
                {['STORAGE', 'EXECUTION_STATE_UNKNOWN'].includes(message.error.code)
                  ? '检查数据与恢复'
                  : message.error.code === 'LIMIT'
                    ? '检查权限与限额'
                    : '检查供应商连接'}
              </Button>
            )}
          {message.error?.code === 'RATE_LIMITED' && message.error.retryAfterSeconds != null && (
            <span>供应商建议等待 {message.error.retryAfterSeconds} 秒后手动重试</span>
          )}
          {message.usage && <span>费用：供应商未提供，未估价</span>}
          {message.finish === 'length' && <span>已达到输出上限，可继续提问</span>}
          {message.usage?.totalTokens != null && <span>{message.usage.totalTokens} tokens</span>}
          {['failed', 'cancelled'].includes(message.state || '') &&
            message.agent.mode !== 'project-write' && (
              <Button
                variant="link"
                size="sm"
                disabled={busy || !originalText}
                title={!originalText ? '请先加载此回合的原始消息' : undefined}
                onClick={() => {
                  const text = originalText
                  if (text) void onRetry(text, originalAttachments).catch(() => {})
                }}
              >
                重新发送
              </Button>
            )}
        </div>
      )}
    </Message>
  )
})
function HistoryContent({
  projectId,
  activeTurnId,
  stopping,
  messages,
  busy,
  hasOlder,
  paging,
  onLoadOlder,
  onRetry,
  onRecovered,
}: Props) {
  const { scrollRef, contentRef, stopScroll } = useStickToBottomContext()
  const virtual = messages.length > 60,
    virtualRef = useRef<HTMLDivElement>(null),
    [scrollMargin, setScrollMargin] = useState(0)
  const actions = useRef({ onRetry, onRecovered })
  useEffect(() => {
    actions.current = { onRetry, onRecovered }
  }, [onRetry, onRecovered])
  const resend = useCallback(
    (text: string, attachments: AttachmentRef[]) => actions.current.onRetry(text, attachments),
    [],
  )
  const recovered = useCallback(
    (mode: 'chat' | 'read-only') => actions.current.onRecovered(mode),
    [],
  )
  const originals = useMemo(
    () =>
      new Map(
        messages
          .filter((m) => m.role === 'user')
          .map((m) => [
            m.turnId,
            {
              text: m.parts
                .filter((p) => p.type === 'text')
                .map((p) => p.text ?? '')
                .join('\n'),
              attachments: m.parts
                .filter((p) => p.attachment)
                .map((p) => ({ blobId: p.attachment!.id, digest: p.attachment!.digest })),
            },
          ]),
      ),
    [messages],
  )
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 4,
    getItemKey: (index) => messages[index].id,
    enabled: virtual,
    scrollMargin,
  })
  useLayoutEffect(() => {
    if (virtualRef.current && scrollRef.current)
      setScrollMargin(
        virtualRef.current.getBoundingClientRect().top -
          scrollRef.current.getBoundingClientRect().top +
          scrollRef.current.scrollTop,
      )
  }, [virtual, hasOlder, scrollRef])
  const renderMessage = (message: ChatMessage) => (
    <MessageRow
      key={message.id}
      message={message}
      projectId={projectId}
      activeTurnId={activeTurnId}
      busy={busy}
      stopping={stopping}
      originalText={originals.get(message.turnId)?.text ?? ''}
      originalAttachments={originals.get(message.turnId)?.attachments ?? []}
      onRetry={resend}
      onRecovered={recovered}
    />
  )
  const anchor = useRef<{ id: string; offset: number } | null>(null)
  useLayoutEffect(() => {
    const saved = anchor.current,
      viewport = scrollRef.current
    if (!saved || !viewport) return
    anchor.current = null
    if (virtual) {
      const index = messages.findIndex((m) => m.id === saved.id)
      if (index >= 0) virtualizer.scrollToIndex(index, { align: 'start' })
    }
    requestAnimationFrame(() => {
      const element = viewport.querySelector<HTMLElement>(`[data-message-id="${saved.id}"]`)
      if (element)
        viewport.scrollTop +=
          element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - saved.offset
      stopScroll()
    })
  }, [messages, virtual, virtualizer, scrollRef, stopScroll])

  async function older() {
    stopScroll()
    const viewport = scrollRef.current
    if (viewport) {
      const top = viewport.getBoundingClientRect().top
      const visible = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(
        (element) => element.getBoundingClientRect().bottom > top,
      )
      if (visible)
        anchor.current = {
          id: visible.dataset.messageId!,
          offset: visible.getBoundingClientRect().top - top,
        }
    }
    await onLoadOlder()
  }
  return (
    <>
      <ScrollAreaPrimitive.Root className="chat-scroll-area" type="auto">
        <ScrollAreaPrimitive.Viewport
          ref={scrollRef}
          className="chat-viewport"
          data-testid="chat-viewport"
          tabIndex={0}
          aria-label="消息滚动区域"
          onWheel={(event) => {
            if (event.deltaY < 0) stopScroll()
          }}
          onKeyDown={(event) => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stopScroll()
          }}
        >
          <div
            ref={contentRef}
            className="chat-messages"
            data-loaded-messages={messages.length}
            data-virtualized={virtual}
          >
            {hasOlder && (
              <Button variant="ghost" size="sm" disabled={paging} onClick={() => void older()}>
                {paging ? '加载中…' : '加载更早消息'}
              </Button>
            )}
            {virtual ? (
              <div
                ref={virtualRef}
                className="chat-virtual-list"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((item) => (
                  <div
                    className="chat-virtual-row"
                    data-index={item.index}
                    key={item.key}
                    ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
                  >
                    {renderMessage(messages[item.index])}
                  </div>
                ))}
              </div>
            ) : (
              messages.map(renderMessage)
            )}
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
      </ScrollAreaPrimitive.Root>
      <ConversationScrollButton aria-label="回到底部" />
    </>
  )
}
export function ChatHistory(props: Props) {
  return (
    <Conversation
      className="chat-conversation"
      initial="instant"
      resize="instant"
      aria-label="聊天记录"
    >
      <HistoryContent {...props} />
    </Conversation>
  )
}
