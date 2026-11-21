import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-chat-ui-'))
const projectPath = join(root, '项目 Chat'),
  otherPath = join(root, '其他项目')
await mkdir(projectPath)
await mkdir(otherPath)
await mkdir('output', { recursive: true })
let application, page
const requests = [],
  errors = []
const frame = (content, finish = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }] })}\n\n`
const server = createServer(async (request, response) => {
  let raw = ''
  for await (const part of request) raw += part
  const body = JSON.parse(raw),
    text = body.messages.at(-1).content
  requests.push(body)
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  if (
    text === 'cancel-me' &&
    requests.filter((item) => item.messages.at(-1).content === text).length === 1
  ) {
    response.write(frame('取消前的真实替身分段'))
    return
  }
  const long = text === 'long-stream'
  const chunks = long
    ? Array.from({ length: 65 }, (_, i) => `段落 ${i}: 这是用于验证滚动行为的本地替身响应。\n\n`)
    : text === 'slow A'
      ? ['仅属于 A 的增量一。', '仅属于 A 的增量二。', 'A 已完成。']
      : [`本地替身回复：${text}`]
  let index = 0
  const timer = setInterval(
    () => {
      if (index < chunks.length) response.write(frame(chunks[index++]))
      else {
        response.end(frame(null, 'stop') + 'data: [DONE]\n\n')
        clearInterval(timer)
      }
    },
    long ? 70 : text === 'slow A' ? 550 : 25,
  )
  response.on('close', () => clearInterval(timer))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(result.ok, true, operation)
  return result.data
}
async function openProject(path) {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await expect(page.locator('.project-row.selected')).toContainText(
    path === projectPath ? '项目 Chat' : '其他项目',
  )
}
async function send(text, enter = false) {
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill(text)
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled()
  if (enter) await page.getByRole('textbox', { name: '任务输入', exact: true }).press('Enter')
  else await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
async function complete() {
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0, {
    timeout: 10000,
  })
  await expect(page.locator('.chat-messages .is-assistant').last()).toContainText('本地替身回复')
}
async function choose(name) {
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择模型', exact: true })
  await picker.getByRole('combobox', { name: '搜索模型', exact: true }).fill(name)
  await picker.getByRole('option').click()
}
try {
  await launch()
  const pa = await data('providers.save', {
    name: 'Fixture A',
    protocol: 'chat-completions',
    baseUrl,
    model: 'model-a',
  })
  await data('providers.save', {
    name: 'Fixture B',
    protocol: 'chat-completions',
    baseUrl,
    model: 'model-b',
  })
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: { ...settings, defaultProviderId: pa.id, defaultModel: pa.model },
  })
  await page.reload()
  await openProject(projectPath)
  const projectId = (await data('bootstrap')).activeProjectId
  await expect(
    page.getByRole('button', { name: '添加附件（尚未支持）', exact: true }),
  ).toBeDisabled()
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill('   ')
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill('line one')
  await page.getByRole('textbox', { name: '任务输入', exact: true }).press('Shift+Enter')
  assert.equal(requests.length, 0)
  await send('first question', true)
  await complete()
  const aId = (await data('bootstrap')).activeSessionId
  await send('second question')
  await complete()
  assert.deepEqual(
    requests.at(-1).messages.map((item) => item.content),
    ['first question', '本地替身回复：first question', 'second question'],
  )
  assert.equal(requests[0].tools, undefined)
  await page.getByRole('button', { name: '新任务', exact: true }).click()
  await send('slow A')
  await expect(page.locator('.chat-messages')).toContainText('仅属于 A 的增量一')
  const streamingId = (await data('bootstrap')).activeSessionId
  await page.getByRole('button', { name: '新任务', exact: true }).click()
  await send('session B')
  await complete()
  await expect(page.locator('.chat-messages')).not.toContainText('仅属于 A')
  await page.locator('.session-title').getByText('slow A', { exact: true }).click()
  const beforeReload = requests.length
  await page.reload()
  await expect(page.locator('.chat-messages')).toContainText('A 已完成', { timeout: 10000 })
  assert.equal(requests.length, beforeReload, 'reload must reconnect instead of resend')
  assert.equal(
    (await data('chat.read', { projectId, sessionId: streamingId })).turn.state,
    'completed',
  )
  await openProject(otherPath)
  await expect(page.locator('.chat-messages')).toHaveCount(0)
  await page.locator('.project-item').getByText('项目 Chat', { exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('A 已完成')
  await send('cancel-me')
  await expect(page.locator('.chat-messages')).toContainText('取消前的真实替身分段')
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('已停止，保留已收到的内容')
  await page.getByRole('button', { name: '重新发送', exact: true }).click()
  await complete()
  const count = requests.length
  await choose('Fixture B')
  const confirm = page.getByRole('dialog', { name: '切换会话模型', exact: true })
  await expect(confirm).toBeVisible()
  await page.screenshot({ path: 'output/chat-model-history-confirm.png' })
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toContainText('model-a')
  await choose('Fixture B')
  await confirm.getByRole('button', { name: '保留历史并切换', exact: true }).click()
  await expect(confirm).toBeHidden()
  assert.equal(requests.length, count, 'model switch itself must not send history')
  await send('after explicit switch')
  await complete()
  assert.equal(requests.at(-1).model, 'model-b')
  assert.equal(
    requests.at(-1).messages.some((item) => item.content.includes('session B')),
    false,
  )
  assert.equal(
    requests.at(-1).messages.some((item) => item.content.includes('仅属于 A')),
    true,
  )
  await choose('Fixture A')
  await confirm.getByRole('button', { name: '新建会话使用', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(page.locator('.chat-messages')).toHaveCount(0)
  await send('new session only')
  await complete()
  assert.deepEqual(
    requests.at(-1).messages.map((item) => item.content),
    ['new session only'],
  )
  for (let i = 0; i < 11; i++) {
    await send(`history ${i}`)
    await complete()
  }
  await page.reload()
  await expect(page.locator('.chat-messages [data-message-id]')).toHaveCount(20)
  const viewport = page.getByTestId('chat-viewport')
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.getByRole('button', { name: '加载更早消息', exact: true }).click()
  await expect(page.locator('.chat-messages [data-message-id]')).toHaveCount(24)
  await page.getByRole('button', { name: '回到底部', exact: true }).click()
  await send('long-stream')
  await expect(page.locator('.chat-messages')).toContainText('段落 10', { timeout: 10000 })
  await viewport.hover()
  const beforeWheel = await viewport.evaluate((element) => element.scrollTop)
  await page.mouse.wheel(0, -1200)
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeLessThan(beforeWheel - 100)
  await expect(page.getByRole('button', { name: '回到底部', exact: true })).toBeVisible()
  const top = await viewport.evaluate((element) => element.scrollTop)
  await expect(page.locator('.chat-messages')).toContainText('段落 25', { timeout: 10000 })
  const afterTokens = await viewport.evaluate((element) => element.scrollTop)
  assert.ok(
    afterTokens <= top + 80,
    `new tokens pulled a reader down: ${JSON.stringify({ beforeWheel, top, afterTokens })}`,
  )
  await expect(page.getByRole('button', { name: '回到底部', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '回到底部', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0, {
    timeout: 10000,
  })
  await page.screenshot({ path: 'output/chat-conversation-stream.png' })
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(960, 680),
  )
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'output/chat-conversation-compact.png' })
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  )
  const lastId = (await data('bootstrap')).activeSessionId
  await application.close()
  application = undefined
  await launch()
  await expect(page.locator('.chat-messages')).toContainText('段落 64')
  assert.equal((await data('bootstrap')).activeSessionId, lastId)
  await send('after restart')
  await complete()
  assert.ok(requests.at(-1).messages.some((item) => item.content.includes('段落 64')))
  assert.equal(
    (await data('sessions.messages', { projectId, sessionId: aId, limit: 20 })).items.length,
    4,
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: 'loopback HTTP only, no real supplier or user credentials',
        passed: [
          'original Prompt Input, editable/empty/Enter/Shift+Enter and explicit disabled attachment',
          'paired history/context with real streamed HTTP and no fake tool fields',
          'two sessions/projects and renderer reload never mix or duplicate streams',
          'cancel retains partial, retry creates a new turn',
          'explicit history consent or new conversation when switching models; switch sends nothing',
          '20-message pagination, upward scroll stays fixed, return-to-bottom restores follow',
          'application restart restores history and continues with prior completed context',
          'root remains bounded with local message ScrollArea',
        ],
        requests: requests.length,
        scrollCheck: { beforeWheel, top, afterTokens },
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
