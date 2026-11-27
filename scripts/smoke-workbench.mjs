// Real desktop + local Git/PTY fixtures only. No external model requests.
import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const root = await mkdtemp(join(tmpdir(), 'devly-workbench-ui-')),
  project = join(root, 'workbench-project'),
  profile = join(root, 'profile')
await mkdir(project)
await mkdir('output', { recursive: true })
await writeFile(join(project, '中文 文件.txt'), 'initial\n')
const git = (...args) =>
  execFileSync('/usr/bin/git', ['-C', project, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    encoding: 'utf8',
  })
git('init', '-q')
git('config', 'user.name', 'Real Fixture Author')
git('config', 'user.email', 'fixture@example.invalid')
git('add', '.')
git('commit', '--no-verify', '-qm', 'Actual initial commit')
const initial = git('rev-parse', 'HEAD').trim()
let app, page
const errors = [],
  remote = []
try {
  const env = { ...process.env, DEVLY_USER_DATA_DIR: profile }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remote.push(request.url())
  })
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, project)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  await page.getByRole('button', { name: 'Git 工作区', exact: true }).click()
  await page.getByRole('button', { name: `提交 ${initial.slice(0, 7)}`, exact: true }).click()
  await expect(page.locator('[data-git-hash]')).toContainText('Real Fixture Author')
  await expect(page.locator('[data-git-hash]')).toContainText('中文 文件.txt')
  await page.screenshot({ path: 'output/git-history-real.png' })
  await writeFile(join(project, '中文 文件.txt'), 'edited on disk\n')
  await page.getByRole('button', { name: '暂存与提交', exact: true }).click()
  await page.getByRole('button', { name: '刷新 Git', exact: true }).click()
  await page.getByLabel('提交说明', { exact: true }).fill('Actual UI local commit')
  await page.getByRole('button', { name: '暂存磁盘版本', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消暂存', exact: true })).toBeVisible()
  await expect(page.getByLabel('提交说明', { exact: true })).toHaveValue('Actual UI local commit')
  await page.getByRole('button', { name: '审查本地提交', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('中文 文件.txt')
  await page.getByRole('button', { name: '确认本地提交', exact: true }).click()
  await expect.poll(() => git('log', '-1', '--format=%s').trim()).toBe('Actual UI local commit')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('提交说明', { exact: true })).toHaveValue('')
  await page.getByRole('textbox', { name: '新分支名称', exact: true }).fill('ui-branch')
  await page.getByRole('button', { name: '新建并切换', exact: true }).click()
  await expect.poll(() => git('symbolic-ref', '--short', 'HEAD').trim()).toBe('ui-branch')
  await writeFile(join(project, '中文 文件.txt'), 'must retain\n')
  await page.getByRole('button', { name: '刷新 Git', exact: true }).click()
  await page.getByRole('textbox', { name: '新分支名称', exact: true }).fill('refused-dirty-branch')
  await page.getByRole('button', { name: '新建并切换', exact: true }).click()
  await expect(page.locator('.git-result')).toContainText('有更改')
  assert.equal(git('symbolic-ref', '--short', 'HEAD').trim(), 'ui-branch')
  assert.equal(await readFile(join(project, '中文 文件.txt'), 'utf8'), 'must retain\n')
  await page.screenshot({ path: 'output/git-working-tree.png' })
  // Interact with xterm through actual keyboard events; inspect the real PTY as the independent oracle.
  const rpc = async (operation, args) => {
    const result = await page.evaluate(
      async ({ operation, args }) => window.devly.data(operation, args),
      { operation, args },
    )
    assert.equal(result.ok, true)
    return result.data
  }
  await page.getByRole('button', { name: '交互终端', exact: true }).click()
  await page.getByRole('button', { name: '新建终端', exact: true }).click()
  await expect(page.locator('.interactive-terminal-host .xterm-helper-textarea')).toHaveCount(1)
  const terminalId = await page
    .locator('.interactive-terminal-host')
    .getAttribute('data-terminal-id')
  const boot = await rpc('bootstrap', {}),
    projectId = boot.activeProjectId
  const readTerminal = () => rpc('terminal.read', { projectId, terminalId, after: 0 })
  const command = async (text) => {
    await page.locator('.interactive-terminal-host .xterm-helper-textarea').focus()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await command("printf '\\n__UI_A__\\n'")
  await expect
    .poll(async () => /\n__UI_A__\r?\n/.test((await readTerminal()).text), { timeout: 10000 })
    .toBe(true)
  await command("printf '\\n__UI_SLEEP__\\n'; /bin/sleep 30")
  await expect.poll(async () => /\n__UI_SLEEP__\r?\n/.test((await readTerminal()).text)).toBe(true)
  await page.keyboard.press('Control+c')
  await command("printf '\\n__UI_INTERRUPTED__\\n'")
  await expect
    .poll(async () => /\n__UI_INTERRUPTED__\r?\n/.test((await readTerminal()).text), {
      timeout: 10000,
    })
    .toBe(true)
  const firstSize = (await readTerminal()).info.cols
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 800))
  await expect.poll(async () => (await readTerminal()).info.cols).not.toBe(firstSize)
  await page.getByRole('button', { name: '新建终端', exact: true }).click()
  await command("printf '\\n__UI_SECOND__\\n'")
  const secondId = await page.locator('.interactive-terminal-host').getAttribute('data-terminal-id')
  await expect
    .poll(async () =>
      /\n__UI_SECOND__\r?\n/.test(
        (await rpc('terminal.read', { projectId, terminalId: secondId, after: 0 })).text,
      ),
    )
    .toBe(true)
  await page.getByRole('tab', { name: '终端 1', exact: true }).click()
  assert.equal((await readTerminal()).text.includes('__UI_SECOND__'), false)
  await page.screenshot({ path: 'output/interactive-terminal.png' })
  await page.getByRole('button', { name: '关闭终端', exact: true }).click()
  await expect.poll(async () => (await rpc('terminal.list', { projectId })).length).toBe(1)
  // Existing saved theme preferences must also drive Monaco and xterm.
  const otherProject = join(root, 'other-project')
  await mkdir(otherProject)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, otherProject)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  const otherId = (await rpc('bootstrap', {})).activeProjectId
  await page.getByRole('button', { name: '交互终端', exact: true }).click()
  await page.getByRole('button', { name: '新建终端', exact: true }).click()
  const otherTerminal = await page
    .locator('.interactive-terminal-host')
    .getAttribute('data-terminal-id')
  await command("printf '\\n__PROJECT_B_PID__:%s\\n' $$")
  await expect
    .poll(async () =>
      /\n__PROJECT_B_PID__:\d+\r?\n/.test(
        (await rpc('terminal.read', { projectId: otherId, terminalId: otherTerminal, after: 0 }))
          .text,
      ),
    )
    .toBe(true)
  const otherOutput = (
    await rpc('terminal.read', { projectId: otherId, terminalId: otherTerminal, after: 0 })
  ).text
  const otherPid = Number(/\n__PROJECT_B_PID__:(\d+)/.exec(otherOutput)[1])
  await page.getByRole('button', { name: 'workbench-project', exact: true }).click()
  await expect(page.locator('.interactive-terminal-host')).toHaveAttribute(
    'data-terminal-id',
    secondId,
  )
  assert.equal(
    (await rpc('terminal.read', { projectId, terminalId: secondId, after: 0 })).text.includes(
      '__PROJECT_B_PID__',
    ),
    false,
  )
  async function setTheme(value) {
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.getByRole('combobox', { name: '主题', exact: true }).click()
    await page
      .getByRole('option', {
        name: { light: '浅色', dark: '深色', system: '跟随系统' }[value],
        exact: true,
      })
      .click()
    await page.getByRole('button', { name: '保存设置', exact: true }).click()
    await expect(page.getByRole('button', { name: '已保存', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  }
  await setTheme('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '项目文件', exact: true }).click()
  await page.getByRole('button', { name: '中文 文件.txt', exact: true }).click()
  await expect(page.locator('[data-editor-file] .monaco-editor')).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() =>
      page
        .locator('.interactive-terminal-host .xterm-viewport')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(250, 250, 250)')
  await expect
    .poll(() =>
      page
        .locator('[data-editor-file] .monaco-editor')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(250, 250, 250)')
  await page.screenshot({ path: 'output/workbench-light.png' })
  await setTheme('dark')
  await expect
    .poll(() =>
      page
        .locator('.interactive-terminal-host .xterm-viewport')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(28, 29, 31)')
  await expect
    .poll(() =>
      page
        .locator('[data-editor-file] .monaco-editor')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(28, 29, 31)')
  await setTheme('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  assert.equal((await rpc('settings.get', { projectId: null })).theme, 'system')
  // Mouse/keyboard resize and real process restart prove persisted desktop layout.
  async function drag(name, dx, dy) {
    const handle = page.getByRole('separator', { name, exact: true }),
      box = await handle.boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 })
    await page.mouse.up()
  }
  await drag('调整侧栏宽度', 35, 0)
  const divider = page.getByRole('separator', { name: '调整侧栏宽度', exact: true })
  await divider.focus()
  await page.keyboard.press('ArrowRight')
  const sidebarWidth = Number(await divider.getAttribute('aria-valuenow'))
  await expect.poll(async () => (await rpc('layout.get', { projectId })).sidebar).toBe(sidebarWidth)
  await drag('调整编辑区宽度', -45, 0)
  await drag('调整文件列表高度', 0, 25)
  await drag('调整终端高度', 0, -30)
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+l`)
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeFocused()
  await page.keyboard.press(`${modifier}+j`)
  await expect(page.getByRole('button', { name: '新建终端', exact: true })).toHaveCount(0)
  await page.keyboard.press(`${modifier}+j`)
  await expect(page.getByRole('button', { name: '新建终端', exact: true })).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680))
  await expect.poll(async () => (await rpc('layout.get', { projectId })).terminal).toBeLessThan(35)
  for (const locator of [
    page.getByRole('textbox', { name: '任务输入', exact: true }),
    page.getByRole('button', { name: '新建终端', exact: true }),
    page.getByRole('button', { name: '保存', exact: true }),
  ])
    await expect(locator).toBeInViewport({ ratio: 1 })
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    true,
  )
  await page.screenshot({ path: 'output/workbench-minimum.png' })
  await setTheme('light')
  const savedLayout = await rpc('layout.get', { projectId })
  assert.equal(savedLayout.showEditor, true)
  assert.equal(savedLayout.showTerminal, true)
  await command("printf '\\n__EXIT_PID__:%s\\n' $$")
  await expect
    .poll(async () =>
      /\n__EXIT_PID__:\d+\r?\n/.test(
        (await rpc('terminal.read', { projectId, terminalId: secondId, after: 0 })).text,
      ),
    )
    .toBe(true)
  const exitOutput = (await rpc('terminal.read', { projectId, terminalId: secondId, after: 0 }))
    .text
  const exitPid = Number(/\n__EXIT_PID__:(\d+)/.exec(exitOutput)[1])
  await app.close()
  for (const pid of [exitPid, otherPid])
    await expect
      .poll(() => {
        try {
          process.kill(pid, 0)
          return true
        } catch {
          return false
        }
      })
      .toBe(false)
  app = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByRole('textbox', { name: '任务输入', exact: true })).toBeEditable()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: '新建终端', exact: true })).toBeVisible()
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole('separator', { name: '调整侧栏宽度', exact: true })
          .getAttribute('aria-valuenow'),
      ),
    )
    .toBe(savedLayout.sidebar)
  const restoredLayout = await rpc('layout.get', { projectId })
  assert.equal(restoredLayout.showEditor, true)
  assert.equal(restoredLayout.showTerminal, true)
  assert.equal((await rpc('terminal.list', { projectId })).length, 0)
  await page.screenshot({ path: 'output/workbench-restored.png' })
  assert.deepEqual(errors, [])
  assert.deepEqual(remote, [])
  console.log(
    JSON.stringify(
      {
        fixture: true,
        mode: process.env.DEVLY_EXECUTABLE ? 'packaged' : 'built-development',
        checks: [
          'Original Commit renders actual author/hash/files',
          'User staging and reviewed local commit create real Git object',
          'Branch create and dirty workspace refusal preserve file',
          'Actual xterm keyboard input, Ctrl+C, window resize, terminal switching and close',
          'Two project terminal UIs stay isolated; actual Shell PIDs are gone after app exit',
          'Saved light/dark/system theme follows app, Monaco and xterm',
          'Mouse/keyboard layout, shortcuts, minimum window and actual restart restore without replaying terminal input',
        ],
        screenshots: ['output/git-history-real.png', 'output/git-working-tree.png'],
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page?.screenshot({ path: 'output/workbench-failure.png' }).catch(() => {})
  throw error
} finally {
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    .catch(() => {})
  await app?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
