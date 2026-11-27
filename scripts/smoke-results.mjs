// Local model protocol fixture; actual Python unittest execution and runtime records.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const root = await mkdtemp(join(tmpdir(), 'devly-results-ui-')),
  project = join(root, 'project')
await mkdir(project)
await mkdir(join(project, 'src'))
await mkdir('output', { recursive: true })
await writeFile(
  join(project, 'src/check.py'),
  `import sys, unittest\nmode = sys.argv.pop()\nclass Case(unittest.TestCase):\n    def test_addition(self):\n        self.assertEqual(1 + 1, 3 if mode == 'fail' else 2)\nresult = unittest.TextTestRunner(stream=sys.stderr).run(unittest.defaultTestLoader.loadTestsFromTestCase(Case))\nprint('TAP version 13')\nprint('1..1')\nprint(('ok' if result.wasSuccessful() else 'not ok') + ' 1 - actual addition unittest')\nsys.exit(0 if result.wasSuccessful() else 1)\n`,
)
const commands = [
  '/usr/bin/python3 -u src/check.py pass',
  '/usr/bin/python3 -u src/check.py fail',
  'printf plain-command-output',
]
const frame = (delta, finish = null) =>
  'data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n'
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw),
    count = body.messages.filter((message) => message.role === 'tool').length
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  res.end(
    count < commands.length
      ? frame(
          {
            tool_calls: [
              {
                index: 0,
                id: `result-${count}`,
                type: 'function',
                function: {
                  name: 'run_command',
                  arguments: JSON.stringify({ command: commands[count] }),
                },
              },
            ],
          },
          'tool_calls',
        ) + 'data: [DONE]\n\n'
      : frame({ content: '本地协议替身：实际命令已返回，结果见执行记录。' }, 'stop') +
          'data: [DONE]\n\n',
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let app, page, bootstrap, snapshot
const errors = []
async function data(operation, args = {}) {
  const value = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(value.ok, true, operation)
  return value.data
}
try {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: join(root, 'profile') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  const provider = await data('providers.save', {
    name: 'Local fixture',
    protocol: 'chat-completions',
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    model: 'fixture-model',
  })
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      defaultProviderId: provider.id,
      defaultModel: provider.model,
      projectPermission: 'ask',
    },
  })
  await page.reload()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page.getByRole('combobox', { name: '运行模式', exact: true }).click()
  await page.getByRole('option', { name: '项目 Agent（逐次审批）', exact: true }).click()
  await page
    .getByRole('textbox', { name: '任务输入', exact: true })
    .fill('本地协议替身验收：执行真实测试并展示日志、退出码和文件定位。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const answered = new Set(),
    until = Date.now() + 90000
  while (Date.now() < until) {
    bootstrap = await data('bootstrap')
    if (bootstrap.activeSessionId) {
      snapshot = await data('chat.read', {
        projectId: bootstrap.activeProjectId,
        sessionId: bootstrap.activeSessionId,
      })
      for (const tool of snapshot.tools.filter(
        (t) => t.approval?.state === 'pending' && !answered.has(t.approval.id),
      )) {
        assert.ok(commands.includes(JSON.parse(tool.input).command))
        await page
          .locator(`[data-approval-id="${tool.approval.id}"]`)
          .getByRole('button', { name: '允许本次', exact: true })
          .click()
        answered.add(tool.approval.id)
      }
      if (snapshot.turn && !['pending', 'running'].includes(snapshot.turn.state)) break
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  assert.equal(snapshot?.turn?.state, 'completed')
  assert.equal(snapshot.tools.length, 3)
  assert.deepEqual(
    snapshot.tools.map((t) => t.execution.exitCode),
    [0, 1, 0],
  )
  assert.deepEqual(
    snapshot.tools.map((t) => t.execution.validation.state),
    ['complete', 'complete', 'unreported'],
  )
  assert.equal(snapshot.tools[1].execution.validation.failed, 1)
  const pass = page.locator('[data-tool-call="result-0"]'),
    fail = page.locator('[data-tool-call="result-1"]'),
    plain = page.locator('[data-tool-call="result-2"]')
  for (const card of [pass, fail, plain]) {
    if (!(await card.locator('[data-command-record]').isVisible()))
      await card.getByRole('button').first().click()
  }
  await expect(pass.locator('[data-validation-state="passed"]')).toContainText(
    'actual addition unittest',
  )
  await expect(fail.locator('[data-validation-state="failed"]')).toContainText('验证失败')
  await expect(plain.locator('[data-validation-state="unreported"]')).toContainText(
    '未验证测试结果',
  )
  await fail.getByRole('button', { name: '查看实际堆栈 result-1', exact: true }).click()
  const pathButton = fail
    .locator('[data-execution-stack]')
    .getByRole('button')
    .filter({ hasText: 'src/check.py' })
    .first()
  await pathButton.click()
  await expect(page.locator('[data-editor-file="src/check.py"] .monaco-editor')).toBeVisible({
    timeout: 30000,
  })
  await expect(page.locator('[data-editor-file] .view-lines')).toContainText('self.assertEqual')
  await fail.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/agent-test-results.png' })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeInViewport({
    ratio: 1,
  })
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeInViewport({ ratio: 1 })
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    true,
  )
  await page.screenshot({ path: 'output/agent-results-minimum.png' })
  await page.reload()
  const restored = await data('chat.read', {
    projectId: bootstrap.activeProjectId,
    sessionId: bootstrap.activeSessionId,
  })
  assert.equal(restored.tools[1].execution.validation.failed, 1)
  assert.equal(restored.tools[1].execution.exitCode, 1)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: true,
        mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
        checks: [
          'Actual Python unittest passes/fails with real exit codes 0/1',
          'Original read-only Terminal and Test Results show actual structured TAP',
          'Plain successful command remains test-unverified',
          'Actual Python traceback normalizes into original Stack Trace and opens project file',
          'Execution records persist on reload',
        ],
        screenshot: 'output/agent-test-results.png',
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/results-failure.png' }).catch(() => {})
  throw error
} finally {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app?.close().catch(() => {})
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
