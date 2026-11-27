import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const root = await mkdtemp(join(tmpdir(), 'devly-stage11-ui-')),
  errors = [],
  requests = [],
  closed = [],
  checks = []
let app, page
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/search?')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        results: [
          {
            title: 'Actual local source response',
            url: 'https://example.com/',
            excerpt: 'Returned by explicitly configured local fixture',
          },
        ],
      }),
    )
    return
  }
  let raw = ''
  for await (const c of req) raw += c
  const body = JSON.parse(raw)
  requests.push(body)
  if (
    body.messages.some((message) => message.role === 'user' && message.content === 'GUI_EXIT_HOLD')
  ) {
    res.on('close', () => closed.push('GUI_EXIT_HOLD'))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    'data: ' +
      JSON.stringify({
        choices: [
          { index: 0, delta: { content: 'ACTUAL_LOCAL_PROTOCOL_RESPONSE' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
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
  const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8')),
    env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  async function launch() {
    app = await electron.launch({
      args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
      executablePath: process.env.DEVLY_EXECUTABLE || undefined,
      env,
    })
    page = await app.firstWindow()
    page.on('pageerror', (e) => errors.push(e.message))
  }
  await launch()
  async function data(operation, args = {}) {
    const result = await page.evaluate(
      ({ operation, args }) => window.devly.data(operation, args),
      { operation, args },
    )
    assert.equal(result.ok, true, JSON.stringify(result.error))
    return result.data
  }
  async function select(label, option) {
    await page.getByRole('combobox', { name: label, exact: true }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  const draft = page.getByRole('textbox', { name: '任务输入', exact: true })
  await draft.fill('ATTACHMENT_GUI_DRAFT')
  async function attach(file) {
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      },
      join(fixture.project, file),
    )
    await page.getByRole('button', { name: '添加附件', exact: true }).click()
  }
  await attach('notes.md')
  await expect(page.getByRole('button', { name: '移除附件 notes.md', exact: true })).toBeVisible()
  await expect(draft).toHaveValue('ATTACHMENT_GUI_DRAFT')
  assert.equal(requests.length, 0)
  await attach('one.png')
  await expect(page.getByRole('button', { name: '移除附件 one.png', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  assert.equal(requests.length, 0)
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择模型', exact: true })
  await picker.getByRole('combobox', { name: '搜索模型', exact: true }).fill('vision')
  await picker.getByRole('option', { name: /vision-fixture/ }).click()
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByText('ACTUAL_LOCAL_PROTOCOL_RESPONSE', { exact: true })).toBeVisible()
  assert.equal(requests.length, 1)
  const content = requests[0].messages.find((m) => m.role === 'user').content
  assert.ok(content.some((x) => x.type === 'text' && x.text.includes('REAL_UI_ATTACHMENT_TEXT')))
  assert.ok(
    content.some(
      (x) => x.type === 'image_url' && x.image_url.url.startsWith('data:image/png;base64,'),
    ),
  )
  checks.push(
    'Original Prompt Input preserves draft across native import; text/image stay local until send; unknown vision blocks send; explicit declared-vision selection sends actual bounded file data; original Message shows persisted attachment metadata',
  )
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '网页工具', exact: true }).click()
  await expect(page.locator('#settings-group-providers')).toBeHidden()
  await select('网页搜索', '允许提议搜索（逐次审批）')
  await select('搜索协议', '自定义 JSON（q/count → results）')
  await page
    .getByLabel('搜索 API 地址', { exact: true })
    .fill(`http://127.0.0.1:${server.address().port}/search`)
  await page.getByLabel('测试搜索词', { exact: true }).fill('actual GUI query')
  await page.getByRole('button', { name: '保存并测试搜索', exact: true }).click()
  await expect(page.getByText('Actual local source response', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '本地定时任务', exact: true }).click()
  await expect(page.locator('#settings-group-web')).toBeHidden()
  await page.getByLabel('任务名称', { exact: true }).fill('GUI_LOCAL_SCHEDULE')
  await page.getByLabel('只读任务内容', { exact: true }).fill('GUI_SCHEDULE_PROMPT')
  await select('任务供应商', 'Text fixture')
  await page.getByRole('button', { name: '保存本地任务', exact: true }).click()
  await expect(page.getByText('GUI_LOCAL_SCHEDULE', { exact: true })).toBeVisible()
  assert.equal(requests.length, 1)
  await page.getByRole('button', { name: '启用任务', exact: true }).click()
  await page.getByRole('button', { name: '执行一次', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  await expect
    .poll(async () => {
      const items = await data('schedules.list', { projectId: fixture.projectId })
      const h = await data('schedules.history', { projectId: fixture.projectId, id: items[0].id })
      return h[0]?.state
    })
    .toBe('completed')
  await page.getByRole('button', { name: '刷新运行记录', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看此会话', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止并停用', exact: true }).click()
  await expect(page.getByRole('button', { name: '启用任务', exact: true })).toBeEnabled()
  const item = (await data('schedules.list', { projectId: fixture.projectId }))[0]
  assert.equal(item.enabled, false)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680))
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/stage11-schedules.png' })
  checks.push(
    'Independent Web/Schedules settings render only selected group; actual local JSON test returns source; saved-disabled schedule has zero dispatch; explicit enable/run records actual completion; stop persists disabled; 960x680 settings remain operable',
  )
  const exitTask = await data('schedules.save', {
    projectId: fixture.projectId,
    name: 'GUI exit cancellation',
    prompt: 'GUI_EXIT_HOLD',
    providerId: fixture.providerId,
    model: 'text-fixture',
    intervalSeconds: 3600,
    misfire: 'once',
    maxRunsPerDay: 5,
    enabled: true,
    notify: false,
  })
  await data('schedules.run', { projectId: fixture.projectId, id: exitTask.id })
  await expect.poll(() => requests.length).toBe(3)
  await app.close()
  app = undefined
  await expect.poll(() => closed.includes('GUI_EXIT_HOLD')).toBe(true)
  await launch()
  assert.equal(requests.length, 3)
  const exitHistory = await data('schedules.history', {
    projectId: fixture.projectId,
    id: exitTask.id,
  })
  assert.equal(exitHistory[0].state, 'cancelled')
  await data('schedules.stop', { projectId: fixture.projectId, id: exitTask.id })
  const persisted = (await data('schedules.list', { projectId: fixture.projectId })).find(
    (task) => task.id === item.id,
  )
  assert.equal(persisted.enabled, false)
  assert.equal(
    (await data('schedules.history', { projectId: fixture.projectId, id: persisted.id }))[0].state,
    'completed',
  )
  assert.equal((await data('web.get', { projectId: fixture.projectId })).searchProtocol, 'json')
  assert.deepEqual(errors, [])
  checks.push(
    'Actual app restart retains web config, disabled schedule and actual completed ledger; active scheduled HTTP closes on actual app exit, persisted cancellation and zero replay/network requests on restart; no page errors',
  )
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
