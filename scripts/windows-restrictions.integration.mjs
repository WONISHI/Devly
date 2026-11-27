// A real Windows guard check; passing is NOT an implemented Windows OS sandbox or PTY.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
if (process.platform !== 'win32') {
  console.log(
    JSON.stringify({
      host: process.platform,
      status: 'not_run',
      reason: 'Real Windows required; no simulated acceptance',
    }),
  )
  process.exit(2)
}
const { executeProjectCommand } = await import('../out/main/command-executor.js')
const { applyIsolatedPatch } = await import('../out/main/isolated-patch.js')
const { TerminalService } = await import('../out/main/terminal-service.js')
const { ReadOnlyToolbox } = await import('../out/main/agent-tools.js')
const root = await mkdtemp(join(tmpdir(), 'Devly Windows 中文 ')),
  project = join(root, '项目 空格'),
  signal = new AbortController().signal
try {
  await mkdir(project)
  await writeFile(join(project, 'source.txt'), 'UNCHANGED')
  await writeFile(join(root, 'outside.txt'), 'OUTSIDE')
  await assert.rejects(
    executeProjectCommand(project, { command: 'echo unexpected>unsafe.txt' }, signal),
    /UNSUPPORTED_PLATFORM/,
  )
  await assert.rejects(applyIsolatedPatch(project, { changes: [] }, signal), /UNSUPPORTED_PLATFORM/)
  const terminal = new TerminalService({
    execute: async () => {
      throw Error('Unsupported terminal must not enter project preparation')
    },
  })
  await assert.rejects(
    terminal.execute(
      'terminal.create',
      { projectId: 'unused', cols: 80, rows: 24 },
      'fixture',
      () => true,
    ),
    (e) => e.info?.code === 'FORBIDDEN',
  )
  await terminal.close()
  const toolbox = await ReadOnlyToolbox.create(project, signal)
  await assert.rejects(toolbox.execute('read_file', JSON.stringify({ path: '../outside.txt' })))
  assert.equal(await readFile(join(project, 'source.txt'), 'utf8'), 'UNCHANGED')
  await assert.rejects(readFile(join(project, 'unsafe.txt')))
  console.log(
    JSON.stringify(
      {
        host: process.platform,
        arch: process.arch,
        status: 'restricted_preview_guards_passed',
        windowsIsolation: 'not_implemented',
        windowsTerminal: 'not_implemented',
        T12: 'partial',
        checks: [
          'command/patch/terminal reject before dispatch',
          'real project traversal denied',
          'files unchanged; Chinese and spaced path',
        ],
      },
      null,
      2,
    ),
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
