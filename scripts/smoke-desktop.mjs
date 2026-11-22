import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const noCodex = process.env.DEVLY_SMOKE_NO_CODEX === '1'
const userData = await mkdtemp(join(tmpdir(), 'devly-desktop-'))
env.DEVLY_USER_DATA_DIR = userData
let isolatedPath
if (noCodex) {
  isolatedPath = await mkdtemp(join(tmpdir(), 'devly-no-codex-'))
  // Only the child Electron environment changes; do not modify the developer's PATH.
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = isolatedPath
  const probe = spawnSync('codex', ['--version'], { env, timeout: 1000 })
  assert.equal(probe.error?.code, 'ENOENT', 'Codex must actually be unavailable in this test')
}
let application
try {
  application = await electron.launch({
    args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
    executablePath: process.env.DEVLY_EXECUTABLE || undefined,
    env,
    timeout: 30000,
  })
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: '今天想完成什么？' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.nav-item')?.disabled)
  const info = await page.evaluate(async () => {
    const result = await window.devly.getEnvironment()
    if (!result.ok) throw new Error(result.error.message)
    return result.data
  })
  assert.ok(info.electron)
  assert.ok(info.git === null || typeof info.git === 'string')
  assert.equal(info.codex, null, 'normal startup must not probe the optional Codex engine')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  const events = await page.evaluate(async () => {
    const received = []
    const errors = []
    const stop = window.devly.onEnvironmentChecked(
      (event) => received.push(event),
      (error) => errors.push(error),
    )
    await window.devly.getEnvironment()
    await new Promise((resolve) => setTimeout(resolve, 100))
    stop()
    const before = received.length
    await window.devly.getEnvironment()
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { before, after: received.length, errors, type: received[0]?.type }
  })
  assert.ok(events.before > 0, 'real IPC event should reach its owner')
  assert.equal(events.before, events.after, 'cleanup must stop callbacks immediately')
  assert.equal(events.type, 'environment.checked')
  assert.deepEqual(events.errors, [])
  assert.equal(
    await page
      .locator('.environment-section, .milestone, .statusbar, .version-tag, .local-badge')
      .count(),
    0,
  )
  assert.equal(await page.getByRole('button', { name: '查看 AI 组件' }).count(), 0)
  assert.equal(await page.getByRole('textbox', { name: '任务输入' }).isEditable(), true)
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/workspace-empty.png' })
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await page.getByRole('button', { name: '选择项目', exact: true }).click()
  assert.equal(await page.locator('.project-item').count(), 0)
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('B01 dialog failure')
    }
  })
  const failure = await page.evaluate(() => window.devly.openProject())
  assert.equal(failure.ok, false)
  assert.equal(failure.error.code, 'INTERNAL_ERROR')
  assert.ok(!JSON.stringify(failure).includes('B01 dialog failure'))
  await page.getByRole('button', { name: '选择项目', exact: true }).click()
  await page.getByText('桌面操作失败，请重试', { exact: false }).waitFor()
  const cwd = process.cwd()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, cwd)
  await page.getByRole('button', { name: '选择项目', exact: true }).click()
  await page.locator('.project-item').getByText(basename(cwd), { exact: true }).waitFor()
  await page.getByText('桌面操作失败，请重试', { exact: false }).waitFor({ state: 'hidden' })
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/workspace.png' })
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  await page.getByRole('button', { name: '添加供应商', exact: true }).click()
  await page.getByRole('heading', { name: '模型供应商', exact: true }).waitFor()
  await page.getByRole('button', { name: '添加供应商', exact: true }).waitFor()
  const settingsGroups = page.getByRole('navigation', { name: '设置分组', exact: true })
  await expect(settingsGroups.getByRole('button')).toHaveCount(5)
  await settingsGroups.getByRole('button', { name: '默认模型', exact: true }).click()
  await expect(page.getByRole('heading', { name: '默认模型', exact: true })).toBeInViewport()
  await page.getByRole('textbox', { name: '默认模型', exact: true }).fill('unsaved-group-draft')
  await settingsGroups.getByRole('button', { name: '外观', exact: true }).click()
  await expect(page.getByRole('heading', { name: '外观', exact: true })).toBeInViewport()
  await settingsGroups.getByRole('button', { name: '默认模型', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '默认模型', exact: true })).toHaveValue(
    'unsaved-group-draft',
  )
  await settingsGroups.getByRole('button', { name: '模型供应商', exact: true }).click()
  await expect(
    settingsGroups.getByRole('button', { name: '模型供应商', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: '模型供应商', exact: true })).toBeInViewport()
  await page.screenshot({ path: 'output/settings-groups.png' })
  assert.equal(await page.locator('input[type=password]').count(), 0)
  assert.equal(await page.getByRole('button', { name: /登录|安装 Codex|连接测试/ }).count(), 0)
  assert.equal(
    await page
      .getByRole('button', { name: '开发者选项', exact: true })
      .getAttribute('aria-expanded'),
    'false',
  )
  assert.equal(await page.getByRole('button', { name: '重新检查' }).count(), 0)
  await page.screenshot({
    path: noCodex ? 'output/providers-no-codex.png' : 'output/providers.png',
  })
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(960, 680),
  )
  await page.waitForFunction(() => window.innerWidth === 960)
  assert.equal(
    await page
      .locator('.settings-page')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
  )
  await page.screenshot({ path: 'output/providers-compact.png' })
  await page.getByRole('button', { name: '添加供应商', exact: true }).click()
  const viewport = page.locator('.main-scroll-area > [data-slot="scroll-area-viewport"]')
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  const fixedPosition = await page.evaluate(() => ({
    header: document.querySelector('.topbar').getBoundingClientRect().top,
    sidebar: document.querySelector('.sidebar').getBoundingClientRect().top,
  }))
  const region = await viewport.boundingBox()
  await page.mouse.move(region.x + region.width - 30, region.y + region.height / 2)
  await page.mouse.wheel(0, 500)
  await page.waitForFunction(
    () =>
      document.querySelector('.main-scroll-area [data-slot="scroll-area-viewport"]').scrollTop >
      100,
  )
  assert.deepEqual(
    await page.evaluate(() => ({
      header: document.querySelector('.topbar').getBoundingClientRect().top,
      sidebar: document.querySelector('.sidebar').getBoundingClientRect().top,
    })),
    fixedPosition,
    'header and sidebar stay fixed while content scrolls',
  )
  await page.getByRole('combobox', { name: '主题', exact: true }).click()
  await page.keyboard.press('Escape')
  const scrollBounds = await page.evaluate(() => ({
    rootHeight: document.scrollingElement.scrollHeight,
    rootClient: document.scrollingElement.clientHeight,
    rootWidth: document.scrollingElement.scrollWidth,
    width: innerWidth,
    top: document.scrollingElement.scrollTop,
    scrollbars: document.querySelectorAll('.main-scroll-area [data-slot="scroll-area-scrollbar"]')
      .length,
  }))
  assert.ok(scrollBounds.rootHeight <= scrollBounds.rootClient + 1, JSON.stringify(scrollBounds))
  assert.equal(scrollBounds.rootWidth, scrollBounds.width)
  assert.equal(scrollBounds.top, 0)
  assert.equal(scrollBounds.scrollbars, 1)
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await page.getByRole('button', { name: '开发者选项', exact: true }).waitFor({ state: 'visible' })
  assert.ok(await page.getByRole('button', { name: '开发者选项', exact: true }).isVisible())
  const footer = await page.getByRole('button', { name: '开发者选项', exact: true }).boundingBox()
  assert.ok(
    footer.y + footer.height <= region.y + region.height + 1,
    'the final settings control must be reachable',
  )
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: 'output/settings-scrollarea-compact.png' })
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  assert.equal(
    await page
      .locator('.task-page')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    false,
  )
  await page.screenshot({ path: 'output/workspace-compact.png' })
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 960),
  )
  await page.waitForFunction(() => window.innerWidth === 1440)
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.getByRole('heading', { name: '模型供应商', exact: true }).waitFor()
  await page.getByText('开发者选项', { exact: true }).click()
  await page.getByRole('button', { name: '重新检查' }).click()
  await page.waitForFunction(() => !document.querySelector('.environment-section button')?.disabled)
  assert.ok((await page.locator('.environment-grid').textContent()).includes(info.electron))
  await page.getByRole('button', { name: '查看 AI 组件', exact: true }).click()
  await page.getByText('chore: initialize Devly workspace', { exact: true }).waitFor()
  await page
    .getByText('这是一条组件预览消息。真实的模型对话、审批和代码修改尚未接入。', { exact: true })
    .waitFor()
  await page.screenshot({ path: 'output/ai-elements.png' })
  await page
    .getByText('chore: initialize Devly workspace', { exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/commit.png' })
  await page.getByRole('button', { name: '关闭预览' }).click()
  await page.getByRole('heading', { name: '模型供应商', exact: true }).waitFor()
  await page.getByRole('button', { name: '返回工作台', exact: true }).click()
  await page.getByRole('heading', { name: '今天想完成什么？' }).waitFor()
  await page.locator('.project-item').getByText(basename(cwd), { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '发送消息' }).isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        passed: [
          'Electron window',
          'minimal task workspace without engineering panels',
          'five settings groups, navigation and unsaved preference draft retained',
          'workspace and settings fit compact viewport',
          'single ScrollArea viewport, fixed chrome and reachable settings footer',
          'Model selector and sidebar settings navigation',
          'concise unconfigured model state',
          'developer diagnostics folded away from the task workspace',
          ...(noCodex ? ['startup and Provider access without Codex or Git on PATH'] : []),
          'preload IPC',
          'owned event delivery and unsubscribe cleanup',
          'real environment checks',
          'project path validation',
          'renderer isolation',
          'original AI Elements rendering',
          'environment refresh',
          'project selection cancel and error handling',
          'preview navigation preserves project state',
        ],
        environment: info,
      },
      null,
      2,
    ),
  )
} finally {
  await application?.close()
  if (isolatedPath) await rm(isolatedPath, { recursive: true, force: true })
  await rm(userData, { recursive: true, force: true })
}
