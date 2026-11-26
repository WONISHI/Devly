// Native desktop acceptance with a local protocol fixture, never a real supplier.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-execution-ui-'))
const project = join(root, 'controlled-project')
await mkdir(project)
await mkdir('output', { recursive: true })
await writeFile(join(project, 'target.txt'), 'original fixture\n')
const errors = [],
  requests = []
const frame = (delta, finish_reason) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(finish_reason ? { finish_reason } : {}) }] })}\n\n`
const call = (id, name, args) =>
  frame(
    {
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
      ],
    },
    'tool_calls',
  ) + 'data: [DONE]\n\n'
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const part of req) raw += part
  const body = JSON.parse(raw)
  requests.push(body)
  const results = body.messages.filter((m) => m.role === 'tool')
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  if (!results.length) {
    res.end(call('read-call', 'read_file', { path: 'target.txt' }))
    return
  }
  if (results.length === 1) {
    res.end(
      call('plan-initial', 'update_plan', {
        steps: [
          { id: 'inspect', title: '核对目标文件', state: 'completed', callIds: ['read-call'] },
          { id: 'change', title: '修改并验证文件', state: 'pending', callIds: [] },
        ],
      }),
    )
    return
  }
  if (results.length === 2) {
    const version = JSON.parse(results[0].content).data.contentHash
    res.end(
      call('patch-call', 'apply_patch', {
        changes: [{ path: 'target.txt', expectedHash: version, content: 'approved fixture\n' }],
      }),
    )
    return
  }
  if (!JSON.parse(results[2].content).ok) {
    res.end(frame({ content: '本次修改已拒绝，未执行写入。' }, 'stop') + 'data: [DONE]\n\n')
    return
  }
  if (results.length === 3) {
    res.end(call('command-call', 'run_command', { command: 'grep "approved fixture" target.txt' }))
    return
  }
  if (results.length === 4) {
    res.end(
      call('plan-final', 'update_plan', {
        steps: [
          { id: 'inspect', title: '核对目标文件', state: 'completed', callIds: ['read-call'] },
          {
            id: 'change',
            title: '修改并验证文件',
            state: 'completed',
            callIds: ['patch-call', 'command-call'],
          },
        ],
      }),
    )
    return
  }
  res.end(frame({ content: '已完成受控文件修改，命令退出码为 0。' }, 'stop') + 'data: [DONE]\n\n')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let application, page
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  if (!result.ok) throw new Error(`${operation}: ${result.error.code}`)
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
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
async function send(text) {
  await page.getByRole('textbox', { name: '任务输入', exact: true }).fill(text)
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
}
try {
  await launch()
  const provider = await data('providers.save', {
    name: 'LOCAL EXECUTION FIXTURE',
    protocol: 'chat-completions',
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    model: 'fixture',
  })
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      defaultProviderId: provider.id,
      defaultModel: 'fixture',
      projectPermission: 'ask',
      maxTokens: 32768,
    },
  })
  await page.reload()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page.getByRole('combobox', { name: '运行模式', exact: true }).click()
  await page.getByRole('option', { name: '项目 Agent（逐次审批）', exact: true }).click()
  await send('拒绝演示修改')
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible({
    timeout: 15000,
  })
  assert.equal(await readFile(join(project, 'target.txt'), 'utf8'), 'original fixture\n')
  await expect(page.locator('.agent-trace').last()).toContainText('核对目标文件')
  await page.screenshot({ path: 'output/execution-approval-pending.png' })
  await page.getByRole('button', { name: '拒绝本次', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('本次修改已拒绝，未执行写入。')
  assert.equal(await readFile(join(project, 'target.txt'), 'utf8'), 'original fixture\n')
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await send('修改并检查文件')
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '允许本次', exact: true }).click()
  await expect(page.locator('.agent-tool[data-tool-call="command-call"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '允许本次', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText(
    '已完成受控文件修改，命令退出码为 0。',
    { timeout: 15000 },
  )
  assert.equal(await readFile(join(project, 'target.txt'), 'utf8'), 'approved fixture\n')
  await page.screenshot({ path: 'output/execution-completed.png' })
  await page.locator('[data-slot=plan]').last().screenshot({ path: 'output/execution-plan.png' })
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await send('等待审批后停止')
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toHaveCount(0)
  await expect(page.locator('.chat-messages')).toContainText('回合已停止')
  assert.equal(await readFile(join(project, 'target.txt'), 'utf8'), 'approved fixture\n')
  const boot = await data('bootstrap')
  const before = requests.length
  await application.close()
  application = undefined
  await launch()
  const restored = await data('chat.read', {
    projectId: boot.activeProjectId,
    sessionId: boot.activeSessionId,
  })
  assert.equal(restored.turn.state, 'cancelled')
  assert.equal(restored.tools.find((t) => t.name === 'apply_patch').approval.state, 'cancelled')
  assert.equal(requests.length, before)
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
    true,
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: true,
        checks: [
          'Original Confirmation buttons approve/deny actual tools',
          'Original Plan/Task show runtime records',
          'Stop invalidates visible approval; mutations preserved',
          'Restart retains approvals without replay; fixed root layout',
        ],
        screenshots: ['output/execution-approval-pending.png', 'output/execution-completed.png'],
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/execution-ui-failure.png' }).catch(() => {})
  throw error
} finally {
  await application?.close().catch(() => {})
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
