// Actual Electron + Git/worktrees + official SDK MCP server + real Skill files; model responses are local fixtures.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMcpFixture } from './mcp-server-fixture.mjs'
const root = await mkdtemp(join(tmpdir(), 'devly-extensions-ui-')),
  errors = [],
  requests = []
await mkdir('output', { recursive: true })
const frame = (delta, finish) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`
const tool = (name, args, id) =>
  frame(
    {
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
      ],
    },
    'tool_calls',
  ) + 'data: [DONE]\n\n'
const fixture = await startMcpFixture({
  onEcho: (value) => writeFile(join(root, 'mcp-audit.txt'), value),
  model: async (req, res, body) => {
    const goal = body.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .find((value) => /^UI_(PARENT|CHILD)/.test(value)),
      results = body.messages.filter((m) => m.role === 'tool'),
      tools = body.tools.map((t) => t.function)
    requests.push({ goal, model: body.model, tools: tools.map((t) => t.name) })
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    assert.ok(JSON.stringify(body.messages).includes('UI_PROJECT_MEMORY'))
    assert.ok(JSON.stringify(body.messages).includes('UI_SKILL_INSTRUCTION'))
    if (goal === 'UI_PARENT') {
      if (!results.length) {
        const mcp = tools.find((t) => t.name.startsWith('mcp_') && t.description.includes('Echo'))
        assert.ok(mcp)
        res.end(tool(mcp.name, { message: 'UI_APPROVED_MCP' }, 'mcp-call'))
        return
      }
      if (results.length === 1) {
        assert.ok(tools.some((t) => t.name === 'spawn_agents'))
        const caps = { maxTokens: 4096, maxCalls: 4, maxOutputChars: 16000, maxDurationMs: 60000 }
        res.end(
          tool(
            'spawn_agents',
            {
              tasks: [
                { ...caps, text: 'UI_CHILD_READ', mode: 'read-only' },
                { ...caps, text: 'UI_CHILD_WRITE', mode: 'project-write' },
              ],
            },
            'spawn-call',
          ),
        )
        return
      }
      assert.ok(JSON.parse(results.at(-1).content).ok)
      res.end(
        frame(
          { content: 'Parent observed actual MCP, Skill and isolated child results.' },
          'stop',
        ) + 'data: [DONE]\n\n',
      )
      return
    }
    assert.ok(!tools.some((t) => t.name === 'spawn_agents'))
    if (goal === 'UI_CHILD_READ') {
      if (!results.length) {
        res.end(
          tool(
            'read_skill_resource',
            {
              skill: '.devly/skills/ui-review/SKILL.md',
              file: 'resources/rules.txt',
              startLine: 1,
              endLine: 20,
            },
            'skill-call',
          ),
        )
        return
      }
      assert.ok(results[0].content.includes('UI_REAL_SKILL_RESOURCE'))
      res.end(
        frame({ content: 'Read the real Skill resource in the isolated child.' }, 'stop') +
          'data: [DONE]\n\n',
      )
      return
    }
    if (!results.length) {
      res.end(tool('read_file', { path: 'code.txt', startLine: 1, limit: 20 }, 'read-call'))
      return
    }
    if (results.length === 1) {
      const result = JSON.parse(results[0].content)
      assert.ok(result.ok)
      res.end(
        tool(
          'apply_patch',
          {
            changes: [
              {
                path: 'code.txt',
                expectedHash: result.data.contentHash,
                content: 'ui-child-only edit\n',
              },
            ],
          },
          'patch-call',
        ),
      )
      return
    }
    res.end(frame({ content: 'Observed approved child patch.' }, 'stop') + 'data: [DONE]\n\n')
  },
})
const executable = createRequire(import.meta.url)('electron')
let app, page
async function launch() {
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
  const result = await page.evaluate(({ operation, args }) => window.devly.data(operation, args), {
    operation,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result.error))
  return result.data
}
async function group(name) {
  if (!(await page.getByRole('button', { name: '返回工作台', exact: true }).isVisible()))
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('button', { name, exact: true }).click()
}
async function choose(label, name) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
try {
  const seeded = spawnSync(executable, ['scripts/extensions-ui-seed.mjs', root, fixture.modelUrl], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000,
  })
  assert.equal(seeded.status, 0, seeded.stderr)
  const seed = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'))
  await launch()
  await group('项目上下文')
  await expect(page.locator('#settings-group-providers')).toBeHidden()
  await page.getByLabel('记录名称', { exact: true }).fill('UI memory')
  await page.getByLabel('记录内容', { exact: true }).fill('UI_PROJECT_MEMORY')
  await page.getByRole('button', { name: '保存项目记录', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看/编辑 UI memory', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看/编辑 UI memory', exact: true }).click()
  await page.getByLabel('记录内容', { exact: true }).fill('UI_PROJECT_MEMORY_UPDATED')
  await page.getByRole('button', { name: '保存项目记录', exact: true }).click()
  await expect
    .poll(
      async () => (await data('project.context.list', { projectId: seed.projectId }))[0].content,
    )
    .toBe('UI_PROJECT_MEMORY_UPDATED')
  assert.equal((await data('project.context.list', { projectId: seed.projectId })).length, 1)
  await group('Skills')
  await page.getByRole('button', { name: '查看 Skill ui-review', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('UI_SKILL_INSTRUCTION')
  await page.getByRole('button', { name: '启用此 Skill', exact: true }).click()
  await expect(page.getByText(/SKILL.md · 已启用/)).toBeVisible()
  await group('MCP 工具')
  await page.getByLabel('MCP 名称', { exact: true }).fill('UI MCP')
  await page.getByLabel('MCP 地址', { exact: true }).fill(fixture.url)
  await choose('MCP 工具权限', '项目 Agent 逐次审批调用')
  await page.getByRole('button', { name: '保存 MCP', exact: true }).click()
  await expect(page.getByRole('button', { name: '测试 MCP 连接', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '测试 MCP 连接', exact: true }).click()
  await expect(page.getByText(/连接与工具发现成功/)).toBeVisible()
  assert.equal(fixture.calls.length, 0)
  await page.getByRole('button', { name: '编辑 MCP UI MCP', exact: true }).click()
  await page.getByLabel('MCP 名称', { exact: true }).fill('UI MCP updated')
  await page.getByRole('button', { name: '保存 MCP', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '编辑 MCP UI MCP updated', exact: true }),
  ).toBeVisible()
  assert.equal((await data('mcp.servers', { projectId: seed.projectId })).length, 1)
  await group('任务与隔离')
  await page.getByLabel('新任务', { exact: true }).fill('UI_PARENT')
  await choose('任务模式', '项目 Agent（逐次审批）')
  await choose('任务委派', '允许提议子任务（另行审批）')
  await page.getByRole('button', { name: '创建任务', exact: true }).click()
  await expect(page.getByText('已创建独立会话并加入任务队列', { exact: true })).toBeVisible()
  const parent = (await data('tasks.list', { projectId: seed.projectId })).find(
    (t) => t.title === 'UI_PARENT',
  )
  assert.ok(parent)
  await page
    .locator('.extension-row')
    .filter({ hasText: 'UI_PARENT' })
    .getByRole('button', { name: '打开任务', exact: true })
    .click()
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible({
    timeout: 30000,
  })
  await expect(page.locator('.mcp-tool-origin')).toContainText('UI MCP updated')
  assert.equal(fixture.calls.length, 0)
  await page.getByRole('button', { name: '允许本次', exact: true }).click()
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '允许本次', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开子任务 2', exact: true })).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '打开子任务 2', exact: true }).click()
  await expect(page.getByRole('button', { name: '允许本次', exact: true })).toBeVisible({
    timeout: 30000,
  })
  await expect(page.locator('.agent-family')).toContainText('隔离子任务')
  assert.equal(await readFile(join(seed.project, 'code.txt'), 'utf8'), 'base\n')
  await page.getByRole('button', { name: '允许本次', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText('Observed approved child patch.', {
    timeout: 30000,
  })
  await page.getByRole('button', { name: '打开父任务', exact: true }).click()
  await expect(page.locator('.chat-messages')).toContainText(
    'Parent observed actual MCP, Skill and isolated child results.',
    { timeout: 30000 },
  )
  const final = await data('chat.read', {
      projectId: parent.projectId,
      sessionId: parent.sessionId,
    }),
    child = final.turn.agent.family.children[1],
    workspaces = await data('workspaces.list', { projectId: seed.projectId }),
    workspace = workspaces.find((w) => w.id === child.workspaceId),
    readChild = final.turn.agent.family.children[0],
    readWorkspace = workspaces.find((w) => w.id === readChild.workspaceId)
  assert.equal(fixture.calls.length, 1)
  assert.equal(await readFile(join(root, 'mcp-audit.txt'), 'utf8'), 'UI_APPROVED_MCP')
  assert.equal(await readFile(join(seed.project, 'code.txt'), 'utf8'), 'base\n')
  assert.equal(await readFile(join(workspace.path, 'code.txt'), 'utf8'), 'ui-child-only edit\n')
  await page.screenshot({ path: 'output/extensions-parent.png' })
  await group('任务与隔离')
  await data('workspaces.review', { projectId: seed.projectId, workspaceId: workspace.id })
  await page
    .locator('.extension-row')
    .filter({ hasText: workspace.branch })
    .getByRole('button', { name: '审查工作区', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText('+ui-child-only edit')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680))
  const bounds = await page.getByRole('button', { name: '提交审查文件', exact: true }).boundingBox()
  assert.ok(
    bounds.y + bounds.height <= (await page.evaluate(() => innerHeight)),
    'review actions fit minimum window',
  )
  await page.screenshot({ path: 'output/extensions-worktree-review.png' })
  await page.getByLabel('提交说明', { exact: true }).fill('reviewed isolated child change')
  await page.getByRole('button', { name: '提交审查文件', exact: true }).click()
  await expect(
    page.getByText('已提交审查范围中的任务文件，没有推送', { exact: true }),
  ).toBeVisible()
  await page
    .locator('.extension-row')
    .filter({ hasText: workspace.branch })
    .getByRole('button', { name: '审查工作区', exact: true })
    .click()
  await page.getByRole('button', { name: '快进合并到主目录', exact: true }).click()
  await expect(page.getByText(/已快进合并任务提交/)).toBeVisible()
  assert.equal(await readFile(join(seed.project, 'code.txt'), 'utf8'), 'ui-child-only edit\n')
  const backup = join(root, 'extensions.devly-backup')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, backup)
  await data('storage.backup')
  const preview = await data('storage.restore.inspect')
  await data('sessions.rename', {
    projectId: parent.projectId,
    sessionId: parent.sessionId,
    title: 'after-backup-title',
  })
  await data('storage.restore.stage', {
    previewId: preview.previewId,
    digest: preview.summary.digest,
  })
  const count = requests.length
  await close()
  await launch()
  assert.equal(requests.length, count)
  assert.equal(fixture.calls.length, 1)
  await group('任务与隔离')
  assert.equal(
    (await data('sessions.get', { projectId: parent.projectId, sessionId: parent.sessionId }))
      .title,
    'UI_PARENT',
  )
  assert.equal((await data('project.context.list', { projectId: seed.projectId })).length, 1)
  assert.equal((await data('mcp.servers', { projectId: seed.projectId })).length, 1)
  assert.equal(
    (await data('skills.discover', { projectId: seed.projectId })).filter((s) => s.enabled).length,
    1,
  )
  assert.equal(
    (await data('tasks.list', { projectId: seed.projectId })).filter(
      (t) => t.parentTurnId === parent.id,
    ).length,
    2,
  )
  await page
    .locator('.extension-row')
    .filter({ hasText: readWorkspace.branch })
    .getByRole('button', { name: '审查工作区', exact: true })
    .click()
  await page.getByRole('button', { name: '关闭干净工作区', exact: true }).click()
  await expect(page.getByText(/已关闭干净工作区/)).toBeVisible()
  const opened = await data('tasks.open', { projectId: seed.projectId, turnId: readChild.turnId })
  assert.equal(opened.sessionId, readChild.sessionId)
  await page.reload()
  await expect(page.locator('.chat-messages')).toContainText(
    'Read the real Skill resource in the isolated child.',
  )
  await expect(page.getByRole('button', { name: '重新选择项目', exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
        actualMcpAndSkill: true,
        modelFixture: true,
        checks: [
          'Grouped user memory CRUD preserves IDs; real Skill review/enabling and MCP configuration/discovery use original UI controls',
          'Parent actual MCP approval→two isolated child tasks→child patch approval→actual files and parent results',
          'User reviewed workspace diff, committed and fast-forward merged; minimum-window actions visible',
          'Restart restores metadata without tool/model replay; closed workspace keeps branch and readable task history',
          'A real current-schema backup/restore retains v11 extension data: project records, enabled Skill, MCP configuration and parent/child/workspace history without restoring live calls',
        ],
        modelRequests: requests.length,
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/extensions-failure.png' }).catch(() => {})
  throw error
} finally {
  await close()
  await fixture.close()
  await rm(root, { recursive: true, force: true })
}
