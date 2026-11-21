import { _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const application = await electron.launch({
  args: process.env.DEVLY_EXECUTABLE ? [] : ['.'],
  executablePath: process.env.DEVLY_EXECUTABLE || undefined,
  env,
  timeout: 30000,
})
try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: '从一个想法， 到下一次提交。' }).waitFor()
  const info = await page.evaluate(() => window.devly.getEnvironment())
  assert.ok(info.electron)
  assert.ok(info.git)
  assert.ok(info.codex, 'Codex CLI must be detectable on this development machine')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await page.getByRole('button', { name: '重新检查' }).click()
  await page.getByRole('button', { name: '重新检查' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('.environment-section button')?.disabled)
  assert.ok((await page.locator('.environment-grid').textContent()).includes(info.electron))
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })
  await page.getByRole('button', { name: '打开本地项目' }).click()
  assert.equal(await page.locator('.project-item').count(), 0)
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('B01 dialog failure')
    }
  })
  await page.getByRole('button', { name: '打开本地项目' }).click()
  await page.getByText('B01 dialog failure', { exact: false }).waitFor()
  const cwd = process.cwd()
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, cwd)
  await page.getByRole('button', { name: '打开本地项目' }).click()
  await page.locator('.project-item').getByText('Devly', { exact: true }).waitFor()
  await mkdir('output', { recursive: true })
  await page.screenshot({ path: 'output/workspace.png' })
  await page.getByRole('button', { name: 'AI Elements 预览' }).click()
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
  await page.getByRole('heading', { name: '从一个想法， 到下一次提交。' }).waitFor()
  await page.locator('.project-item').getByText('Devly', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '对话功能待接入' }).isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        passed: [
          'Electron window',
          'preload IPC',
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
  await application.close()
}
