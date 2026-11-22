// Opt-in real API acceptance; never called by check/CI. Sends only a generated temporary project.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
if (
  !process.env.DEVLY_EXECUTABLE ||
  !process.env.DEVLY_LIVE_SOURCE_PROFILE ||
  !process.env.DEVLY_LIVE_PROVIDER_ID
)
  throw new Error(
    'Explicit packaged executable, source profile and selected Provider UUID required',
  )
const require = createRequire(import.meta.url),
  root = await mkdtemp(join(tmpdir(), 'devly-agent-live-')),
  profile = join(root, 'profile'),
  project = join(root, 'generated-project')
await mkdir(profile)
await mkdir(project)
await mkdir(join(project, 'src'))
const proof = 'DEVLY_RO_' + randomUUID().replaceAll('-', '')
await writeFile(
  join(project, 'src/proof.ts'),
  '// DEVLY_AGENT_TARGET\nexport const acceptance = "' + proof + '";\n',
)
let application, page, selected
const report = { source: 'real selected API, generated temporary project only' }
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  if (!result.ok) throw new Error(result.error.code)
  return result.data
}
async function launch() {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    executablePath: process.env.DEVLY_EXECUTABLE,
    args: [],
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
}
try {
  const seeded = spawnSync(require('electron'), ['scripts/live-agent-seed.mjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DEVLY_LIVE_TARGET_PROFILE: profile },
    stdio: 'pipe',
    timeout: 30000,
  })
  if (seeded.status !== 0) throw new Error('SEED_FAILED')
  selected = JSON.parse(await readFile(join(profile, 'selected-provider.json'), 'utf8'))
  Object.assign(report, selected)
  await launch()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page.getByRole('combobox', { name: '运行模式', exact: true }).click()
  await page.getByRole('option', { name: '只读 Agent', exact: true }).click()
  await page
    .getByRole('textbox', { name: '任务输入', exact: true })
    .fill(
      '只读验收：必须先使用 search_text 搜索 DEVLY_AGENT_TARGET，再在下一轮使用 read_file 读取命中文件。最后只回复该文件 acceptance 的值。不要猜口令，不要写入。搜索和读取必须在不同模型轮次进行。',
    )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  let boot, snapshot
  await expect
    .poll(
      async () => {
        boot = await data('bootstrap')
        if (!boot.activeSessionId) return false
        snapshot = await data('chat.read', {
          projectId: boot.activeProjectId,
          sessionId: boot.activeSessionId,
        })
        return snapshot.turn && !['pending', 'running'].includes(snapshot.turn.state)
      },
      { timeout: 135000, intervals: [250, 500] },
    )
    .toBeTruthy()
  if (snapshot.turn.state !== 'completed')
    throw new Error(snapshot.turn.error?.code || 'TURN_FAILED')
  assert.ok(snapshot.text.includes(proof), 'MODEL_PROOF_MISMATCH')
  const search = snapshot.tools.find((t) => t.name === 'search_text' && t.state === 'completed'),
    read = snapshot.tools.find((t) => t.name === 'read_file' && t.state === 'completed')
  assert.ok(search && read && search.position < read.position, 'SEARCH_READ_ORDER')
  assert.ok(snapshot.turn.agent.rounds >= 3, 'MULTI_ROUND_REQUIRED')
  assert.equal(new Set(snapshot.tools.map((t) => t.callId)).size, snapshot.tools.length)
  assert.ok(
    snapshot.tools.every((t) => !!t.blobId),
    'LOG_REFERENCE_REQUIRED',
  )
  Object.assign(report, {
    completed: true,
    rounds: snapshot.turn.agent.rounds,
    calls: snapshot.turn.agent.calls,
    tools: snapshot.tools.map((t) => ({ name: t.name, state: t.state, hasLog: !!t.blobId })),
    proofMatched: true,
  })
  const count = snapshot.tools.length
  await application.close()
  application = undefined
  await launch()
  const restored = await data('chat.read', {
    projectId: boot.activeProjectId,
    sessionId: boot.activeSessionId,
  })
  assert.equal(restored.tools.length, count)
  assert.ok(restored.text.includes(proof))
  report.restartRestored = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.failure =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'LIVE_ACCEPTANCE_FAILED'
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  await application?.close()
  await rm(root, { recursive: true, force: true })
}
