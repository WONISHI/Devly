import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-preview-ui-')),
  executable = createRequire(import.meta.url)('electron'),
  errors = []
let app, page
try {
  const seed = spawnSync(executable, ['scripts/stage11-ui-seed.mjs', root], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000,
  })
  assert.equal(
    seed.status,
    0,
    `seed signal=${seed.signal}; ${seed.error?.message ?? ''}; ${seed.stderr}`,
  )
  const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8')),
    env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
  async function data(operation, args = {}) {
    const result = await page.evaluate(
      ({ operation, args }) => window.devly.data(operation, args),
      { operation, args },
    )
    assert.equal(result.ok, true, JSON.stringify(result.error))
    return result.data
  }
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '网页预览', exact: true }).click()
  await expect(page.locator('#settings-group-providers')).toBeHidden()
  await page.getByRole('button', { name: '启动隔离预览', exact: true }).click()
  await expect.poll(() => app.windows().length).toBe(2)
  const view = app.windows().find((p) => p !== page)
  assert.ok(view)
  view.on('pageerror', (error) => errors.push(error.message))
  await expect(view.getByRole('heading', { name: 'ACTUAL_PREVIEW_PAGE' })).toBeVisible()
  assert.deepEqual(
    await view.evaluate(() => ({
      node: typeof process,
      require: typeof require,
      ipc: typeof window.devly,
      opener: !!window.opener,
      cookie: document.cookie,
    })),
    { node: 'undefined', require: 'undefined', ipc: 'undefined', opener: false, cookie: '' },
  )
  await view.locator('#name').fill('ACTUAL_LOCAL_INTERACTION')
  await view.locator('#apply').click()
  await expect(view.locator('#result')).toHaveText('ACTUAL_LOCAL_INTERACTION')
  assert.equal(
    await view.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(240, 245, 242)',
  )
  const current = await data('preview.status', { projectId: fixture.projectId }),
    origin = new URL(current.url).origin
  assert.equal((await fetch(origin + '/index.html')).status, 403)
  const cookie = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('http://127.0.0.1'),
    )
    return (await win.webContents.session.cookies.get({ name: 'devly-preview' }))[0].value
  })
  for (const path of ['/.env', '/outside-link.txt', '/%2e%2e/outside.txt']) {
    const response = await fetch(origin + path, { headers: { Cookie: `devly-preview=${cookie}` } })
    assert.equal(response.status, 403)
    assert.ok(!(await response.text()).includes('MUST_NOT_SERVE'))
  }
  assert.equal(
    await view.evaluate(async () => {
      try {
        await fetch('file:///etc/passwd')
        return false
      } catch {
        return true
      }
    }),
    true,
  )
  assert.equal(
    await view.evaluate(async () => {
      try {
        await fetch('http://127.0.0.1:1/')
        return false
      } catch {
        return true
      }
    }),
    true,
  )
  assert.equal(await view.evaluate(() => window.open('https://example.com/')), null)
  await mkdir('output', { recursive: true })
  await view.screenshot({ path: 'output/preview-isolated.png' })
  await page.getByRole('button', { name: '停止预览', exact: true }).click()
  await expect.poll(() => app.windows().length).toBe(1)
  assert.equal(await data('preview.status', { projectId: fixture.projectId }), null)
  await assert.rejects(fetch(origin + '/index.html'))
  await page.getByLabel('项目内 HTML 路径', { exact: true }).fill('dist/index.html')
  await page.getByRole('button', { name: '启动隔离预览', exact: true }).click()
  await expect.poll(() => app.windows().length).toBe(2)
  const built = app.windows().find((p) => p !== page)
  await expect(built.getByRole('heading', { name: 'ACTUAL_BUILT_PREVIEW' })).toBeVisible()
  await page.reload()
  await expect.poll(() => app.windows().length).toBe(1)
  assert.equal(await data('preview.status', { projectId: fixture.projectId }), null)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
        actualPreview: true,
        checks: [
          'Actual isolated static HTML/CSS and DOM interaction, no Node/preload/opener or readable auth cookie',
          'Actual HTTP rejects unauthenticated, protected, symlink and outside files; browser blocks local file/extra network/popups',
          'Stop releases the real listening port; main reload closes preview and does not restore a stale process',
        ],
      },
      null,
      2,
    ),
  )
} finally {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app?.close()
  await rm(root, { recursive: true, force: true })
}
