import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  readdir,
  rename,
  writeFile,
  realpath,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
if (process.platform !== 'darwin' || !process.env.DEVLY_EXECUTABLE)
  throw Error('Actual installed macOS executable required')
const root = await mkdtemp(join(tmpdir(), 'Devly 发行 中文 ')),
  requests = [],
  errors = [],
  checks = [],
  missing = []
let app, page
const server = createServer(async (req, res) => {
  let text = ''
  for await (const c of req) text += c
  requests.push(JSON.parse(text))
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    'data: ' +
      JSON.stringify({
        choices: [
          {
            index: 0,
            delta: { content: 'STAGE12_RENDER_OK\n\n$$\\frac{1}{2}+x^2$$' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }) +
      '\n\ndata: [DONE]\n\n',
  )
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
try {
  const seeded = spawnSync(
    createRequire(import.meta.url)('electron'),
    ['scripts/stage12-upgrade-seed.mjs', root, `http://127.0.0.1:${server.address().port}`],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30000 },
  )
  assert.equal(seeded.status, 0, `${seeded.signal}: ${seeded.stderr}`)
  const f = JSON.parse(await readFile(join(root, 'upgrade-fixture.json'), 'utf8'))
  async function launch(profile, emptyPath = false) {
    const env = { ...process.env, DEVLY_USER_DATA_DIR: profile }
    delete env.ELECTRON_RUN_AS_NODE
    if (emptyPath) {
      for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
      env.PATH = join(root, 'empty-path')
    }
    app = await electron.launch({ executablePath: process.env.DEVLY_EXECUTABLE, args: [], env })
    page = await app.firstWindow()
    page.on('pageerror', (e) => errors.push(e.message))
  }
  async function data(operation, args = {}) {
    const r = await page.evaluate(({ operation, args }) => window.devly.data(operation, args), {
      operation,
      args,
    })
    assert.equal(r.ok, true, JSON.stringify(r.error))
    return r.data
  }
  await mkdir(join(root, 'empty-path'))
  await launch(join(root, '全新 profile'), true)
  const environment = await page.evaluate(() => window.devly.getEnvironment())
  assert.equal(environment.ok, true)
  assert.equal(environment.data.git, null)
  assert.equal(environment.data.platform, 'darwin')
  await expect(page.getByRole('button', { name: '打开设置', exact: true })).toBeVisible()
  await app.close()
  app = undefined
  checks.push(
    'Fresh installed copy starts with Chinese/spaced userData and empty PATH; reports Git unavailable without requiring Codex or developer tools',
  )
  await launch(f.profile)
  await expect(page.getByText('STAGE12_UPGRADE_HISTORY', { exact: true })).toBeVisible()
  assert.equal((await data('storage.status')).version, f.toSchema)
  const backups = await readdir(join(f.profile, 'storage/backups'))
  assert.ok(backups.some((x) => x.startsWith('before-v')))
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill('RELEASE_MATH_RENDER')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.katex').first()).toBeVisible()
  assert.equal(
    await page
      .locator('.katex-mathml')
      .first()
      .evaluate((element) => getComputedStyle(element).position),
    'absolute',
  )
  assert.ok(!requests.some((r) => JSON.stringify(r).includes('sk-')))
  await page.getByRole('button', { name: '项目文件', exact: true }).click()
  await page.getByRole('button', { name: 'hello.ts', exact: true }).click()
  await expect(page.locator('[data-editor-file="hello.ts"] .monaco-editor')).toBeVisible({
    timeout: 30000,
  })
  const workerProof = await page.evaluate(() =>
    [...performance.getEntriesByType('resource')]
      .filter((x) => x.name.startsWith('http'))
      .map((x) => x.name),
  )
  assert.equal(workerProof.length, 0)
  const terminal = await data('terminal.create', { projectId: f.projectId, cols: 80, rows: 24 })
  await data('terminal.write', {
    projectId: f.projectId,
    terminalId: terminal.id,
    text: "printf '\\n__INSTALLED_PTY__\\n'\r",
  })
  await expect
    .poll(
      async () =>
        (
          await data('terminal.read', { projectId: f.projectId, terminalId: terminal.id, after: 0 })
        ).text.match(/\n__INSTALLED_PTY__\r?\n/) !== null,
    )
    .toBe(true)
  assert.equal(
    (await data('terminal.close', { projectId: f.projectId, terminalId: terminal.id })).state,
    'exited',
  )
  await app.close()
  app = undefined
  await launch(f.profile)
  const history = await data('sessions.messages', {
    projectId: f.projectId,
    sessionId: f.sessionId,
    limit: 20,
  })
  assert.ok(JSON.stringify(history).includes('STAGE12_UPGRADE_HISTORY'))
  assert.ok(JSON.stringify(history).includes('STAGE12_RENDER_OK'))
  await app.close()
  app = undefined
  checks.push(
    `Actual v${f.fromSchema} → v${f.toSchema} upgrade preserves settings/history, creates pre-migration backup; local protocol/math, local Monaco and actual PTY work after copied installation; restart retains new/old messages`,
  )
  // Alter only an owned installed copy supplied by the orchestrator, never node_modules or user files.
  if (process.env.DEVLY_RELEASE_COPY_ROOT) {
    const owned = await realpath(process.env.DEVLY_RELEASE_COPY_ROOT)
    assert.ok(owned.startsWith((await realpath(tmpdir())) + '/'))
    assert.equal(
      await readFile(join(owned, '.devly-stage12-owned-copy'), 'utf8'),
      'temporary installation fixture',
    )
    async function find(directory, name) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, item.name)
        if (item.isDirectory()) {
          const found = await find(path, name)
          if (found) return found
        } else if (item.name === name) return path
      }
      return null
    }
    const unpacked = join(
        process.env.DEVLY_RELEASE_COPY_ROOT,
        'Contents/Resources/app.asar.unpacked',
      ),
      pty = await find(unpacked, 'pty.node')
    assert.ok(pty)
    await rename(pty, pty + '.stage12-disabled')
    missing.push(pty)
    await launch(f.profile)
    await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
    const denied = await page.evaluate((args) => window.devly.data('terminal.create', args), {
      projectId: f.projectId,
      cols: 80,
      rows: 24,
    })
    assert.equal(denied.ok, false)
    assert.ok(denied.error.message.includes('原生依赖'))
    await app.close()
    app = undefined
    await rename(pty + '.stage12-disabled', pty)
    missing.pop()
    const sqlite = await find(unpacked, 'better_sqlite3.node')
    assert.ok(sqlite)
    await rename(sqlite, sqlite + '.stage12-disabled')
    missing.push(sqlite)
    await launch(join(root, '缺 SQLite profile'))
    const unavailable = await page.evaluate(() => window.devly.data('bootstrap', {}))
    assert.equal(unavailable.ok, false)
    await expect(page.locator('body')).toContainText('本地')
    await app.close()
    app = undefined
    await rename(sqlite + '.stage12-disabled', sqlite)
    missing.pop()
    checks.push(
      'Actual missing PTY native binary preserves application startup and gives reinstall guidance; missing SQLite opens error UI, does not fabricate empty history; owned-copy binaries restored',
    )
  }
  assert.deepEqual(errors, [])
  await mkdir('output', { recursive: true })
  await writeFile(
    'output/release-mac-install.json',
    JSON.stringify(
      {
        appVersion: environment.data.appVersion,
        platform: process.platform,
        arch: process.arch,
        source: 'installed copy',
        checks,
        modelFixture: true,
        realSupplier: false,
        signature: 'unsigned_preview',
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ ok: true, checks, modelRequests: requests.length }, null, 2))
} catch (error) {
  await page?.screenshot({ path: 'output/release-mac-failure.png' }).catch(() => {})
  throw error
} finally {
  await app?.close().catch(() => {})
  for (const path of missing) await rename(path + '.stage12-disabled', path).catch(() => {})
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
