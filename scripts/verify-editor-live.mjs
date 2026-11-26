// Explicit real API acceptance: generated project only, credentials remain in protected Main storage.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
if (
  !process.env.DEVLY_EXECUTABLE ||
  !process.env.DEVLY_LIVE_SOURCE_PROFILE ||
  !process.env.DEVLY_LIVE_PROVIDER_ID
)
  throw new Error(
    'Explicit executable/source profile/provider UUID required; never supply a plaintext key',
  )
const require = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'devly-mvp-live-')),
  profile = join(root, 'profile'),
  project = join(root, 'generated-mvp-project')
await mkdir(profile)
await mkdir(project)
await mkdir(join(project, 'src'))
await mkdir(join(project, 'tests'))
await mkdir('output', { recursive: true })
const original = '# DEVLY_MVP_TARGET\ntotal() { expr "$1" - "$2"; }\n'
const fixed = original.replace(' - ', ' + '),
  proof = 'DEVLY_MVP_TEST_OK_' + randomUUID().replaceAll('-', '')
const tests = `#!/bin/sh\nset -eu\n. ./src/total.sh\ntest "$(total 8 5)" = "13"\ntest "$(total 3 7)" = "10"\ntest "$(total 0 9)" = "9"\nprintf '${proof}\\n'\n`
await writeFile(join(project, 'src/total.sh'), original)
await writeFile(join(project, 'tests/verify.sh'), tests)
await writeFile(
  join(project, 'AGENTS.md'),
  'Only edit src/total.sh. Preserve tests and project instructions. Use read_file versions before apply_patch. No network, daemons or external directory access. Run exactly /bin/sh tests/verify.sh for validation.',
)
const git = (...args) =>
  execFileSync('/usr/bin/git', ['-C', project, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdio: 'pipe',
  })
git('init', '-q')
git('add', '.')
git(
  '-c',
  'user.name=Devly Acceptance',
  '-c',
  'user.email=fixture@example.invalid',
  'commit',
  '--no-verify',
  '-qm',
  'generated failing fixture',
)
const report = {
  source: 'real API; generated project; tightly scoped approval operator',
  checks: [],
}
let application, page
async function data(operation, args = {}) {
  const result = await page.evaluate(
    async ({ operation, args }) => window.devly.data(operation, args),
    { operation, args },
  )
  if (!result.ok) throw new Error(result.error.code)
  return result.data
}
const hash = (text) => createHash('sha256').update(text).digest('hex')
try {
  const seeded = spawnSync(require('electron'), ['scripts/live-agent-seed.mjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DEVLY_LIVE_TARGET_PROFILE: profile },
    stdio: 'pipe',
    timeout: 30000,
  })
  if (seeded.status !== 0) throw new Error('SEED_FAILED')
  Object.assign(report, JSON.parse(await readFile(join(profile, 'selected-provider.json'), 'utf8')))
  const env = { ...process.env, DEVLY_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    executablePath: process.env.DEVLY_EXECUTABLE,
    args: [],
    env,
    timeout: 30000,
  })
  page = await application.firstWindow()
  const settings = await data('settings.get', { projectId: null })
  await data('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      projectPermission: 'ask',
      maxTokens: 32768,
      agentLimits: {
        ...settings.agentLimits,
        maxRounds: 12,
        maxCalls: 24,
        maxDurationMs: 240000,
        contextChars: 100000,
      },
    },
  })
  await page.reload()
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page.getByRole('button', { name: '项目文件', exact: true }).click()
  await page.getByRole('button', { name: 'src', exact: true }).click()
  await page.getByRole('button', { name: 'total.sh', exact: true }).click()
  await expect(page.locator('[data-editor-file] .monaco-editor')).toBeVisible({ timeout: 30000 })
  await page.getByRole('combobox', { name: '运行模式', exact: true }).click()
  await page.getByRole('option', { name: '项目 Agent（逐次审批）', exact: true }).click()
  await page
    .getByRole('textbox', { name: '任务输入', exact: true })
    .fill(
      '这是受控编程验收。请先用 search_text 搜索 DEVLY_MVP_TARGET，再用 read_file 读取命中文件和 tests/verify.sh，定位 total 的错误。只修改 src/total.sh：完整保留原文件，只把函数里的一个减号 - 改成加号 +；不要改其他字符或添加注释。必须使用 apply_patch 并使用 read_file 返回的 contentHash。获得允许后必须用 run_command 执行且只执行 /bin/sh tests/verify.sh，cwd 为 .。不能修改测试、项目约定或其他文件，不能使用网络。最后根据实际退出码总结并给出文件路径。不允许只解释或输出命令文字。',
    )
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const until = Date.now() + 260000,
    answered = new Set()
  let boot, snapshot
  while (Date.now() < until) {
    boot = await data('bootstrap')
    if (boot.activeSessionId) {
      snapshot = await data('chat.read', {
        projectId: boot.activeProjectId,
        sessionId: boot.activeSessionId,
      })
      for (const tool of snapshot.tools.filter(
        (tool) => tool.approval?.state === 'pending' && !answered.has(tool.approval.id),
      )) {
        const input = JSON.parse(tool.input)
        const content = await readFile(join(project, 'src/total.sh'), 'utf8')
        const allowed =
          tool.name === 'apply_patch'
            ? input.changes?.length === 1 &&
              input.changes[0].path === 'src/total.sh' &&
              input.changes[0].expectedHash === hash(content) &&
              input.changes[0].content.replace(/\s/g, '') === fixed.replace(/\s/g, '')
            : tool.name === 'run_command' &&
              input.command === '/bin/sh tests/verify.sh' &&
              (!input.cwd || input.cwd === '.')
        await page
          .locator(`[data-approval-id="${tool.approval.id}"]`)
          .getByRole('button', { name: allowed ? '允许本次' : '拒绝本次', exact: true })
          .click({ timeout: 10000 })
        answered.add(tool.approval.id)
      }
      if (snapshot.turn && !['pending', 'running'].includes(snapshot.turn.state)) break
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  if (snapshot?.turn?.state !== 'completed')
    throw new Error(snapshot?.turn?.error?.code || 'LIVE_TURN_INCOMPLETE')
  const done = (name) =>
    snapshot.tools.filter((tool) => tool.name === name && tool.state === 'completed')
  assert.ok(
    done('search_text').length &&
      done('read_file').length &&
      done('apply_patch').length &&
      done('run_command').length,
    'REQUIRED_TOOLS_MISSING',
  )
  const command = done('run_command').find((tool) => {
    try {
      return (
        JSON.parse(tool.output).data?.exitCode === 0 &&
        JSON.parse(tool.output).data?.stdout?.includes(proof)
      )
    } catch {
      return false
    }
  })
  assert.ok(command, 'REAL_TEST_RESULT_MISSING')
  const actual = await readFile(join(project, 'src/total.sh'), 'utf8')
  assert.equal(actual.replace(/\s/g, ''), fixed.replace(/\s/g, ''))
  assert.equal(await readFile(join(project, 'tests/verify.sh'), 'utf8'), tests)
  const diff = await data('editor.diff', { projectId: boot.activeProjectId, path: 'src/total.sh' })
  assert.equal(diff.original.text, original)
  assert.equal(diff.modified.text, actual)
  const changes = await data('editor.changes', { projectId: boot.activeProjectId })
  assert.equal(changes.available, true)
  assert.ok(changes.changes.some((change) => change.path === 'src/total.sh'))
  const patchCard = page
    .locator('.agent-tool')
    .filter({ has: page.getByRole('button', { name: '查看更改：src/total.sh', exact: true }) })
    .last()
  if (
    await patchCard.getByRole('button', { name: '查看更改：src/total.sh', exact: true }).count()
  ) {
    if (
      !(await patchCard
        .getByRole('button', { name: '查看更改：src/total.sh', exact: true })
        .isVisible())
    )
      await patchCard.getByRole('button').first().click()
    await patchCard.getByRole('button', { name: '查看更改：src/total.sh', exact: true }).click()
  } else {
    await page.getByRole('button', { name: '项目更改', exact: true }).click()
    await page.locator('.editor-change-row').filter({ hasText: 'src/total.sh' }).click()
  }
  await expect(page.locator('[data-editor-diff="src/total.sh"] .monaco-diff-editor')).toBeVisible({
    timeout: 30000,
  })
  await page.screenshot({ path: 'output/editor-live-mvp.png' })
  Object.assign(report, {
    completed: true,
    rounds: snapshot.turn.agent.rounds,
    calls: snapshot.turn.agent.calls,
    exitCode: 0,
    testProofMatched: true,
    testsUnchanged: true,
    diffMatched: true,
    tools: snapshot.tools.map((tool) => ({
      name: tool.name,
      state: tool.state,
      hasLog: !!tool.blobId,
    })),
  })
  report.checks.push(
    'Real third-party search/read → approved patch → approved test command → matching file/Git/Monaco Diff',
  )
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.failure =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'LIVE_EDITOR_ACCEPTANCE_FAILED'
  await page?.screenshot({ path: 'output/editor-live-failure.png' }).catch(() => {})
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  await application
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await application?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
