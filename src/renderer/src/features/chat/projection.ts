import type { ChatSnapshot, ChatTurn } from '@shared/chat-contracts'
import type { ChatMessage } from '@shared/data-contracts'

// A fast final poll may arrive before the acknowledgement of the same start request.
export function acceptStart(current: ChatSnapshot, turn: ChatTurn, sequence: number): ChatSnapshot {
  if (current.turn?.id === turn.id) return current
  return { sequence, turn, text: '', tools: [] }
}
export function projectMessages(messages: ChatMessage[], snapshot: ChatSnapshot): ChatMessage[] {
  const turn = snapshot.turn
  if (!turn) return messages
  return messages.map((message) =>
    message.id === turn.assistantMessageId
      ? {
          ...message,
          parts: message.parts.map((part) =>
            part.type === 'text' ? { ...part, text: snapshot.text } : part,
          ),
          state: turn.state,
          error: turn.error,
          usage: turn.usage,
          finish: turn.finish,
          tools: snapshot.tools,
          agent: turn.agent,
        }
      : message,
  )
}
