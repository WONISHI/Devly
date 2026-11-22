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
  projectId: string
  messages: ChatMessage[]
  busy: boolean
  hasOlder: boolean
  paging: boolean
  onLoadOlder(): Promise<void>
  onRetry(text: string): Promise<void>
}
function HistoryContent({
  projectId,
  messages,
  busy,
  hasOlder,
  paging,
  onLoadOlder,
  onRetry,
}: Props) {
  const { scrollRef, contentRef, stopScroll } = useStickToBottomContext()
  async function older() {
    stopScroll()
    const viewport = scrollRef.current
    const height = viewport?.scrollHeight ?? 0,
      top = viewport?.scrollTop ?? 0
    await onLoadOlder()
    requestAnimationFrame(() => {
      if (viewport) viewport.scrollTop = top + viewport.scrollHeight - height
      stopScroll()
    })
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
          <div ref={contentRef} className="chat-messages">
            {hasOlder && (
              <Button variant="ghost" size="sm" disabled={paging} onClick={() => void older()}>
                {paging ? '加载中…' : '加载更早消息'}
              </Button>
            )}
            {messages.map((message) => (
              <Message
                key={message.id}
                from={message.role === 'user' ? 'user' : 'assistant'}
                data-message-id={message.id}
                data-message-state={message.state || ''}
              >
                <MessageContent>
                  {message.role === 'assistant' && message.agent.mode === 'read-only' && (
                    <AgentTrace
                      tools={message.tools}
                      info={message.agent}
                      onReadLog={(blobId) => readAgentLog(projectId, message.sessionId, blobId)}
                    />
                  )}
                  {message.parts
                    .filter((part) => part.type === 'text')
                    .map((part) =>
                      message.role === 'user' ? (
                        <p className="chat-user-text" key={part.id}>
                          {part.text}
                        </p>
                      ) : (
                        <MessageResponse
                          key={part.id}
                          isAnimating={isGenerating(message.state ?? undefined)}
                        >
                          {part.text ||
                            (isGenerating(message.state ?? undefined) ? '正在等待回复…' : '')}
                        </MessageResponse>
                      ),
                    )}
                </MessageContent>
                {message.role === 'assistant' && (
                  <div className="chat-message-meta">
                    {message.model && <span>{message.model}</span>}
                    {isGenerating(message.state ?? undefined) && (
                      <span role="status">正在生成…</span>
                    )}
                    {message.state === 'failed' && (
                      <span role="status">{message.error?.message || '生成失败'}</span>
                    )}
                    {message.state === 'cancelled' && (
                      <span role="status">已停止，保留已收到的内容</span>
                    )}
                    {message.finish === 'length' && <span>已达到输出上限，可继续提问</span>}
                    {message.usage?.totalTokens != null && (
                      <span>{message.usage.totalTokens} tokens</span>
                    )}
                    {['failed', 'cancelled'].includes(message.state || '') && (
                      <Button
                        variant="link"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          const original = messages.find(
                            (item) => item.role === 'user' && item.turnId === message.turnId,
                          )
                          const text = original?.parts
                            .filter((part) => part.type === 'text')
                            .map((part) => part.text)
                            .join('\n')
                          if (text) void onRetry(text).catch(() => {})
                        }}
                      >
                        重新发送
                      </Button>
                    )}
                  </div>
                )}
              </Message>
            ))}
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
