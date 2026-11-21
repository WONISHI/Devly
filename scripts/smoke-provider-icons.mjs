import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'devly-brand-icons-'))
let application
const errors = [],
  remoteRequests = []
try {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: root }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url())
  })
  async function data(operation, args = {}) {
    const result = await page.evaluate(
      async ({ operation, args }) => window.devly.data(operation, args),
      { operation, args },
    )
    assert.equal(result.ok, true, operation)
    return result.data
  }
  await expect(page.getByRole('button', { name: '打开设置', exact: true })).toBeEnabled()
  const fixtures = [
    ['DeepSeek', 'https://api.deepseek.com/v1', 'deepseek-v4-1-flash-261017', 'deepseek'],
    ['OpenAI', 'https://api.openai.com/v1', 'gpt-4.1', 'openai'],
    ['通义千问', 'https://proxy.invalid/v1', 'qwen3', 'qwen'],
    ['OpenRouter', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-r1', 'openrouter'],
    ['兔子', 'https://proxy.invalid/v1', 'claude-sonnet-4', 'claude'],
    ['自定义端点', 'http://127.0.0.1:45678/v1', 'unknown-model', 'custom'],
  ]
  const providers = []
  for (const [name, baseUrl, model] of fixtures)
    providers.push(
      await data('providers.save', { name, baseUrl, model, protocol: 'chat-completions' }),
    )
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      theme: 'dark',
      defaultProviderId: providers[0].id,
      defaultModel: providers[0].model,
    },
  })
  await page.reload()
  const trigger = page.getByRole('button', { name: '选择模型', exact: true })
  await expect(trigger.locator('[data-provider-brand="deepseek"] img')).toBeVisible()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '选择模型', exact: true })
  await expect(dialog.locator('[data-provider-brand]')).toHaveCount(fixtures.length)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.locator('.provider-row')).toHaveCount(fixtures.length)
  for (const [name, , , id] of fixtures) {
    const row = page
      .locator('.provider-row')
      .filter({ has: page.getByRole('button', { name: `编辑 ${name}`, exact: true }) })
    const icon = row.locator(`[data-provider-brand="${id}"]`)
    await expect(icon).toBeVisible()
    if (id !== 'custom')
      await expect
        .poll(() =>
          icon.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true)
    const box = await icon.boundingBox()
    assert.equal(box.width, 30)
    assert.equal(box.height, 30)
  }
  await expect(page.locator('.provider-brand-mono img').first()).toHaveCSS('filter', 'invert(1)')
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/provider-brand-icons-dark.png' })
  await data('settings.save', { projectId: null, settings: { ...settings, theme: 'light' } })
  await page.reload()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.locator('.provider-brand-mono img').first()).toHaveCSS('filter', 'none')
  await page.screenshot({ path: 'output/provider-brand-icons-light.png' })
  // A metadata edit must update the identity too, without changing protocols or contacting endpoints.
  await data('providers.save', {
    id: providers[0].id,
    name: 'DeepSeek',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: providers[0].model,
    protocol: 'chat-completions',
  })
  await page.reload()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  const updated = page
    .locator('.provider-row')
    .filter({ has: page.getByRole('button', { name: '编辑 DeepSeek', exact: true }) })
  await expect(updated.locator('[data-provider-brand="openrouter"] img')).toBeVisible()
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(remoteRequests, [], 'logos must never contact a CDN or API')
  console.log(
    JSON.stringify(
      {
        passed: [
          'local SVG loading and fixed 30px provider row geometry',
          'domain, Chinese name, model-family and custom fallback',
          'matching gateway before hosted model; edit updates identity',
          'model picker reuses icons; mono dark/light handling',
          'no remote image/API requests or root overflow',
        ],
        remoteRequests: remoteRequests.length,
      },
      null,
      2,
    ),
  )
} finally {
  await application?.close()
  await rm(root, { recursive: true, force: true })
}
