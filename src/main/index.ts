import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import { basename, join } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import log from 'electron-log/main'
import { projectPathSchema, type EnvironmentInfo } from '../shared/contracts'

const exec = promisify(execFile)
const here = fileURLToPath(new URL('.', import.meta.url))
const appIconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(app.getAppPath(), 'build/icon.png')
let mainWindow: BrowserWindow | null = null

app.setName('Devly')

async function version(command: string): Promise<string | null> {
  try {
    const result = await exec(command, ['--version'], { timeout: 5000, maxBuffer: 65536 })
    return result.stdout.trim().split('\n')[0]
  } catch {
    return null
  }
}

function registerIPC(): void {
  const assertSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      throw new Error('Untrusted IPC sender')
    }
  }
  ipcMain.handle('app:environment', async (event): Promise<EnvironmentInfo> => {
    assertSender(event)
    const [git, codex] = await Promise.all([
      version('git'),
      version(process.env.DEVLY_CODEX_PATH || 'codex'),
    ])
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      git,
      codex,
    }
  })
  ipcMain.handle('project:open', async (event) => {
    assertSender(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '打开项目',
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = await realpath(projectPathSchema.parse(result.filePaths[0]))
    if (!(await stat(path)).isDirectory()) throw new Error('请选择项目目录')
    return { path, name: basename(path) }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    title: 'Devly',
    icon: appIconPath,
    backgroundColor: '#101113',
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(here, '../renderer/index.html'))
}

app
  .whenReady()
  .then(() => {
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(appIconPath))
    }
    log.initialize()
    registerIPC()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    log.error(error)
    app.quit()
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
