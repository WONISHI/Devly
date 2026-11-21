import type { ReactNode } from 'react'

type Props = { title?: string; history: ReactNode; composer: ReactNode; hasMessages: boolean }
// Layout only; durable chat operations and model/history decisions live in features/chat.
export function WorkspacePage({ title, history, composer, hasMessages }: Props) {
  return (
    <section
      className={`task-page ${hasMessages ? 'task-page-chat' : ''}`}
      aria-labelledby="task-title"
    >
      {hasMessages ? (
        <>
          <h1 id="task-title" className="chat-session-title">
            {title || '新任务'}
          </h1>
          {history}
          <div className="chat-composer-dock">{composer}</div>
        </>
      ) : (
        <div className="task-start">
          <h1 id="task-title">{title || '今天想完成什么？'}</h1>
          {history}
          {composer}
        </div>
      )}
    </section>
  )
}
