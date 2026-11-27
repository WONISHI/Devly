import { supportsHostExecution, hostExecutionNotice } from '@shared/host-support'
import { useEffect, useRef, useState } from 'react'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { desktop } from '@/platform/desktop'
import { Button } from '@/components/ui/button'
import type { TerminalInfo } from '@shared/workbench-contracts'
const states = { running: '运行中', closing: '关闭中', exited: '已退出', unknown: '进程状态未知' }
function TerminalView({
  info,
  onInfo,
  onError,
}: {
  info: TerminalInfo
  onInfo: (info: TerminalInfo) => void
  onError: (message: string) => void
}) {
  const host = useRef<HTMLDivElement>(null),
    callbacks = useRef({ onInfo, onError })
  useEffect(() => {
    callbacks.current = { onInfo, onError }
  })
  useEffect(() => {
    if (!host.current) return
    const terminal = new Xterm({
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, monospace',
      cursorBlink: true,
      scrollback: 2000,
      allowProposedApi: false,
      convertEol: false,
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    let ended = false,
      cursor = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      writing = Promise.resolve(),
      resizeTimer: ReturnType<typeof setTimeout> | undefined
    const theme = () => {
      const dark = document.documentElement.classList.contains('dark')
      const style = getComputedStyle(document.documentElement)
      terminal.options.theme = {
        background: style.getPropertyValue('--background').trim(),
        foreground: style.getPropertyValue('--foreground').trim(),
        cursor: style.getPropertyValue('--primary').trim(),
        selectionBackground: dark ? '#414a47' : '#cce5dc',
      }
    }
    theme()
    const observer = new MutationObserver(theme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const size = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (
          ended ||
          !host.current ||
          host.current.clientWidth < 100 ||
          host.current.clientHeight < 50
        )
          return
        try {
          fit.fit()
          void desktop
            .data('terminal.resize', {
              projectId: info.projectId,
              terminalId: info.id,
              cols: Math.max(20, Math.min(500, terminal.cols)),
              rows: Math.max(5, Math.min(200, terminal.rows)),
            })
            .catch(() => {})
        } catch {
          /* A hidden or detached panel has no cell geometry yet. */
        }
      }, 50)
    }
    const resize = new ResizeObserver(size)
    resize.observe(host.current)
    void document.fonts.ready.then(size)
    const input = terminal.onData((text) => {
      if (text.length > 65536) {
        callbacks.current.onError('输入过长，未发送此段内容')
        return
      }
      for (let i = 0; i < text.length;) {
        let end = Math.min(i + 8192, text.length)
        const code = text.charCodeAt(end - 1)
        if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--
        const chunk = text.slice(i, end)
        i = end
        writing = writing
          .then(async () => {
            if (!ended)
              await desktop.data('terminal.write', {
                projectId: info.projectId,
                terminalId: info.id,
                text: chunk,
              })
          })
          .catch(() => callbacks.current.onError('终端输入未完成，请核对进程状态；没有自动重发'))
      }
    })
    const poll = async () => {
      try {
        const value = await desktop.data('terminal.read', {
          projectId: info.projectId,
          terminalId: info.id,
          after: cursor,
        })
        if (ended) return
        if (value.truncated) {
          terminal.reset()
          terminal.writeln('[早期终端输出已截断]')
        }
        if (value.text) terminal.write(value.text)
        cursor = value.cursor
        callbacks.current.onInfo(value.info)
        if (value.info.state !== 'running') return
      } catch {
        if (!ended) callbacks.current.onError('终端状态读取失败；请重新打开面板核对')
        return
      }
      if (!ended) timer = setTimeout(() => void poll(), 150)
    }
    void poll()
    terminal.focus()
    const focus = () => terminal.focus()
    host.current.addEventListener('devly:focus-terminal', focus)
    const element = host.current
    return () => {
      ended = true
      clearTimeout(timer)
      clearTimeout(resizeTimer)
      input.dispose()
      resize.disconnect()
      observer.disconnect()
      element.removeEventListener('devly:focus-terminal', focus)
      terminal.dispose()
    }
  }, [info.id, info.projectId])
  return (
    <div
      className="interactive-terminal-host"
      ref={host}
      data-terminal-id={info.id}
      data-terminal-state={info.state}
      aria-label="交互终端内容"
    />
  )
}
export default function TerminalPanel({
  projectId,
  onHide,
}: {
  projectId: string
  onHide: () => void
}) {
  const [sessions, setSessions] = useState<TerminalInfo[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void desktop
      .data('terminal.list', { projectId })
      .then((value) => {
        if (active) {
          setSessions(value)
          setSelected(value[0]?.id ?? null)
        }
      })
      .catch(() => {
        if (active) setError('终端列表不可用')
      })
    return () => {
      active = false
    }
  }, [projectId])
  const run = (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    void work()
      .catch((e) => setError(e instanceof Error ? e.message : '终端操作失败'))
      .finally(() => setBusy(false))
  }
  const active = sessions.find((s) => s.id === selected)
  return (
    <section className="terminal-panel" aria-label="用户交互终端">
      {!supportsHostExecution(desktop.getPlatform()) && (
        <p role="status">{hostExecutionNotice(desktop.getPlatform())}</p>
      )}
      <div className="terminal-toolbar">
        <strong>交互终端</strong>
        <span>用户输入 · 项目受限 Shell</span>
        <div className="terminal-tabs" role="tablist" aria-label="终端标签">
          {sessions.map((session, index) => (
            <Button
              key={session.id}
              role="tab"
              aria-selected={session.id === selected}
              size="sm"
              variant={session.id === selected ? 'secondary' : 'ghost'}
              onClick={() => setSelected(session.id)}
            >
              终端 {index + 1}
              {session.state === 'exited' ? '（已退出）' : ''}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || sessions.length >= 4 || !supportsHostExecution(desktop.getPlatform())}
          onClick={() =>
            run(async () => {
              const value = await desktop.data('terminal.create', { projectId, cols: 80, rows: 24 })
              setSessions((old) => [...old, value])
              setSelected(value.id)
            })
          }
        >
          新建终端
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!active || busy}
          onClick={() => {
            if (active)
              run(async () => {
                const result = await desktop.data('terminal.close', {
                  projectId,
                  terminalId: active.id,
                })
                if (result.state === 'unknown') {
                  setError('进程清理状态未知，请核对；未显示为已关闭')
                  setSessions((old) => old.map((s) => (s.id === result.id ? result : s)))
                  return
                }
                const next = sessions.filter((s) => s.id !== active.id)
                setSessions(next)
                setSelected(next[0]?.id ?? null)
              })
          }}
        >
          关闭终端
        </Button>
        <Button size="sm" variant="ghost" onClick={onHide}>
          收起终端
        </Button>
      </div>
      {error && (
        <p role="alert" className="editor-error">
          {error}
        </p>
      )}
      {active ? (
        <>
          <TerminalView
            key={active.id}
            info={active}
            onInfo={(value) =>
              setSessions((old) =>
                old.map((s) =>
                  s.id === value.id &&
                  (s.state !== value.state ||
                    s.cols !== value.cols ||
                    s.rows !== value.rows ||
                    s.exitCode !== value.exitCode)
                    ? value
                    : s,
                ),
              )
            }
            onError={setError}
          />
          <p className="terminal-status" role="status">
            {states[active.state]}
            {active.exitCode !== null ? ` · 退出码 ${active.exitCode}` : ''} · {active.cwd} ·{' '}
            {active.cols}×{active.rows}
          </p>
        </>
      ) : (
        <div className="terminal-empty">
          <p>在所选项目目录新建交互终端。</p>
          <p>无网络，不读取个人 Shell 配置；Agent 命令输出在工具记录中单独展示。</p>
        </div>
      )}
    </section>
  )
}
