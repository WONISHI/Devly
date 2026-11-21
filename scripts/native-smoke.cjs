const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const pty = require('node-pty')
const db = new Database(':memory:')
assert.equal(db.prepare('select 42 as value').get().value, 42)
db.close()
console.log('SQLite query passed under Electron Node', process.versions.node)
const terminal = pty.spawn(
  process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  process.platform === 'win32' ? ['/c', 'echo DEVLY_PTY_OK'] : ['-c', 'printf DEVLY_PTY_OK'],
  { cols: 80, rows: 24, cwd: process.cwd(), env: process.env },
)
let output = ''
terminal.onData((chunk) => {
  output += chunk
})
const timer = setTimeout(() => {
  terminal.kill()
  console.error('PTY timed out')
  process.exit(1)
}, 10000)
terminal.onExit(({ exitCode }) => {
  clearTimeout(timer)
  assert.equal(exitCode, 0)
  assert.ok(output.includes('DEVLY_PTY_OK'))
  console.log('PTY spawn/output/exit passed')
})
