// A local HTTP protocol fixture, never evidence of a real model supplier connection.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = await mkdtemp(join(tmpdir(), 'devly-provider-ui-'))
const requests = [],
  pageErrors = []
let authorized = 0
let modelsAvailable = false,
  aborted = 0,
  application,
  page
const server = createServer(async (request, response) => {
  if (request.headers.authorization?.startsWith('Bearer devly-provider-native-fixture-'))
    authorized++
  if (request.url === '/v1/models') {
    response.writeHead(modelsAvailable ? 200 : 404, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify(
        modelsAvailable
          ? { data: [{ id: 'fixture-chat' }, { id: 'fixture-other' }] }
          : { error: { message: 'not implemented' } },
      ),
    )
    return
  }
  if (request.url !== '/v1/chat/completions') {
    response.writeHead(404)
    response.end()
    return
  }
  let raw = ''
  for await (const chunk of request) raw += chunk
  const body = JSON.parse(raw)
  requests.push(body)
  if (/^http\d+$/.test(body.model)) {
    response.writeHead(Number(body.model.slice(4)), { 'retry-after': '2' })
    response.end('private error content must not reach Renderer')
    return
  }
  if (body.model === 'slow') {
    response.on('close', () => aborted++)
    const timer = setTimeout(() => response.end(), 10000)
    timer.unref()
    response.on('close', () => clearTimeout(timer))
    return
  }
  const chunk = (content, reason = null) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: reason }] })}\n\n`
  if (body.stream) {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(chunk('连接'))
    if (body.model === 'disconnect') {
      response.end()
      return
    }
    setTimeout(() => response.end(chunk('成功') + chunk('', 'stop') + 'data: [DONE]\n\n'), 550)
    return
  }
  if (body.tools) {
    assert.equal(body.tool_choice, 'required')
    assert.ok(body.tools[0].function.parameters.required.includes('nonce'))
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'fixture-probe',
                  type: 'function',
                  function: { name: 'devly_probe', arguments: '{"nonce":"devly"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    )
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(
    JSON.stringify({
      choices: [
        {
          index: 0,
          message: { content: body.response_format ? '{"ok":true}' : 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    }),
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/v1`
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
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
}
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  assert.equal(result.ok, true, `${operation} failed`)
  return result.data
}
async function check(button = '检查文本') {
  const diagnostic = page.locator('.provider-diagnostics')
  const previous = await diagnostic.getAttribute('data-probe-run')
  await page.getByRole('button', { name: button, exact: true }).click()
  await expect
    .poll(
      async () => {
        const run = await diagnostic.getAttribute('data-probe-run')
        return (
          !!run &&
          run !== previous &&
          (await diagnostic.getAttribute('data-probe-state')) !== 'running'
        )
      },
      { timeout: 15000 },
    )
    .toBe(true)
}
async function setModel(model) {
  await page.getByLabel('模型 ID', { exact: true }).fill(model)
  await page.getByRole('button', { name: '保存供应商', exact: true }).click()
  await expect(page.getByRole('button', { name: '检查文本', exact: true })).toBeEnabled()
}
try {
  await launch()
  // Replace only Main's native prompt callback. The Renderer still uses real
  // IPC, and the production service encrypts/reads/clears the fixture Key.
  const credentialPrompt = await application.evaluateHandle(({ app }) => {
    const path = process.getBuiltinModule('node:path'),
      module = process.getBuiltinModule('node:module')
    const source = path.join(app.getAppPath(), 'out', 'main'),
      require = module.createRequire(path.join(source, 'index.js'))
    const { LocalDataService } = require(path.join(source, 'data-service.js'))
    const original = LocalDataService.prototype.execute
    let mode = 'cancel',
      calls = 0,
      inspectKey,
      secret = ''
    LocalDataService.prototype.execute = async function (payload, ...args) {
      if (payload.operation !== 'credentials.set') return original.call(this, payload, ...args)
      const previous = this.prompts.credential
      this.prompts.credential = async () => {
        calls++
        secret = 'devly-provider-native-fixture-' + Date.now() + '-' + calls
        return mode === 'cancel' ? null : secret
      }
      inspectKey = async (providerId) => {
        const fs = process.getBuiltinModule('node:fs/promises'),
          ref = await this.database.execute('internal.credential.ref', { providerId })
        const files = await fs.readdir(path.join(app.getPath('userData'), 'storage', 'credentials'))
        return {
          files: files.length,
          roundTrip: (await this.vault.read(ref)) === secret,
          plaintext: (
            await fs.readFile(
              path.join(app.getPath('userData'), 'storage', 'credentials', ref + '.key'),
            )
          ).includes(Buffer.from('devly-provider-native-fixture-')),
        }
      }
      try {
        return await original.call(this, payload, ...args)
      } finally {
        this.prompts.credential = previous
      }
    }
    return {
      setMode(value) {
        mode = value
      },
      count() {
        return calls
      },
      async proof(providerId) {
        return inspectKey(providerId)
      },
      restore() {
        LocalDataService.prototype.execute = original
        secret = ''
      },
    }
  })
  await page.getByRole('button', { name: '添加供应商', exact: true }).click()
  await expect(page.getByRole('button', { name: '设置密钥', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '测试连接', exact: true })).toBeDisabled()
  await page.getByLabel('供应商名称', { exact: true }).fill('本地协议测试替身')
  await page.getByLabel('Base URL', { exact: true }).fill(url)
  await page.getByLabel('模型 ID', { exact: true }).fill('fixture-chat')
  await page.getByRole('button', { name: '设置密钥', exact: true }).click()
  await expect.poll(() => credentialPrompt.evaluate((fixture) => fixture.count())).toBe(1)
  await expect(page.getByRole('button', { name: '检查连接', exact: true })).toBeEnabled()
  const provider = (await data('providers.list'))[0]
  assert.equal(provider.hasCredential, false)
  await credentialPrompt.evaluate((fixture) => fixture.setMode('save'))
  await page.getByRole('button', { name: '设置密钥', exact: true }).click()
  await expect(page.getByText('已设置 · 受系统保护', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '替换密钥', exact: true }).click()
  await expect.poll(() => credentialPrompt.evaluate((fixture) => fixture.count())).toBe(3)
  await expect(page.getByRole('button', { name: '替换密钥', exact: true })).toBeEnabled()
  const keyProof = await credentialPrompt.evaluate(
    (fixture, providerId) => fixture.proof(providerId),
    provider.id,
  )
  assert.deepEqual(keyProof, { files: 1, roundTrip: true, plaintext: false })
  await credentialPrompt.evaluate((fixture) => fixture.restore())
  await credentialPrompt.dispose()
  await page.reload()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '编辑 本地协议测试替身', exact: true }).click()
  await expect(page.getByText('已设置 · 受系统保护', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'success')
  await expect(page.locator('.connection-test-result')).toContainText('连接成功')
  await page.getByLabel('模型 ID', { exact: true }).fill('http401')
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'stale')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'error')
  await expect(page.locator('.connection-test-result')).toContainText('认证失败')
  assert.equal((await data('providers.list'))[0].model, 'http401')
  await page.getByLabel('模型 ID', { exact: true }).fill('fixture-chat')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'success')
  await mkdir('output', { recursive: true })
  await page.locator('.provider-form').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/provider-setup-test.png' })
  await page.getByLabel('模型 ID', { exact: true }).fill('slow')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await page.getByRole('button', { name: '取消测试', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'cancelled')
  await page.getByLabel('模型 ID', { exact: true }).fill('fixture-chat')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'success')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  // A new configuration can be saved and tested in one click, without making a duplicate.
  await page.getByRole('button', { name: '添加供应商', exact: true }).click()
  await page.getByLabel('供应商名称', { exact: true }).fill('无认证测试端点')
  await page.getByLabel('Base URL', { exact: true }).fill(url)
  await page.getByLabel('模型 ID', { exact: true }).fill('fixture-chat')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'success')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.locator('.connection-test-result')).toHaveAttribute('data-state', 'success')
  const extras = (await data('providers.list')).filter((item) => item.id !== provider.id)
  assert.equal(extras.length, 1)
  await data('providers.remove', { providerId: extras[0].id })
  await page.reload()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name: '编辑 本地协议测试替身', exact: true }).click()
  await check('读取模型列表')
  await expect(page.getByRole('alert')).toContainText('可继续手工填写模型 ID')
  await check()
  await expect(page.getByRole('row').filter({ hasText: '工具调用及结果' })).toContainText('未知')
  await page.getByRole('button', { name: '检查流式文本', exact: true }).click()
  await expect(page.getByLabel('测试响应', { exact: true })).toHaveText('连接')
  await expect(page.getByLabel('测试响应', { exact: true })).toHaveText('连接成功')
  await expect(page.getByRole('status').filter({ hasText: '本次检查完成' })).toBeVisible()
  await check('检查连接')
  assert.ok(
    requests.some((body) =>
      body.messages.some(
        (message) => message.role === 'tool' && message.tool_call_id === 'fixture-probe',
      ),
    ),
  )
  let saved = (await data('providers.list'))[0]
  assert.deepEqual(
    saved.report.checks
      .filter((check) => check.ok)
      .map((check) => check.kind)
      .sort(),
    ['streaming', 'text', 'tools'],
  )
  modelsAvailable = true
  await check('读取模型列表')
  await page.getByRole('combobox', { name: '从列表选择模型', exact: true }).click()
  await page.getByRole('option', { name: 'fixture-other', exact: true }).click()
  await expect(page.getByLabel('模型 ID', { exact: true })).toHaveValue('fixture-other')
  await expect(page.getByRole('button', { name: '检查连接', exact: true })).toBeDisabled()
  await setModel('fixture-other')
  saved = (await data('providers.list'))[0]
  assert.equal(saved.report, null, 'configuration edits invalidate evidence')
  await setModel('fixture-chat')
  await check('检查结构化输出')
  await check('检查连接')
  await mkdir('output', { recursive: true })
  await page.locator('.provider-diagnostics').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/provider-local-fixture.png' })
  await application.close()
  application = undefined
  await launch()
  await page.getByRole('button', { name: '编辑 本地协议测试替身', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: '工具调用及结果' })).toContainText(
    '检查通过',
  )
  for (const [model, code] of [
    ['http401', 'AUTHENTICATION'],
    ['http403', 'ACCESS_DENIED'],
    ['http429', 'RATE_LIMITED'],
    ['http500', 'SERVER_ERROR'],
  ]) {
    await setModel(model)
    await check()
    await expect(page.getByRole('row').filter({ hasText: '检查文本' })).toContainText(code)
    assert.equal(
      await page
        .getByText('private error content must not reach Renderer', { exact: true })
        .count(),
      0,
    )
  }
  await setModel('disconnect')
  await check('检查流式文本')
  await expect(page.getByRole('row').filter({ hasText: '检查流式文本' })).toContainText(
    'DISCONNECTED',
  )
  await setModel('slow')
  await page.getByLabel('超时（秒）', { exact: true }).fill('1')
  await check()
  await expect(page.getByRole('row').filter({ hasText: '检查文本' })).toContainText('TIMEOUT')
  await page.getByLabel('超时（秒）', { exact: true }).fill('30')
  await page.getByRole('button', { name: '检查文本', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消检查', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消检查', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '检查已取消' })).toBeVisible()
  await expect.poll(() => aborted).toBeGreaterThanOrEqual(1)
  await page.getByRole('button', { name: '检查文本', exact: true }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消检查', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '编辑 本地协议测试替身', exact: true }).click()
  await setModel('fixture-chat')
  await page.getByRole('button', { name: '清除密钥', exact: true }).click()
  await expect.poll(async () => (await data('providers.list'))[0].hasCredential).toBe(false)
  await page.getByRole('button', { name: '删除供应商', exact: true }).click()
  await page.getByRole('button', { name: '保留', exact: true }).click()
  assert.equal((await data('providers.list')).length, 1)
  await page.getByRole('button', { name: '删除供应商', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect.poll(async () => (await data('providers.list')).length).toBe(0)
  assert.deepEqual(pageErrors, [])
  assert.ok(authorized > 10, 'Main decrypted the protected credential for native fetch')
  await application.close()
  application = undefined
  // Scan only this disposable fixture profile, never user credentials.
  const { readdir, readFile } = await import('node:fs/promises')
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) await scan(file)
      else if (entry.isFile())
        assert.equal(
          (await readFile(file)).includes(Buffer.from('devly-provider-native-fixture-')),
          false,
          'fixture Key must not persist in plaintext',
        )
    }
  }
  await scan(join(root, 'user-data'))
  console.log(
    JSON.stringify(
      {
        fixtureOnly: true,
        realSupplierValidated: false,
        passed: [
          'UI CRUD and manual model fallback on /models 404',
          'native fetch SSE incremental rendering and tool-result round trip',
          'independent capabilities, JSON schema probe and restart persistence',
          '401/403/429/500, disconnect, timeout, cancellation and editor cleanup',
          'revision invalidation and provider removal',
          'actual OS encrypted key replacement, Main-only native fetch auth, UI clear and no plaintext profile files',
          'creation-form Key entry/cancel/replace, one-click save/test, inline success/auth error and stale result invalidation',
        ],
        requests: requests.length,
        aborted,
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
