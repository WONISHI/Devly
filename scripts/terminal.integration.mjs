// Actual node-pty + Electron/SQLite. Generated projects only; no provider API.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const temporary = await mkdtemp(join(tmpdir(), 'devly-pty-'))
let db, service
const checks = []
try {
  const paths = [join(temporary, 'project-a'), join(temporary, 'project-b')]
  await Promise.all(paths.map((path) => mkdir(path)))
  db = new DatabaseClient(join(temporary, 'profile'))
  await db.ready
  const projects = await Promise.all(
    paths.map(async (path) =>
      db.execute('internal.project.upsert', { path: await realpath(path) }),
    ),
  )
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}, owner = 'owner') =>
    (
      await service.execute(
        { operation, args: { projectId: projects[0].id, ...args } },
        () => true,
        owner,
      )
    ).data
  const read = (id, projectId = projects[0].id, after = 0) =>
    call('terminal.read', { terminalId: id, projectId, after })
  const write = (id, text, projectId = projects[0].id) =>
    call('terminal.write', { terminalId: id, projectId, text })
  const wait = async (id, pattern, projectId = projects[0].id) => {
    const until = Date.now() + 10000
    let value
    while (Date.now() < until) {
      value = await read(id, projectId)
      if (pattern.test(value.text)) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`PTY_RESULT_MISSING:${pattern}; ${value?.text.slice(-1000)}`)
  }
  process.env.DEVLY_PTY_SECRET_FIXTURE = 'private-env-fixture'
  const a = await call('terminal.create', { cols: 80, rows: 24 })
  await write(
    a.id,
    "printf '\\n__READY__\\n'; pwd; printf '__SECRET__:%s\\n' \"${DEVLY_PTY_SECRET_FIXTURE-unset}\"\r",
  )
  const ready = await wait(a.id, /\n__SECRET__:unset\r?\n/)
  assert.ok(ready.text.includes(await realpath(paths[0])))
  assert.equal(ready.info.state, 'running')
  assert.equal(ready.text.includes('private-env-fixture'), false)
  await call('terminal.resize', { terminalId: a.id, cols: 100, rows: 30 })
  await write(a.id, 'stty size\r')
  await wait(a.id, /\n30 100\r?\n/)
  checks.push(
    'Actual interactive shell starts at canonical project, minimal environment and real PTY resize',
  )
  const b = await call('terminal.create', { projectId: projects[1].id, cols: 80, rows: 24 })
  await write(b.id, "printf '\\n__ONLY_B__\\n'\r", projects[1].id)
  await wait(b.id, /\n__ONLY_B__\r?\n/, projects[1].id)
  assert.equal((await read(a.id)).text.includes('__ONLY_B__'), false)
  await assert.rejects(
    call('terminal.read', { terminalId: a.id, projectId: projects[1].id, after: 0 }),
    (e) => e.info?.code === 'NOT_FOUND',
  )
  await assert.rejects(
    call('terminal.write', { terminalId: a.id, text: 'not allowed' }, 'wrong-owner'),
    (e) => e.info?.code === 'NOT_FOUND',
  )
  checks.push('Multiple terminals remain project/owner scoped; cross-project input/read rejected')
  await write(a.id, "printf '\\n__SLEEP_STARTED__\\n'; /bin/sleep 30\r")
  await wait(a.id, /\n__SLEEP_STARTED__\r?\n/)
  await new Promise((resolve) => setTimeout(resolve, 100))
  await write(a.id, '\x03')
  await write(a.id, "printf '\\n__AFTER_CTRL_C__\\n'\r")
  await wait(a.id, /\n__AFTER_CTRL_C__\r?\n/)
  checks.push('Ctrl+C interrupts the actual foreground sleep and the shell accepts another command')
  await writeFile(join(paths[0], '.env'), 'PRIVATE_FILE_FIXTURE')
  await write(a.id, "/bin/cat .env; printf '\\n__DENIED_DONE__\\n'\r")
  const denied = await wait(a.id, /\n__DENIED_DONE__\r?\n/)
  assert.equal(denied.text.includes('PRIVATE_FILE_FIXTURE'), false)
  await write(
    a.id,
    'awk \'BEGIN {for(i=0;i<300000;i++)printf "x"; printf "\\n__RING_END__\\n"}\'\r',
  )
  const bounded = await wait(a.id, /\n__RING_END__\r?\n/)
  assert.equal(bounded.truncated, true)
  assert.ok(bounded.text.length <= 262144)
  checks.push(
    'Protected file content denied; terminal output ring is bounded and reports truncation',
  )
  await write(a.id, "/bin/sleep 60 & printf '\\n__CHILD__:%s\\n' $!\r")
  const bg = await wait(a.id, /\n__CHILD__:\d+\r?\n/),
    pid = Number(/\n__CHILD__:(\d+)/.exec(bg.text)[1])
  const closed = await call('terminal.close', { terminalId: a.id })
  assert.equal(closed.state, 'exited')
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.throws(() => process.kill(pid, 0))
  service.clearOwner('owner')
  const until = Date.now() + 5000
  while (Date.now() < until && (await call('terminal.list', { projectId: projects[1].id })).length)
    await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal((await call('terminal.list', { projectId: projects[1].id })).length, 0)
  checks.push(
    'Close cleans ordinary background child; owner teardown closes other project terminal',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  delete process.env.DEVLY_PTY_SECRET_FIXTURE
  await service?.close()
  await db?.close()
  await rm(temporary, { recursive: true, force: true })
}
