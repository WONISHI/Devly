import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'devly-usage-ui-'))
const errors = []
let application,
  page,
  requests = 0
const server = createServer(async (request, response) => {
  let raw = ''
  for await (const chunk of request) raw += chunk
  const body = JSON.parse(raw)
  requests++
  assert.equal(body.stream_options.include_usage, true)
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  response.end(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '用量替身验证响应' }, finish_reason: 'stop' }], ...(body.messages.at(-1).content === 'known' ? { usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } } : {}) })}\n\ndata: [DONE]\n\n`,
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
async function data(operation, args = {}) {
  const result = await page.evaluate(({ operation, args }) => window.devly.data(operation, args), {
    operation,
    args,
  })
  assert.equal(result.ok, true, operation)
  return result.data
}
async function openUsage() {
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page
    .getByRole('navigation', { name: '设置分组' })
    .getByRole('button', { name: '用量与额度', exact: true })
    .click()
  await expect(page.locator('.settings-group:visible')).toHaveCount(1)
  await expect(page.locator('.usage-metric')).toHaveCount(3)
}
async function selectProvider(name) {
  await page.getByRole('combobox', { name: '统计供应商', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
async function send(text) {
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.chat-messages .is-assistant').last()).toContainText(
    '用量替身验证响应',
  )
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
}
try {
  await launch()
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
  const a = await data('providers.save', {
    name: 'Fixture A',
    protocol: 'chat-completions',
    baseUrl,
    model: 'model-a',
    compatibility: { streamUsage: true },
  })
  const b = await data('providers.save', {
    name: 'Fixture B',
    protocol: 'chat-completions',
    baseUrl,
    model: 'model-b',
  })
  await data('providers.save', {
    name: 'Ark DeepSeek',
    protocol: 'chat-completions',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'fixture-only-no-request',
  })
  await data('providers.save', {
    name: 'Official DeepSeek',
    protocol: 'chat-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'fixture-only-no-request',
  })
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: { ...settings, defaultProviderId: a.id, defaultModel: a.model },
  })
  await page.reload()
  await send('known')
  await openUsage()
  await selectProvider('Fixture A')
  await expect(page.locator('.usage-metric').nth(2).locator('strong')).toHaveText('120')
  await page.getByRole('textbox', { name: '预算总量（Token）' }).fill('1000')
  await page.getByRole('button', { name: '保存预算', exact: true }).click()
  await expect(page.getByTestId('usage-remaining')).toHaveText('880 Token 剩余')
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await send('unknown')
  await openUsage()
  await selectProvider('Fixture A')
  await expect(page.getByTestId('usage-remaining')).toHaveText('至多 880 Token 剩余')
  await expect(page.locator('.usage-metric').nth(2).locator('strong')).toHaveText('≥ 120')
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/usage-local-budget.png' })
  await page.getByRole('textbox', { name: '预算总量（Token）' }).fill('-1')
  await page.getByRole('button', { name: '保存预算', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请输入 0 到')
  assert.equal((await data('usage.summary', { providerId: a.id })).budgetTokens, 1000)
  await page.getByRole('textbox', { name: '预算总量（Token）' }).fill('100')
  await page.getByRole('button', { name: '保存预算', exact: true }).click()
  await expect(page.getByTestId('usage-remaining')).toHaveText('至多 0 Token 剩余')
  await expect(page.getByText('已确认超出预算 20 Token。', { exact: false })).toBeVisible()
  await page.getByRole('textbox', { name: '预算总量（Token）' }).fill('1000')
  await page.getByRole('button', { name: '保存并从现在重新计数', exact: true }).click()
  await expect(page.getByTestId('usage-remaining')).toHaveText('1,000 Token 剩余')
  await selectProvider('Fixture B')
  await expect(page.getByTestId('usage-remaining')).toHaveText('未设置预算')
  await page.getByRole('textbox', { name: '预算总量（Token）' }).fill('500')
  await page.getByRole('button', { name: '保存预算', exact: true }).click()
  await expect(page.getByTestId('usage-remaining')).toHaveText('500 Token 剩余')
  await selectProvider('Ark DeepSeek')
  await expect(
    page.getByText('账户用量与资源包额度需单独的管理接口鉴权', { exact: false }),
  ).toBeVisible()
  await page.getByRole('region', { name: '供应商账户额度', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/usage-ark-account.png' })
  await selectProvider('Official DeepSeek')
  await expect(page.getByRole('button', { name: '查询账户余额', exact: true })).toBeDisabled()
  await page.getByRole('region', { name: '供应商账户额度', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/usage-deepseek-account.png' })
  await application.close()
  application = null
  await launch()
  await openUsage()
  await selectProvider('Fixture A')
  await expect(page.getByTestId('usage-remaining')).toHaveText('1,000 Token 剩余')
  await expect(page.locator('.usage-metric').nth(2).locator('strong')).toHaveText('≥ 120')
  assert.equal((await data('usage.summary', { providerId: b.id })).budgetTokens, 500)
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 680),
  )
  await expect(page.getByRole('combobox', { name: '统计供应商' })).toBeVisible()
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    viewports: document.querySelectorAll('.main-scroll-area [data-slot="scroll-area-viewport"]')
      .length,
  }))
  assert.equal(bounds.width, 0)
  assert.equal(bounds.height, 0)
  await page.screenshot({ path: 'output/usage-compact.png' })
  assert.equal(requests, 2)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        passed: [
          'two loopback chats: true reported totals vs missing usage; exact/upper-bound remainder; invalid/over/reset budgets; provider isolation and app restart; account capability and no-key state; 960x680 fixed root',
        ],
        requests,
        errors,
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
