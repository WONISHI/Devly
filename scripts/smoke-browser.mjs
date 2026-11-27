import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
const root = await mkdtemp(join(tmpdir(), 'devly-browser-ui-')),
  errors = [],
  checks = [],
  requests = []
let app, page
const actions = [
  { action: 'open_preview' },
  { action: 'fill', selector: '#name', value: 'ACTUAL_APPROVED_FILL' },
  { action: 'click', selector: '#apply' },
  { action: 'read_text' },
  { action: 'screenshot' },
  { action: 'close' },
]
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw),
    results = body.messages.filter((m) => m.role === 'tool')
  requests.push(body)
  const goal = body.messages.filter((m) => m.role === 'user').at(-1)?.content
  const list =
    goal === 'PUBLIC_BROWSER'
      ? [
          { action: 'open_url', url: 'https://example.com/' },
          { action: 'read_text' },
          { action: 'close' },
        ]
      : goal === 'BLOCK_BROWSER'
        ? [
            actions[0],
            { action: 'click', selector: '#file' },
            { action: 'fill', selector: '#password', value: 'must-not-enter' },
            { action: 'click', selector: '#choose-file' },
            { action: 'close' },
          ]
        : goal === 'STALE_BROWSER'
          ? [actions[0], actions[1]]
          : goal === 'CANCEL_BROWSER'
            ? [actions[0], actions[1]]
            : actions
  const index = results.length
  const delta =
    index < list.length
      ? {
          tool_calls: [
            {
              index: 0,
              id: 'browser-' + index,
              type: 'function',
              function: { name: 'browser_action', arguments: JSON.stringify(list[index]) },
            },
          ],
        }
      : { content: 'Actual browser fixture complete.' }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    'data: ' +
      JSON.stringify({
        choices: [{ index: 0, delta, finish_reason: index < list.length ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
      }) +
      '\n\ndata: [DONE]\n\n',
  )
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
try {
  const seed = spawnSync(
    createRequire(import.meta.url)('electron'),
    ['scripts/stage11-ui-seed.mjs', root, `http://127.0.0.1:${server.address().port}`],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 30000 },
  )
  assert.equal(seed.status, 0, `seed ${seed.signal}: ${seed.stderr}`)
  const f = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8')),
    env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
  })
  console.log('browser-ui: launched')
  app.process().stderr.on('data', (chunk) => process.stderr.write(chunk))
  page = await app.firstWindow()
  console.log('browser-ui: first window')
  page.on('pageerror', (e) => errors.push(e.message))
  async function data(operation, args = {}) {
    console.log('browser-ui:', operation)
    const result = await page.evaluate(
      ({ operation, args }) => window.devly.data(operation, args),
      { operation, args },
    )
    assert.equal(result.ok, true, JSON.stringify(result.error))
    return result.data
  }
  await data('web.save', {
    projectId: f.projectId,
    browserEnabled: true,
    browserOrigins: ['https://example.com'],
  })
  await data('preview.start', { projectId: f.projectId, entry: 'index.html' })
  await expect.poll(() => app.windows().length).toBe(2)
  async function start(text) {
    const session = await data('sessions.create', { projectId: f.projectId })
    const scope = { projectId: f.projectId, sessionId: session.id }
    await data('sessions.bind', { ...scope, providerId: f.providerId, model: 'text-fixture' })
    const turnId = randomUUID()
    await data('chat.start', {
      ...scope,
      turnId,
      text,
      expectedProviderId: f.providerId,
      expectedModel: 'text-fixture',
      mode: 'read-only',
      selectedPaths: [],
    })
    return { scope, turnId }
  }
  async function pending(scope, index) {
    await expect
      .poll(
        async () => {
          const s = await data('chat.read', scope)
          return s.tools[index]?.state
        },
        { timeout: 25000 },
      )
      .toBe('waiting_approval')
    return (await data('chat.read', scope)).tools[index]
  }
  async function approve(scope, turnId, t, allowed = true) {
    return data('chat.approve', {
      ...scope,
      turnId,
      callId: t.callId,
      approvalId: t.approval.id,
      digest: t.approval.digest,
      allowed,
    })
  }
  const run = await start('BROWSER_LOCAL')
  for (let i = 0; i < actions.length; i++) {
    console.log('browser-ui: action', i)
    const t = await pending(run.scope, i)
    if (i === 0) assert.equal(app.windows().length, 2)
    const ack = await approve(run.scope, run.turnId, t)
    assert.equal(ack.removed, true)
    assert.equal((await approve(run.scope, run.turnId, t)).removed, false)
    if (i < 5) {
      try {
        await expect.poll(() => app.windows().length).toBe(3)
      } catch (error) {
        console.error('SNAPSHOT', JSON.stringify(await data('chat.read', run.scope)))
        throw error
      }
    }
    if (i === 2) {
      const view = app
        .windows()
        .find(
          (p) =>
            p !== page &&
            p.url().startsWith('http:') &&
            p.url().includes('/index.html') &&
            p !== app.windows()[1],
        )
      assert.ok(view)
      await expect(view.locator('#result')).toHaveText('ACTUAL_APPROVED_FILL')
      assert.deepEqual(
        await view.evaluate(() => [typeof process, typeof require, typeof window.devly]),
        ['undefined', 'undefined', 'undefined'],
      )
    }
  }
  await expect.poll(async () => (await data('chat.read', run.scope)).turn.state).toBe('completed')
  await expect.poll(() => app.windows().length).toBe(2)
  const snapshot = await data('chat.read', run.scope),
    image = JSON.parse(snapshot.tools[4].output).data.image
  assert.ok(image.bytes > 1000)
  assert.equal(image.mime, 'image/png')
  const chunks = []
  for (let offset = 0; offset < image.bytes;) {
    const chunk = await data('blobs.read', {
      ...run.scope,
      blobId: image.id,
      offset,
      length: 65536,
    })
    const b = Buffer.from(chunk.base64, 'base64')
    assert.ok(b.length)
    chunks.push(b)
    offset += b.length
  }
  assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'), image.digest)
  assert.ok(JSON.parse(snapshot.tools[3].output).data.text.includes('ACTUAL_APPROVED_FILL'))
  checks.push(
    'Actual isolated preview navigation/fill/click/read/screenshot/close require six separate grants; duplicate grant rejected; real PNG digest/persistent reference; no Node/IPC',
  )
  const stale = await start('STALE_BROWSER')
  await approve(stale.scope, stale.turnId, await pending(stale.scope, 0))
  const t = await pending(stale.scope, 1)
  const browser = app.windows().at(-1)
  await browser.locator('#name').fill('USER_EDIT_DURING_APPROVAL')
  await approve(stale.scope, stale.turnId, t)
  await expect.poll(async () => (await data('chat.read', stale.scope)).turn.state).toBe('completed')
  assert.ok((await data('chat.read', stale.scope)).tools[1].error.includes('TARGET_CHANGED'))
  const cancel = await start('CANCEL_BROWSER')
  await approve(cancel.scope, cancel.turnId, await pending(cancel.scope, 0))
  const old = await pending(cancel.scope, 1)
  await data('chat.cancel', { ...cancel.scope, turnId: cancel.turnId })
  await expect
    .poll(async () => (await data('chat.read', cancel.scope)).turn.state)
    .toBe('cancelled')
  await expect.poll(() => app.windows().length).toBe(2)
  assert.equal((await approve(cancel.scope, cancel.turnId, old)).removed, false)
  checks.push(
    'Actual DOM change while approval waits rejects fill; stop revokes pending grant and destroys turn-owned window; no repeat side effect',
  )
  const blocked = await start('BLOCK_BROWSER')
  await approve(blocked.scope, blocked.turnId, await pending(blocked.scope, 0))
  const choose = await pending(blocked.scope, 3),
    blockedView = app.windows().at(-1)
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.__devlyChooserBlocked = false
    const view = BrowserWindow.getAllWindows().find(
      (w) =>
        w.getTitle() === 'Devly · 已审批浏览器' ||
        (w.webContents.getURL().includes('/index.html') && w.webContents.debugger.isAttached()),
    )
    view.webContents.debugger.on('message', (_e, method) => {
      if (method === 'Page.fileChooserOpened') globalThis.__devlyChooserBlocked = true
    })
  })
  await approve(blocked.scope, blocked.turnId, choose)
  const closeBlocked = await pending(blocked.scope, 4)
  const b = await data('chat.read', blocked.scope)
  for (const index of [1, 2]) {
    assert.equal(b.tools[index].error, 'TARGET_PROTECTED')
    assert.equal(b.tools[index].approval, null)
  }
  assert.equal(await blockedView.locator('#password').inputValue(), '')
  assert.equal(await blockedView.locator('#file').evaluate((element) => element.files.length), 0)
  await blockedView.getByRole('button', { name: 'Choose local file', exact: true }).click()
  await expect.poll(() => app.evaluate(() => globalThis.__devlyChooserBlocked)).toBe(true)
  assert.equal(await blockedView.locator('#file').evaluate((element) => element.files.length), 0)
  await approve(blocked.scope, blocked.turnId, closeBlocked)
  await expect
    .poll(async () => (await data('chat.read', blocked.scope)).turn.state)
    .toBe('completed')
  checks.push(
    'Actual protected file/password selectors rejected before approval; approved indirect button does not upload; an actual trusted UI click emits the intercepted CDP event and leaves files empty without local upload',
  )
  if (process.env.DEVLY_VERIFY_PUBLIC_BROWSER === '1') {
    const publicRun = await start('PUBLIC_BROWSER')
    for (let i = 0; i < 3; i++)
      await approve(publicRun.scope, publicRun.turnId, await pending(publicRun.scope, i))
    await expect
      .poll(async () => (await data('chat.read', publicRun.scope)).turn.state, { timeout: 30000 })
      .toBe('completed')
    const s = await data('chat.read', publicRun.scope)
    assert.equal(s.tools[0].state, 'completed', JSON.stringify(s.tools[0]))
    assert.ok(
      JSON.parse(s.tools[1].output).data.title === 'Example Domain' &&
        JSON.parse(s.tools[1].output).data.text.length > 100,
      JSON.stringify(s.tools.slice(0, 2)),
    )
    checks.push(
      'Actual public HTTPS example.com page loaded through authenticated pinned-IPv4 CONNECT proxy and DOM text read',
    )
  }
  await data('preview.stop', { projectId: f.projectId })
  await data('projects.switch', { projectId: f.projectId })
  await data('sessions.select', run.scope)
  await page.reload()
  const capture = page.locator('[data-tool-call="browser-4"]')
  await capture.locator('button').first().click()
  await page.getByRole('button', { name: '查看实际浏览器截图', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '实际浏览器截图', exact: true })).toBeVisible()
  await expect(
    page.getByRole('img', { name: '已审批浏览器的实际截图', exact: true }),
  ).toHaveJSProperty('naturalWidth', 1000)
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/browser-capture.png' })
  await page.keyboard.press('Escape')
  checks.push(
    'Persisted actual screenshot opened from original Tool UI after Renderer reload; chunked read and digest verified before object URL display',
  )
  assert.deepEqual(errors, [])
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/browser-agent.png' })
  console.log(JSON.stringify({ ok: true, checks, modelRequests: requests.length }, null, 2))
} catch (error) {
  console.error(error)
  throw error
} finally {
  if (app) {
    const child = app.process()
    let timeout
    try {
      await Promise.race([
        app.close(),
        new Promise((_resolve, reject) => {
          timeout = setTimeout(() => {
            child.kill('SIGTERM')
            reject(new Error('Application shutdown timed out'))
          }, 10000)
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  }
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
