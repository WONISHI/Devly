// Local protocol fixture only. Never evidence that a real supplier is connected.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-agent-ui-')),
  project = join(root, '只读演示项目')
await mkdir(project)
await mkdir(join(project, 'src'))
await mkdir('output', { recursive: true })
await writeFile(join(project, 'src/target.ts'), '// TARGET_MARKER\nexport const value = 7;')
await writeFile(join(project, 'AGENTS.md'), 'Cite paths and line numbers. Never write files.')
const requests = [],
  errors = []
const frame = (delta, reason) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(reason ? { finish_reason: reason } : {}) }] })}\n\n`
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const part of req) raw += part
  const body = JSON.parse(raw)
  requests.push(body)
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const prompt = body.messages.filter((m) => m.role === 'user').at(-1).content
  if (prompt === '取消代理') {
    res.write(
      frame({
        tool_calls: [
          {
            index: 0,
            id: 'cancel-call',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":' },
          },
        ],
      }),
    )
    return
  }
  const results = body.messages.filter((m) => m.role === 'tool')
  if (results.length === 2) {
    res.end(
      frame(
        { content: '已通过搜索和读取确认：src/target.ts:1 包含 TARGET_MARKER，没有修改文件。' },
        'stop',
      ) + 'data: [DONE]\n\n',
    )
    return
  }
  const id = results.length ? 'read-call' : 'search-call',
    name = results.length ? 'read_file' : 'search_text',
    args = JSON.stringify(
      results.length ? { path: 'src/target.ts' } : { query: 'TARGET_MARKER', path: 'src' },
    )
  res.write(
    frame({
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: args.slice(0, 9) } },
      ],
    }),
  )
  const timer = setTimeout(
    () =>
      res.end(
        frame(
          { tool_calls: [{ index: 0, function: { arguments: args.slice(9) } }] },
          'tool_calls',
        ) + 'data: [DONE]\n\n',
      ),
    350,
  )
  res.on('close', () => clearTimeout(timer))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
let application, page
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(result.ok, true, operation)
  return result.data
}
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
  page.on('pageerror', (e) => errors.push(e.message))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
async function mode() {
  await page.getByRole('combobox', { name: '运行模式', exact: true }).click()
  await page.getByRole('option', { name: '只读 Agent', exact: true }).click()
}
try {
  await launch()
  const provider = await data('providers.save', {
    name: 'Local Agent Fixture',
    protocol: 'chat-completions',
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    model: 'read-only-fixture',
  })
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: { ...settings, defaultProviderId: provider.id, defaultModel: provider.model },
  })
  await page.reload()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await mode()
  await page.getByLabel('选中文件（可选）', { exact: true }).fill('src/target.ts')
  await page
    .getByRole('textbox', { name: '任务输入', exact: true })
    .fill('请定位 TARGET_MARKER 并读取确认')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.agent-tool').first()).toBeVisible()
  await expect(page.locator('.chat-messages')).toContainText('已通过搜索和读取确认', {
    timeout: 15000,
  })
  await expect(page.locator('.agent-tool')).toHaveCount(2)
  await expect(page.locator('.agent-context-sources')).toContainText('src/target.ts')
  await expect(page.getByRole('combobox', { name: '运行模式', exact: true })).toContainText(
    '只读 Agent',
  )
  const first = page.locator('.agent-tool').first()
  await first.getByRole('button').first().click()
  await expect(first).toContainText('search-call')
  await first.getByRole('button', { name: '查看脱敏原始日志', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('TARGET_MARKER')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'output/agent-tools-completed.png' })
  const boot = await data('bootstrap'),
    before = requests.length
  await application.close()
  application = undefined
  await launch()
  await expect(page.getByRole('combobox', { name: '运行模式', exact: true })).toContainText(
    '普通聊天',
  )
  await expect(page.locator('.agent-tool')).toHaveCount(2)
  assert.equal((await data('bootstrap')).activeSessionId, boot.activeSessionId)
  assert.equal(requests.length, before, 'restart must not replay tools or model requests')
  await page.getByRole('button', { name: '新聊天', exact: true }).click()
  await mode()
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill('取消代理')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.agent-tool')).toHaveCount(1)
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('已停止')
  await expect(page.locator('.agent-tool')).toHaveAttribute('data-tool-state', 'cancelled')
  assert.equal(
    (
      await data('chat.read', {
        projectId: boot.activeProjectId,
        sessionId: (await data('bootstrap')).activeSessionId,
      })
    ).tools[0].blobId,
    null,
  )
  await page.setViewportSize({ width: 960, height: 680 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    true,
  )
  await page.screenshot({ path: 'output/agent-compact-cancelled.png' })
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: 'loopback only, not a real supplier',
        passed: [
          'explicit read-only mode and selected-file scope notice',
          'real Tool cards, IDs, partial input to completed result and redacted log viewer',
          'restart restores tools without replay; cancel partial parameters never executes',
          'compact root layout remains bounded',
        ],
        requests: requests.length,
      },
      null,
      2,
    ),
  )
} finally {
  await application?.close()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
