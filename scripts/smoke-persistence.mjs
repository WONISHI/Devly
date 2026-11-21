import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, stat, writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const root = await mkdtemp(join(tmpdir(), 'devly-persistence-')),
  userData = join(root, 'user data'),
  a = join(root, '项目 A'),
  b = join(root, '项目 B')
await mkdir(userData)
await mkdir(a)
await mkdir(b)
let application, page
const pageErrors = []
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: userData }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.waitForFunction(
    () =>
      window.devly &&
      document.querySelector('.nav-item') &&
      !document.querySelector('.nav-item').disabled,
  )
}
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  if (!result.ok) throw Error(`${operation}: ${result.error.code}`)
  return result.data
}
async function selectOption(label, text) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: text, exact: true }).click()
}
async function choose(path) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page
    .locator('.project-item')
    .getByText(path === a ? '项目 A' : '项目 B', { exact: true })
    .waitFor()
}
try {
  await launch()
  const native = await application.evaluate(async ({ safeStorage, app }) => {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' &&
        ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))
    )
      return { available: false }
    const fs = process.getBuiltinModule('node:fs/promises'),
      path = process.getBuiltinModule('node:path')
    const secret = 'devly-native-fixture-' + Date.now(),
      file = path.join(app.getPath('userData'), 'native-proof.key')
    const encrypted = safeStorage.encryptString(secret)
    await fs.writeFile(file, encrypted, { mode: 0o600 })
    const stored = await fs.readFile(file)
    return {
      available: true,
      roundTrip: safeStorage.decryptString(stored) === secret,
      plaintextPresent: stored.includes(Buffer.from(secret)),
    }
  })
  assert.equal(
    native.available,
    true,
    'system encryption must be available to complete local acceptance',
  )
  assert.equal(native.roundTrip, true)
  assert.equal(native.plaintextPresent, false)
  await choose(a)
  let boot = await data('bootstrap')
  const aId = boot.activeProjectId
  await page.getByRole('button', { name: '新任务', exact: true }).click()
  await page.locator('.session-title').getByText('新任务', { exact: true }).waitFor()
  await page.getByRole('button', { name: '重命名 新任务', exact: true }).click()
  await page.getByRole('textbox', { name: '会话名称' }).fill('A 的独立会话')
  await page.getByRole('textbox', { name: '会话名称' }).press('Enter')
  await page.locator('.session-title').getByText('A 的独立会话', { exact: true }).waitFor()
  const aSession = (await data('bootstrap')).activeSessionId
  for (let index = 0; index < 23; index++)
    await data('sessions.create', { projectId: aId, title: `分页验证 ${index}` })
  await data('sessions.select', { projectId: aId, sessionId: aSession })
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await selectOption('设置范围', '当前项目')
  await page.getByLabel('默认模型', { exact: true }).fill('A-model')
  await page.getByLabel('Token 上限', { exact: true }).fill('4096')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor()
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await choose(b)
  boot = await data('bootstrap')
  const bId = boot.activeProjectId
  assert.equal(await page.locator('.session-title').count(), 0)
  await page.getByRole('button', { name: '新任务', exact: true }).click()
  await page.locator('.session-title').getByText('新任务', { exact: true }).waitFor()
  await page.getByRole('button', { name: '重命名 新任务', exact: true }).click()
  await page.getByRole('textbox', { name: '会话名称' }).fill('B 的独立会话')
  await page.getByRole('textbox', { name: '会话名称' }).press('Enter')
  await page.locator('.session-title').getByText('B 的独立会话', { exact: true }).waitFor()
  const bSession = (await data('bootstrap')).activeSessionId
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await selectOption('设置范围', '当前项目')
  assert.equal(await page.getByLabel('默认模型', { exact: true }).inputValue(), '')
  await page.getByLabel('默认模型', { exact: true }).fill('B-model')
  await selectOption('主题', '浅色')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await application.close()
  application = undefined
  await launch()
  boot = await data('bootstrap')
  assert.equal(boot.projects.length, 2)
  assert.equal(boot.activeProjectId, bId)
  assert.equal(boot.activeSessionId, bSession)
  assert.equal((await data('settings.get', { projectId: bId })).defaultModel, 'B-model')
  assert.equal((await data('settings.get', { projectId: aId })).defaultModel, 'A-model')
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.locator('.project-item').getByText('项目 A', { exact: true }).click()
  await page.getByRole('heading', { name: 'A 的独立会话', exact: true }).waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  assert.equal((await data('bootstrap')).activeSessionId, aSession)
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.locator('.session-title').getByText('A 的独立会话', { exact: true }).waitFor()
  await page.getByRole('button', { name: '归档 A 的独立会话', exact: true }).click()
  await page.getByRole('heading', { name: '今天想完成什么？', exact: true }).waitFor()
  await page.getByRole('button', { name: '查看已归档会话', exact: true }).click()
  await page.locator('.session-title').getByText('A 的独立会话', { exact: true }).waitFor()
  await page.getByRole('button', { name: '恢复 A 的独立会话', exact: true }).click()
  await page.getByRole('button', { name: '查看活动会话', exact: true }).click()
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.locator('.session-title').getByText('A 的独立会话', { exact: true }).waitFor()
  await page.getByRole('button', { name: '移除项目 项目 B', exact: true }).click()
  await page
    .locator('.project-list')
    .getByText('项目 B', { exact: true })
    .waitFor({ state: 'hidden' })
  assert.ok((await stat(b)).isDirectory())
  const provider = await data('providers.save', {
    name: 'Fixture',
    protocol: 'responses',
    baseUrl: 'https://example.invalid/v1',
    model: 'fixture',
  })
  const denied = await page.evaluate(
    async (providerId) =>
      window.devly.data('credentials.set', { providerId, key: 'must-never-be-accepted' }),
    provider.id,
  )
  assert.equal(denied.ok, false)
  assert.equal(denied.error.code, 'INVALID_REQUEST')
  const session = await data('sessions.create', { projectId: aId, title: '日志索引' })
  const file = join(root, 'large.log')
  await writeFile(file, 'fixture output\n'.repeat(200000))
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, file)
  const blob = await data('blobs.import', { projectId: aId, sessionId: session.id, kind: 'log' })
  assert.ok(blob.bytes > 1000000)
  const slice = await data('blobs.read', {
    projectId: aId,
    sessionId: session.id,
    blobId: blob.id,
    offset: 64,
    length: 200,
  })
  assert.equal(Buffer.from(slice.base64, 'base64').length, 200)
  assert.equal(slice.truncated, true)
  const bad = await page.evaluate(async (args) => window.devly.data('sessions.get', args), {
    projectId: aId,
    sessionId: bSession,
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.error.code, 'NOT_FOUND')
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await selectOption('设置范围', '当前项目')
  assert.equal(await page.getByLabel('默认模型', { exact: true }).inputValue(), 'A-model')
  const exportPath = join(root, 'export.json')
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, exportPath)
  await page.getByRole('button', { name: '导出设置', exact: true }).click()
  await expect.poll(async () => readFile(exportPath, 'utf8').catch(() => null)).not.toBeNull()
  const exported = JSON.parse(await readFile(exportPath, 'utf8'))
  assert.equal(exported.defaultModel, 'A-model')
  assert.ok(!('apiKey' in exported))
  assert.ok(!('credentialRef' in exported))
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/settings-persisted.png' })
  const themeSelect = page.getByRole('combobox', { name: '主题', exact: true })
  await themeSelect.click()
  await page.getByRole('option', { name: '跟随系统', exact: true }).waitFor()
  await page.screenshot({ path: 'output/ui-select-options.png' })
  await page.keyboard.press('Escape')
  await expect(themeSelect).toBeFocused()
  assert.equal(
    await page
      .locator('.project-list')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
  )
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await page.screenshot({ path: 'output/sessions-persisted.png' })
  assert.deepEqual(pageErrors, [])
  await application.close()
  application = undefined
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await scan(path)
      else if (entry.isFile()) {
        const bytes = await readFile(path)
        assert.equal(bytes.includes(Buffer.from('devly-native-fixture-')), false)
        assert.equal(bytes.includes(Buffer.from('must-never-be-accepted')), false)
      }
    }
  }
  await scan(userData)
  const files = await readdir(join(userData, 'storage'))
  assert.ok(files.includes('devly.sqlite'))
  console.log(
    JSON.stringify(
      {
        passed: [
          'actual OS safeStorage encrypt/write/decrypt without plaintext return',
          'native IPC project selection and two-project restart persistence',
          'UI session create/rename/archive/restore and remembered selection',
          'per-project preferences and persisted light/dark theme',
          'project removal preserves directory',
          'credential plaintext injection rejected at IPC boundary',
          'large native file import and truncated reads',
          'settings export excludes credentials',
        ],
        nativeEncryption: native,
      },
      null,
      2,
    ),
  )
} finally {
  await application?.close()
  await rm(root, { recursive: true, force: true })
}
