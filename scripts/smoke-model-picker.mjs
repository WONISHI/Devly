import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-model-picker-')),
  a = join(root, '项目 A'),
  b = join(root, '项目 B')
await mkdir(a)
await mkdir(b)
let requests = 0,
  application,
  page
const errors = []
const server = createServer((_request, response) => {
  requests++
  response.writeHead(500)
  response.end('selection must not send model requests')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'user-data') }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toBeEnabled()
}
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(result.ok, true, operation)
  return result.data
}
async function picker() {
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  return page.getByRole('dialog', { name: '选择模型', exact: true })
}
async function select(name, model = 'shared-model') {
  const dialog = await picker()
  await dialog.getByRole('combobox', { name: '搜索模型', exact: true }).fill(name)
  await dialog.getByRole('option', { name: new RegExp(model) }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toContainText(model)
}
async function add(name) {
  await page.getByRole('button', { name: '添加供应商', exact: true }).click()
  await page.getByLabel('供应商名称', { exact: true }).fill(name)
  await page.getByLabel('Base URL', { exact: true }).fill(baseUrl)
  await page.getByLabel('模型 ID', { exact: true }).fill('shared-model')
  await page.getByRole('button', { name: '保存供应商', exact: true }).click()
  await expect(page.getByRole('heading', { name: `编辑 ${name}`, exact: true })).toBeVisible()
}
async function openProject(path) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await expect(
    page.locator('.project-item').getByText(path === a ? '项目 A' : '项目 B', { exact: true }),
  ).toBeVisible()
}
try {
  await launch()
  let dialog = await picker()
  await expect(dialog.getByText('未找到已保存的模型', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '添加供应商', exact: true }).click()
  await add('供应商 A')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await add('供应商 B')
  const providers = await data('providers.list'),
    pa = providers.find((provider) => provider.name === '供应商 A'),
    pb = providers.find((provider) => provider.name === '供应商 B')
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await select('供应商 A')
  assert.equal((await data('settings.get', { projectId: null })).defaultProviderId, pa.id)
  dialog = await picker()
  await expect(dialog.getByRole('option')).toHaveCount(2)
  await expect(dialog.locator('[aria-label="当前使用"]')).toHaveCount(1)
  await dialog.getByRole('combobox', { name: '搜索模型', exact: true }).fill('does-not-exist')
  await expect(dialog.getByText('未找到已保存的模型', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toBeFocused()
  assert.equal((await data('settings.get', { projectId: null })).defaultProviderId, pa.id)
  dialog = await picker()
  await dialog.getByRole('combobox', { name: '搜索模型', exact: true }).fill('供应商 B')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveAttribute(
    'title',
    '供应商 B · shared-model',
  )
  await mkdir('output', { recursive: true })
  dialog = await picker()
  await page.screenshot({ path: 'output/workspace-model-picker.png' })
  await page.keyboard.press('Escape')
  await application.close()
  application = undefined
  await launch()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveAttribute(
    'title',
    '供应商 B · shared-model',
  )
  await openProject(a)
  const aId = (await data('bootstrap')).activeProjectId
  await select('供应商 A')
  await openProject(b)
  const bId = (await data('bootstrap')).activeProjectId
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveAttribute(
    'title',
    '供应商 B · shared-model',
  )
  await select('供应商 B')
  assert.equal((await data('settings.get', { projectId: null })).defaultProviderId, pb.id)
  assert.equal((await data('settings.get', { projectId: aId })).defaultProviderId, pa.id)
  assert.equal((await data('settings.get', { projectId: bId })).defaultProviderId, pb.id)
  await application.close()
  application = undefined
  await launch()
  await page.locator('.project-item').getByText('项目 A', { exact: true }).click()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveAttribute(
    'title',
    '供应商 A · shared-model',
  )
  await data('providers.save', {
    name: '没有模型 ID',
    protocol: 'chat-completions',
    baseUrl,
    model: '',
  })
  await data('providers.save', {
    name: '尚未支持协议',
    protocol: 'responses',
    baseUrl,
    model: 'unsupported',
  })
  await page.reload()
  dialog = await picker()
  await expect(dialog.getByRole('option', { name: /未设置模型/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(dialog.getByRole('option', { name: /unsupported/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await dialog.getByRole('button', { name: '管理供应商', exact: true }).click()
  await page.getByRole('button', { name: '编辑 供应商 A', exact: true }).click()
  await page.getByLabel('模型 ID', { exact: true }).fill('new-model')
  await page.getByRole('button', { name: '保存供应商', exact: true }).click()
  await expect(page.getByRole('button', { name: '检查文本', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toContainText(
    'shared-model',
  )
  dialog = await picker()
  await dialog.getByRole('combobox', { name: '搜索模型', exact: true }).fill('供应商 A')
  await expect(dialog.getByRole('option')).toHaveCount(2)
  await dialog.getByRole('option', { name: /new-model/ }).click()
  await expect(dialog).toBeHidden()
  assert.equal((await data('settings.get', { projectId: aId })).defaultModel, 'new-model')
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '编辑 供应商 A', exact: true }).click()
  await page.getByRole('button', { name: '删除供应商', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect
    .poll(async () => (await data('providers.list')).some((provider) => provider.id === pa.id))
    .toBe(false)
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveText('选择模型')
  assert.equal((await data('settings.get', { projectId: aId })).defaultProviderId, null)
  assert.equal((await data('settings.get', { projectId: bId })).defaultProviderId, pb.id)
  await expect(page.getByRole('button', { name: '对话功能待接入', exact: true })).toBeDisabled()
  assert.equal(
    requests,
    0,
    'selecting a model must not contact a provider or forward project context',
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        passed: [
          'actual AI Elements ModelSelector, search, keyboard and cancellation',
          'newly saved providers selectable without reload; duplicate model IDs remain distinct',
          'global and per-project selections survive two restarts without mixing',
          'missing model and unsupported protocol disabled; provider edit/removal remain explicit',
          'selection causes zero network requests; chat availability unchanged',
        ],
        requests,
      },
      null,
      2,
    ),
  )
} finally {
  await application?.close()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
