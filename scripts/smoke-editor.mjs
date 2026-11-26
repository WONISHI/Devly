import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
const root = await mkdtemp(join(tmpdir(), 'devly-editor-ui-')),
  project = join(root, 'editor-project'),
  otherProject = join(root, 'other-project')
await mkdir(project)
await mkdir(otherProject)
await mkdir(join(project, 'src'))
await mkdir(join(project, 'pages'))
await Promise.all(
  Array.from({ length: 105 }, (_, index) =>
    writeFile(
      join(project, 'pages', `file-${String(index).padStart(3, '0')}.txt`),
      'page fixture\n',
    ),
  ),
)
await mkdir('output', { recursive: true })
await writeFile(join(project, 'src/target.ts'), 'export const answer = 1;\n')
await writeFile(join(project, 'src/other.ts'), 'export const other = 1;\n')
await writeFile(join(project, 'src/bom.ts'), '\ufeffexport const bom = 1;\r\n')
await writeFile(join(project, 'rename from.txt'), 'rename contents\n')
await writeFile(join(project, 'binary.bin'), Buffer.from([0, 1, 2]))
const git = (...args) =>
  execFileSync('/usr/bin/git', ['-C', project, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdio: 'pipe',
  })
git('init', '-q')
git('add', '.')
git(
  '-c',
  'user.name=Fixture',
  '-c',
  'user.email=fixture@example.invalid',
  'commit',
  '--no-verify',
  '-qm',
  'baseline',
)
let application, page, server
const errors = [],
  remote = []
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
async function edit(text) {
  const host = page.locator('[data-editor-file] .monaco-editor').first()
  await host.click()
  await page.keyboard.press(`${modifier}+a`)
  await page.keyboard.insertText(text)
}
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  if (process.env.DEVLY_EDITOR_VITE_DEV === '1') {
    const { createServer, loadConfigFromFile } = await import('vite')
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      resolve('electron.vite.config.ts'),
    )
    server = await createServer({
      ...loaded.config.renderer,
      configFile: false,
      root: resolve('src/renderer'),
      server: { host: '127.0.0.1', port: 0, hmr: { host: 'localhost' } },
    })
    await server.listen()
    env.ELECTRON_RENDERER_URL = `http://127.0.0.1:${server.httpServer.address().port}`
  }
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  page.on('request', (req) => {
    if (/^https?:/.test(req.url()) && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(req.url()))
      remote.push(req.url())
  })
  await page.addInitScript(() => {
    const records = []
    window.__editorWorkerRecords = records
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options)
        const record = { url: new URL(String(url), location.href).href, messages: 0, errors: 0 }
        records.push(record)
        this.addEventListener('message', () => record.messages++)
        this.addEventListener('error', () => record.errors++)
      }
    }
  })
  await page.reload()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
async function openProject(path) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
}
try {
  await launch()
  await openProject(project)
  await page.getByRole('button', { name: '项目文件', exact: true }).click()
  await page.getByRole('button', { name: 'pages', exact: true }).click()
  await page.getByRole('button', { name: '加载更多文件', exact: true }).click()
  await expect(page.getByRole('button', { name: 'file-104.txt', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '刷新项目文件', exact: true }).click()
  await writeFile(join(project, 'pages/file-105.txt'), 'external page fixture\n')
  await expect(page.getByRole('button', { name: 'file-105.txt', exact: true })).toHaveCount(1, {
    timeout: 10000,
  })
  await expect(page.getByRole('button', { name: 'file-104.txt', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'pages', exact: true }).click()
  await page.getByRole('button', { name: 'src', exact: true }).click()
  await page.getByRole('button', { name: 'target.ts', exact: true }).click()
  await expect(page.locator('[data-editor-file="src/target.ts"] .monaco-editor')).toBeVisible({
    timeout: 30000,
  })
  await edit('export const answer = 2;\n')
  await expect(page.getByRole('tab', { name: /target\.ts/ })).toContainText('•')
  await page.getByRole('button', { name: 'other.ts', exact: true }).click()
  await page.getByRole('tab', { name: /target\.ts/ }).click()
  await expect(page.locator('[data-editor-file] .view-lines')).toContainText('2')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect
    .poll(() => readFile(join(project, 'src/target.ts'), 'utf8'))
    .toBe('export const answer = 2;\n')
  await writeFile(join(project, 'src/target.ts'), 'export const answer = 3;\n')
  await expect(page.locator('[data-editor-file] .view-lines')).toContainText('3', {
    timeout: 10000,
  })
  await edit('export const answer = 4;\n')
  await writeFile(join(project, 'src/target.ts'), 'export const answer = 5;\n')
  await expect(page.locator('.editor-conflict')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.editor-error')).toContainText('磁盘文件已改变')
  assert.equal(await readFile(join(project, 'src/target.ts'), 'utf8'), 'export const answer = 5;\n')
  await page.getByRole('button', { name: '比较外部更改', exact: true }).click()
  await expect(page.locator('[data-editor-diff] .monaco-diff-editor')).toBeVisible({
    timeout: 30000,
  })
  await expect(page.locator('.editor-diff-label')).toContainText('当前磁盘')
  await page.screenshot({ path: 'output/editor-conflict.png' })
  await page.getByRole('button', { name: '重新载入磁盘版本', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await application.evaluate(({ dialog, BrowserWindow }) => {
    globalThis.__editorPromptCount = 0
    dialog.showMessageBoxSync = () => {
      globalThis.__editorPromptCount++
      return 0
    }
    BrowserWindow.getAllWindows()[0].close()
  })
  await expect.poll(() => application.evaluate(() => globalThis.__editorPromptCount)).toBe(1)
  assert.equal(page.isClosed(), false)
  await page.getByRole('button', { name: '重新载入磁盘版本', exact: true }).click()
  await page.getByRole('button', { name: '放弃未保存内容', exact: true }).click()
  await expect(page.locator('[data-editor-file] .view-lines')).toContainText('5')
  await page.getByRole('button', { name: 'other.ts', exact: true }).click()
  await edit('export const other = 44;\n')
  await openProject(otherProject)
  await page.getByRole('button', { name: 'editor-project', exact: true }).click()
  await page.getByRole('button', { name: '项目文件', exact: true }).click()
  await page.getByRole('tab', { name: /other\.ts/ }).click()
  await expect(page.locator('[data-editor-file] .view-lines')).toContainText('44')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect
    .poll(() => readFile(join(project, 'src/other.ts'), 'utf8'))
    .toBe('export const other = 44;\n')
  const sourceDirectory = page.getByRole('button', { name: 'src', exact: true })
  if ((await sourceDirectory.getAttribute('aria-expanded')) === 'false')
    await sourceDirectory.click()
  await page.getByRole('button', { name: 'bom.ts', exact: true }).click()
  await edit('export const bom = 2;\r\n')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect
    .poll(() => readFile(join(project, 'src/bom.ts'), 'utf8'))
    .toBe('\ufeffexport const bom = 2;\r\n')
  await rm(join(project, 'src/target.ts'))
  await page.getByRole('tab', { name: /target\.ts/ }).click()
  await expect(page.locator('.editor-pane')).toContainText('文件不存在或已被删除', {
    timeout: 10000,
  })
  git('mv', 'rename from.txt', 'rename to.txt')
  await writeFile(join(project, 'added.json'), ' { "answer": 42 }\n')
  await writeFile(join(project, 'binary.bin'), Buffer.from([0, 4, 5]))
  await page.getByRole('button', { name: '项目更改', exact: true }).click()
  await page.getByRole('button', { name: '刷新项目文件', exact: true }).click()
  await page.locator('.editor-change-row').filter({ hasText: 'src/target.ts' }).click()
  await expect(page.locator('.editor-diff-label')).toContainText('文件已删除')
  await page.locator('.editor-change-row').filter({ hasText: 'rename to.txt' }).click()
  await expect(page.locator('.editor-diff-label')).toContainText('rename from.txt')
  await page.locator('.editor-change-row').filter({ hasText: 'binary.bin' }).click()
  await expect(page.locator('.editor-pane')).toContainText('不能显示文本 Diff')
  await page.locator('.editor-change-row').filter({ hasText: 'added.json' }).click()
  await expect(page.locator('.editor-diff-label')).toContainText('新增文件')
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
  await page.screenshot({ path: 'output/editor-git-diff.png' })
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.locator('[data-editor-file="added.json"] .monaco-editor')).toBeVisible()
  await page.getByRole('tab', { name: /other\.ts/ }).click()
  await edit('const typed: number = "invalid";\n')
  await expect(page.locator('.monaco-editor .squiggly-error')).not.toHaveCount(0, {
    timeout: 15000,
  })
  await page.getByRole('button', { name: '关闭文件 src/other.ts', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '放弃未保存内容', exact: true }).click()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
    true,
  )
  const workers = await page.evaluate(() => window.__editorWorkerRecords)
  assert.ok(workers.length >= 2 && workers.some((worker) => worker.messages > 0))
  assert.ok(workers.every((worker) => worker.errors === 0))
  const localWorker = (worker) =>
    /^(blob:|data:|file:|http:\/\/(127\.0\.0\.1|localhost):)/.test(worker.url)
  assert.ok(workers.every(localWorker), 'Worker must use bundled or local development resources')
  assert.deepEqual(remote, [])
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: true,
        mode:
          process.env.DEVLY_EDITOR_VITE_DEV === '1'
            ? 'vite-development'
            : process.env.DEVLY_EXECUTABLE
              ? 'packaged'
              : 'built-development',
        checks: [
          'Lazy paged tree retains loaded pages on refresh; exact local models',
          'Dirty files survive tab/project switches',
          'Save version checks and external reload/conflict Diff',
          'Unsaved close/reload/native window close can be cancelled',
          'Actual added/deleted/renamed/binary change states',
          'Local TypeScript diagnostics and worker responses without CDN',
          'Bounded root layout',
        ],
        workers: workers.map((worker) => ({
          local: localWorker(worker),
          protocol: new URL(worker.url).protocol,
          messages: worker.messages,
          errors: worker.errors,
        })),
        screenshots: ['output/editor-conflict.png', 'output/editor-git-diff.png'],
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/editor-ui-failure.png' }).catch(() => {})
  throw error
} finally {
  await application
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await application?.close().catch(() => {})
  await server?.close()
  await rm(root, { recursive: true, force: true })
}
