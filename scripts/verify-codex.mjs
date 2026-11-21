import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const child = spawn(process.env.DEVLY_CODEX_PATH || 'codex', ['app-server'], {
  stdio: ['pipe', 'pipe', 'pipe'],
})
const lines = createInterface({ input: child.stdout })
let completed = false
const timer = setTimeout(() => finish(new Error('Codex initialization timed out')), 15000)
function finish(error) {
  if (completed) return
  completed = true
  clearTimeout(timer)
  lines.close()
  child.stdin.end()
  child.kill()
  if (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
child.on('error', finish)
child.on('exit', (code) => {
  if (!completed) finish(new Error(`Codex exited before initialization: ${code}`))
})
child.stderr.on('data', () => {
  /* Drain diagnostics; never print authentication or configuration details. */
})
lines.on('line', (line) => {
  try {
    const message = JSON.parse(line)
    if (message.id !== 1) return
    if (message.error) {
      finish(new Error(`Codex initialization rejected: ${message.error.message}`))
      return
    }
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
    console.log(
      'Codex App Server initialization handshake passed. No model turn or code operation was started.',
    )
    finish()
  } catch {
    finish(new Error('Invalid JSON from Codex App Server'))
  }
})
child.stdin.write(
  `${JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'devly', title: 'Devly', version: '0.1.0' } } })}\n`,
)
