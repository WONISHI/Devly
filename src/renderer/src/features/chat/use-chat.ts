import { useCallback, useEffect, useRef, useState } from 'react'
import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import { isGenerating, type ChatSnapshot } from '@shared/chat-contracts'
import type { ChatMessage, Session } from '@shared/data-contracts'

type Cursor = { time: number; id: string } | null
const scope = (projectId: string, sessionId: string) => ({ projectId, sessionId })
const merge = (previous: ChatMessage[], incoming: ChatMessage[]) =>
  [...new Map([...previous, ...incoming].map((message) => [message.id, message])).values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
export function useChat(projectId: string | undefined, sessionId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ turn: null, text: '', tools: [] })
  const [cursor, setCursor] = useState<Cursor>(null)
  const [loading, setLoading] = useState(!!sessionId)
  const [paging, setPaging] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0),
    sending = useRef(false),
    initialized = useRef(false)
  const acceptedTurn = useRef<{ id: string; time: number } | null>(null)
  const loadLatest = useCallback(
    async (version: number) => {
      if (!projectId || !sessionId) return
      const page = await desktop.data('sessions.messages', {
        ...scope(projectId, sessionId),
        limit: 20,
      })
      if (version !== generation.current) return
      setMessages((old) => merge(old, page.items))
      if (!initialized.current) setCursor(page.nextCursor)
      initialized.current = true
    },
    [projectId, sessionId],
  )
  useEffect(() => {
    const version = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined,
      previous: ChatSnapshot['turn'] = null
    const poll = async () => {
      if (!projectId || !sessionId) return
      try {
        const next = await desktop.data('chat.read', scope(projectId, sessionId))
        if (version !== generation.current) return
        // A poll issued before start was accepted must not replace a newer live turn.
        const accepted = acceptedTurn.current
        if (
          accepted &&
          next.turn?.id !== accepted.id &&
          (next.turn?.startedAt ?? 0) <= accepted.time
        ) {
          timer = setTimeout(() => void poll(), 180)
          return
        }
        if (!initialized.current || previous?.id !== next.turn?.id) await loadLatest(version)
        if (version !== generation.current) return
        setSnapshot(next)
        if (next.turn) {
          const turn = next.turn
          setMessages((old) =>
            old.map((message) =>
              message.id === turn.assistantMessageId
                ? {
                    ...message,
                    parts: message.parts.map((part) =>
                      part.type === 'text' ? { ...part, text: next.text } : part,
                    ),
                    state: turn.state,
                    error: turn.error,
                    usage: turn.usage,
                    finish: turn.finish,
                    tools: next.tools,
                    agent: turn.agent,
                  }
                : message,
            ),
          )
          if (isGenerating(previous?.state) && !isGenerating(turn.state)) {
            setStopping(false)
            void useWorkspace
              .getState()
              .refresh()
              .catch(() => {})
          }
        }
        previous = next.turn
        setLoading(false)
        timer = setTimeout(() => void poll(), isGenerating(next.turn?.state) ? 180 : 1000)
      } catch (error) {
        if (version !== generation.current) return
        setError(error instanceof Error ? error.message : '聊天记录读取失败')
        setLoading(false)
      }
    }
    void poll()
    return () => {
      generation.current++
      clearTimeout(timer)
    }
  }, [projectId, sessionId, loadLatest, retry])
  async function send(
    text: string,
    binding: {
      providerId: string | null
      model: string
      mode?: 'chat' | 'read-only'
      selectedPaths?: string[]
    },
  ): Promise<void> {
    if (!text.trim() || sending.current || isGenerating(snapshot.turn?.state))
      throw new Error('请等待当前生成完成')
    if (!binding.providerId || !binding.model.trim()) throw new Error('请先选择模型')
    sending.current = true
    setStarting(true)
    setError(null)
    const version = generation.current
    let accepted = false
    try {
      const general = projectId ? null : await desktop.data('sessions.general', {})
      const targetProjectId = projectId ?? general!.projectId
      const target: Pick<Session, 'id'> =
        general ??
        (sessionId
          ? { id: sessionId }
          : await desktop.data('sessions.create', { projectId: targetProjectId, title: '新会话' }))
      useWorkspace
        .getState()
        .rememberChat(target.id, binding.mode ?? 'chat', binding.selectedPaths ?? [])
      const turn = await desktop.data('chat.start', {
        ...scope(targetProjectId, target.id),
        turnId: crypto.randomUUID(),
        text,
        expectedProviderId: binding.providerId,
        expectedModel: binding.model,
        mode: binding.mode ?? 'chat',
        selectedPaths: binding.selectedPaths ?? [],
      })
      accepted = true
      if (version === generation.current) {
        acceptedTurn.current = { id: turn.id, time: turn.startedAt ?? Date.now() }
        setSnapshot({ turn, text: '', tools: [] })
        await loadLatest(version).catch(() => setError('消息已发送，聊天记录刷新失败，请重新读取'))
      }
      // Accepted messages are never auto-resubmitted if a later UI refresh fails.
      await useWorkspace
        .getState()
        .refresh()
        .catch(() => {})
    } catch (error) {
      if (version === generation.current)
        setError(error instanceof Error ? error.message : '发送失败')
      if (!accepted) throw error
    } finally {
      sending.current = false
      if (version === generation.current) setStarting(false)
    }
  }
  async function cancel(): Promise<void> {
    const turn = snapshot.turn
    if (!projectId || !sessionId || !turn || stopping) return
    setStopping(true)
    try {
      await desktop.data('chat.cancel', { ...scope(projectId, sessionId), turnId: turn.id })
    } catch (error) {
      setStopping(false)
      setError(error instanceof Error ? error.message : '停止失败')
    }
  }
  async function loadOlder(): Promise<void> {
    if (!projectId || !sessionId || !cursor || paging) return
    const version = generation.current
    setPaging(true)
    try {
      const page = await desktop.data('sessions.messages', {
        ...scope(projectId, sessionId),
        limit: 20,
        cursor,
      })
      if (version !== generation.current) return
      setMessages((old) => merge(old, page.items))
      setCursor(page.nextCursor)
    } catch (error) {
      if (version === generation.current)
        setError(error instanceof Error ? error.message : '加载历史失败')
    } finally {
      if (version === generation.current) setPaging(false)
    }
  }
  return {
    messages,
    snapshot,
    loading,
    paging,
    starting,
    stopping,
    error,
    hasOlder: !!cursor,
    busy: starting || isGenerating(snapshot.turn?.state),
    send,
    cancel,
    loadOlder,
    retry: () => {
      setError(null)
      setRetry((value) => value + 1)
    },
  }
}
