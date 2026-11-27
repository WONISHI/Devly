// A generated 2000-message/1MiB-log workload; measures this machine, not a universal performance claim.
import { _electron as electron, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const root = await mkdtemp(join(tmpdir(), 'devly-performance-')),
  executable = createRequire(import.meta.url)('electron')
await mkdir('output', { recursive: true })
const seeded = spawnSync(executable, ['scripts/performance-seed.mjs', root], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 60000,
})
assert.equal(seeded.status, 0, seeded.stderr)
const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8')),
  errors = []
let app, page
try {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  const start = performance.now()
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  const history = page.locator('.chat-messages'),
    viewport = page.getByTestId('chat-viewport')
  await expect(history).toHaveAttribute('data-loaded-messages', '20', { timeout: 30000 })
  const initialMs = Math.round(performance.now() - start),
    pageMs = []
  for (const count of [40, 60, 80]) {
    await viewport.evaluate((el) => {
      el.scrollTop = 0
      el.dispatchEvent(new Event('scroll'))
    })
    const before = performance.now()
    await page.getByRole('button', { name: '加载更早消息', exact: true }).click()
    await expect(history).toHaveAttribute('data-loaded-messages', String(count))
    pageMs.push(Math.round(performance.now() - before))
  }
  await expect(history).toHaveAttribute('data-virtualized', 'true')
  await expect.poll(() => page.locator('[data-message-id]').count()).toBeLessThan(40)
  const rendered = await page.locator('[data-message-id]').count(),
    input = page.getByRole('textbox', { name: '任务输入', exact: true }),
    before = performance.now()
  await input.fill('Long history typing remains available')
  await expect(input).toHaveValue('Long history typing remains available')
  const inputMs = Math.round(performance.now() - before)
  const logs = []
  for (let i = 0; i < 3; i++) {
    const before = performance.now(),
      result = await page.evaluate(async (args) => window.devly.data('blobs.read', args), {
        projectId: fixture.projectId,
        sessionId: fixture.sessionId,
        blobId: fixture.blobId,
        offset: i * 65536,
        length: 65536,
      })
    assert.equal(result.ok, true)
    assert.equal(Buffer.from(result.data.base64, 'base64').length, 65536)
    assert.equal(result.data.truncated, true)
    logs.push(Math.round(performance.now() - before))
  }
  assert.deepEqual(errors, [])
  const result = {
    fixture: true,
    mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
    workload: fixture,
    initialMs,
    pageMs,
    inputMs,
    loadedMessages: 80,
    renderedMessages: rendered,
    logChunkBytes: 65536,
    logReadMs: logs,
  }
  await writeFile('output/performance-stage9.json', JSON.stringify(result, null, 2) + '\n')
  await page.screenshot({ path: 'output/performance-stage9.png' })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app?.close()
  await rm(root, { recursive: true, force: true })
}
