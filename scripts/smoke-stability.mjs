// Generated profiles/local protocol server. Exercises native file dialogs via deterministic path selection.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-stability-ui-')),
  configFile = join(root, 'devly-config.json'),
  diagFile = join(root, 'diagnostics.json'),
  backup = join(root, 'snapshot.devly-backup'),
  requests = [],
  errors = []
await mkdir('output', { recursive: true })
let failure = null
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const part of req) raw += part
  const body = JSON.parse(raw)
  requests.push({ path: req.url, model: body.model, stream: body.stream })
  if (failure === 'network') {
    req.socket.destroy()
    return
  }
  if (failure) {
    res.writeHead(failure, { 'content-type': 'application/json', 'retry-after': '2' })
    res.end(JSON.stringify({ error: { message: 'fixture failure' } }))
    return
  }
  const text =
    body.model === 'recovery-fixture'
      ? '复核已完成，已有文件保留，没有重放旧命令。'
      : `原生 ${body.model} 已回复。`
  if (body.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const frame = (value) => `data: ${JSON.stringify(value)}\n\n`
    if (req.url.endsWith('/responses'))
      res.end(
        frame({ type: 'response.output_text.delta', delta: text }) +
          frame({
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
              ],
              usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
            },
          }),
      )
    else if (req.url.endsWith('/messages'))
      res.end(
        [
          {
            type: 'message_start',
            message: {
              type: 'message',
              role: 'assistant',
              usage: { input_tokens: 3, output_tokens: 0 },
            },
          },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 2 },
          },
          { type: 'message_stop' },
        ]
          .map(frame)
          .join(''),
      )
    else
      res.end(
        frame({ choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }] }) +
          'data: [DONE]\n\n',
      )
  } else {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify(
        req.url.endsWith('/responses')
          ? {
              status: 'completed',
              output: [
                { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
              ],
              usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
            }
          : req.url.endsWith('/messages')
            ? {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text }],
                stop_reason: 'end_turn',
                usage: { input_tokens: 3, output_tokens: 2 },
              }
            : { choices: [{ index: 0, message: { content: text }, finish_reason: 'stop' }] },
      ),
    )
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`,
  executable = createRequire(import.meta.url)('electron')
let app, page
async function launch(profile) {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => errors.push(e.message))
}
async function close() {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app?.close()
  app = null
}
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(result.ok, true, `${operation}: ${JSON.stringify(result.error)}`)
  return result.data
}
async function settingsData() {
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '数据与恢复', exact: true }).click()
}
async function selectDialogs() {
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showSaveDialog = async (...args) => {
        const options = args.at(-1)
        return {
          canceled: false,
          filePath: options.title.includes('备份')
            ? paths.backup
            : options.title.includes('诊断')
              ? paths.diagFile
              : paths.configFile,
        }
      }
      dialog.showOpenDialog = async (...args) => {
        const options = args.at(-1)
        return {
          canceled: false,
          filePaths: [options.title.includes('备份') ? paths.backup : paths.configFile],
        }
      }
    },
    { backup, configFile, diagFile },
  )
}

try {
  const faultProfile = join(root, 'failed-profile')
  await mkdir(faultProfile)
  await writeFile(join(faultProfile, 'storage'), 'actual invalid directory')
  await launch(faultProfile)
  await expect(page.getByRole('button', { name: '重新连接存储', exact: true })).toBeVisible()
  await rm(join(faultProfile, 'storage'))
  await page.getByRole('button', { name: '重新连接存储', exact: true }).click()
  await expect(page.locator('.storage-error')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await expect(page.getByRole('button', { name: '配置模型供应商', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '配置模型供应商', exact: true }).click()
  await expect(page.locator('#settings-group-providers')).toBeVisible()
  await page.screenshot({ path: 'output/storage-reconnected.png' })
  await close()
  const seeded = spawnSync(executable, ['scripts/stability-ui-seed.mjs', root, baseUrl], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000,
  })
  assert.equal(seeded.status, 0, seeded.stderr)
  const fixture = JSON.parse(await readFile(join(root, 'recovery-fixture.json'), 'utf8'))
  await launch(join(root, 'profile'))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680))
  await page.getByRole('button', { name: '核对恢复状态', exact: true }).click()
  const recovery = page.getByRole('dialog')
  await expect(recovery).toContainText('状态未知')
  await expect(recovery).toContainText('existing.ts')
  assert.equal(requests.length, 0)
  const confirmBounds = await recovery
    .getByRole('button', { name: '确认只读核对并继续', exact: true })
    .boundingBox()
  assert.ok(
    confirmBounds.y >= 0 &&
      confirmBounds.y + confirmBounds.height <= (await page.evaluate(() => innerHeight)),
    'recovery footer must fit minimum window',
  )
  await page.screenshot({ path: 'output/recovery-review-stage9.png' })
  await recovery.getByRole('button', { name: '确认只读核对并继续', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('复核已完成', { timeout: 30000 })
  assert.equal(
    await readFile(join(fixture.project, 'existing.ts'), 'utf8'),
    'external edit preserved\n',
  )
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
  const count = requests.length
  await page.reload()
  await expect(page.locator('.chat-messages')).toContainText('复核已完成')
  assert.equal(requests.length, count)
  // Save and test both new protocols through the actual settings form, then send via the original model picker.
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  for (const [protocol, label] of [
    ['responses', 'OpenAI Responses'],
    ['anthropic-messages', 'Anthropic Messages'],
  ]) {
    await page.getByRole('button', { name: '添加供应商', exact: true }).click()
    await page.getByLabel('供应商名称', { exact: true }).fill(`UI ${protocol}`)
    await page.getByRole('combobox', { name: '协议', exact: true }).click()
    await page.getByRole('option', { name: label, exact: true }).click()
    await page.getByLabel('Base URL', { exact: true }).fill(baseUrl)
    await page.getByLabel('模型 ID', { exact: true }).fill(`${protocol}-ui-fixture`)
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await expect(page.getByText('连接成功：已收到模型文本响应', { exact: true })).toBeVisible({
      timeout: 30000,
    })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
  }
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  for (const model of ['responses-ui-fixture', 'anthropic-messages-ui-fixture']) {
    await page.getByRole('button', { name: '选择模型', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(model) }).click()
    await page.getByRole('button', { name: '新建会话使用', exact: true }).click()
    const input = page.getByRole('textbox', { name: '任务输入', exact: true })
    await input.fill(`Local ${model} UI chat`)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.locator('.chat-messages')).toContainText(`原生 ${model} 已回复。`, {
      timeout: 30000,
    })
  }
  for (const code of [401, 403, 429, 'network']) {
    const failedBefore = await page.locator('.is-assistant[data-message-state="failed"]').count()
    await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
    failure = code
    const before = requests.length
    await page.getByRole('textbox', { name: '任务输入', exact: true }).fill(`UI fault ${code}`)
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await expect(page.locator('.is-assistant[data-message-state="failed"]')).toHaveCount(
      failedBefore + 1,
      {
        timeout: 30000,
      },
    )
    await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
    await expect(
      page
        .locator('.is-assistant[data-message-state="failed"]')
        .last()
        .getByRole('button', { name: '检查供应商连接', exact: true }),
    ).toBeVisible()
    if (code === 429)
      await expect(page.getByText('供应商建议等待 2 秒后手动重试', { exact: true })).toBeVisible()
    assert.equal(requests.length, before + 1)
  }
  await page
    .locator('.is-assistant[data-message-state="failed"]')
    .last()
    .getByRole('button', { name: '检查供应商连接', exact: true })
    .click()
  await expect(page.locator('#settings-group-providers')).toBeVisible()
  failure = null
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  // Return to the original persisted session before exercising export/restore.
  await data('sessions.select', { projectId: fixture.projectId, sessionId: fixture.sessionId })
  await page.reload()
  await expect(page.locator('.chat-messages')).toContainText('复核已完成')
  await selectDialogs()
  await settingsData()
  await expect(page.locator('#settings-group-providers')).toBeHidden()
  await page.getByRole('button', { name: '导出配置（不含密钥）', exact: true }).click()
  await expect(page.getByText(/配置已导出/)).toBeVisible()
  const exported = JSON.parse(await readFile(configFile, 'utf8'))
  assert.equal(exported.providers.length, 3)
  assert.ok(!JSON.stringify(exported).includes('credentialRef'))
  await page.getByRole('button', { name: '导出诊断', exact: true }).click()
  await expect(page.getByText(/诊断已导出/)).toBeVisible()
  const diagnostic = await readFile(diagFile, 'utf8')
  assert.ok(!diagnostic.includes(fixture.project))
  assert.ok(!diagnostic.includes(fixture.model))
  await page.getByRole('button', { name: '导入配置并审查', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(/responses/i)
  await page.getByRole('button', { name: '确认导入配置', exact: true }).click()
  await expect(page.getByText(/已新增 3 个供应商配置/)).toBeVisible()
  assert.equal(
    (await data('sessions.get', { projectId: fixture.projectId, sessionId: fixture.sessionId }))
      .providerId,
    fixture.providerId,
  )
  await page.getByRole('button', { name: '创建数据备份', exact: true }).click()
  await expect(page.getByText(/备份已创建/)).toBeVisible()
  assert.ok((await stat(join(backup, 'devly.sqlite'))).isFile())
  const originalTitle = (
    await data('sessions.get', { projectId: fixture.projectId, sessionId: fixture.sessionId })
  ).title
  await data('sessions.rename', {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
    title: 'after-backup-must-not-restore',
  })
  await page.getByRole('button', { name: '检查备份并恢复', exact: true }).click()
  await expect(page.getByText(/备份检查通过/)).toBeVisible()
  await page.getByRole('button', { name: '审查恢复操作', exact: true }).click()
  await page.getByRole('button', { name: '确认下次启动恢复', exact: true }).click()
  await expect(page.getByText(/已安排恢复/)).toBeVisible()
  await page.screenshot({ path: 'output/data-settings-stage9.png' })
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await expect(page.getByRole('button', { name: '管理待恢复操作', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeDisabled()
  assert.equal((await data('bootstrap')).storage.pendingRestore, true)
  const beforeRestart = requests.length
  await close()
  await launch(join(root, 'profile'))
  await expect(page.locator('.chat-messages')).toContainText('复核已完成')
  assert.equal(
    (await data('sessions.get', { projectId: fixture.projectId, sessionId: fixture.sessionId }))
      .title,
    originalTitle,
  )
  assert.equal((await data('storage.status')).pendingRestore, false)
  assert.equal(requests.length, beforeRestart)
  await selectDialogs()
  await settingsData()
  const unsafe = structuredClone(exported)
  unsafe.providers[0].apiKey = 'sk-fixture-rejected-never-show'
  await writeFile(configFile, JSON.stringify(unsafe))
  await page.getByRole('button', { name: '导入配置并审查', exact: true }).click()
  await expect(page.getByText(/操作未完成/)).toBeVisible()
  assert.ok(!(await page.locator('body').innerText()).includes('sk-fixture-rejected-never-show'))
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  const parked = `${fixture.project}-parked`
  await rename(fixture.project, parked)
  try {
    await page.reload()
    await expect(page.getByRole('button', { name: '重新选择项目', exact: true })).toBeVisible()
  } finally {
    await rename(parked, fixture.project)
  }
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        fixture: true,
        mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
        checks: [
          'Actual startup storage failure repairs through explicit reconnect',
          'Recovery review before requests; fresh read-only continuation preserves external file and reload makes no duplicate request',
          'Native Responses/Anthropic settings test and actual chat through original picker',
          'Independent data group, no-Key config/diagnostic export and reviewed fresh-ID import',
          'Consistent backup, reviewed next-start restore, retained history and no network replay',
          'Invalid secret-bearing import never reaches Renderer text',
          'Unconfigured API, auth/access/429/network errors and unavailable project offer actionable routes; pending restore blocks new chat; recovery fits minimum window',
        ],
        requests,
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/stability-failure.png' }).catch(() => {})
  throw error
} finally {
  await close()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
