import { app, BrowserWindow, dialog, ipcMain, nativeImage, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import { basename, join, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import log from 'electron-log/main'
import { IPC, projectPathSchema, ContractError, failure } from '../shared/contracts'
import { RequestRouter } from './request-router'
import { DatabaseClient } from './data/client'
import { CredentialVault } from './data/vault'
import { LocalDataService } from './data/service'
import { promptCredential } from './data/native-credential'

const exec = promisify(execFile)
const here = fileURLToPath(new URL('.', import.meta.url))
const appIconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(app.getAppPath(), 'build/icon.png')
let mainWindow: BrowserWindow | null = null

app.setName('Devly')
if (process.env.DEVLY_USER_DATA_DIR)
  app.setPath('userData', resolve(process.env.DEVLY_USER_DATA_DIR))
const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})
let database: DatabaseClient | undefined
let localData: LocalDataService | undefined

async function version(command: string): Promise<string | null> {
  try {
    const result = await exec(command, ['--version'], { timeout: 5000, maxBuffer: 65536 })
    return result.stdout.trim().split('\n')[0]
  } catch {
    return null
  }
}

let documentGeneration = 0
const router = new RequestRouter({
  environment: async () => {
    const git = await version('git')
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      git,
      // Reserved v1 field for optional engine diagnostics; startup never probes Codex.
      codex: null,
    }
  },
  openProject: async (isActive) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '打开项目',
    })
    if (result.canceled || !result.filePaths[0]) return null
    if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
    const path = await realpath(projectPathSchema.parse(result.filePaths[0]))
    if (!(await stat(path)).isDirectory()) throw new Error('Expected directory')
    if (!database || !localData) throw new ContractError(failure('STORAGE_UNAVAILABLE'))
    await database.execute('internal.project.upsert', { path })
    return { path, name: basename(path) }
  },
  clearOwner: (owner) => localData?.clearOwner(owner),
  data: (payload, isActive, owner) => {
    if (!localData) throw new ContractError(failure('STORAGE_UNAVAILABLE'))
    return localData.execute(payload, isActive, owner)
  },
})
function registerIPC(): void {
  ipcMain.handle(IPC.request, (event, raw: unknown) => {
    const contents = mainWindow?.webContents
    const generation = documentGeneration
    const frame = event.senderFrame
    const isActive = (): boolean =>
      !!contents &&
      !contents.isDestroyed() &&
      mainWindow?.webContents === contents &&
      event.sender === contents &&
      !!frame &&
      !frame.detached &&
      frame === contents.mainFrame &&
      generation === documentGeneration
    const owner = isActive() ? `${contents!.id}:${generation}` : null
    return router.handle(raw, owner, isActive, (message) => {
      if (isActive()) contents!.send(IPC.event, message)
    })
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
    backgroundColor: '#1c1d1f',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 10 } }
      : {}),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const contents = mainWindow.webContents
  const clearDocument = (): void => {
    router.clearOwner(`${contents.id}:${documentGeneration}`)
    documentGeneration += 1
  }
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) clearDocument()
  })
  contents.on('render-process-gone', clearDocument)
  contents.on('destroyed', clearDocument)
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
  .then(async () => {
    if (!ownsInstance) return
    if (process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(appIconPath))
    }
    app.setAppLogsPath(join(app.getPath('userData'), 'logs'))
    log.initialize()
    registerIPC()
    try {
      const root = join(app.getPath('userData'), 'storage')
      database = new DatabaseClient(root)
      const vault = new CredentialVault(join(root, 'credentials'), {
        available: () =>
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== 'linux' ||
            !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())),
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value),
      })
      localData = new LocalDataService(database, vault, {
        credential: promptCredential,
        export: async () => {
          const selected = await dialog.showSaveDialog(mainWindow!, {
            title: '导出设置',
            defaultPath: join(app.getPath('downloads'), 'devly-settings.json'),
            filters: [{ name: 'JSON', extensions: ['json'] }],
          })
          return selected.canceled || !selected.filePath ? null : selected.filePath
        },
        file: async () => {
          const selected = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            title: '导入日志或附件',
          })
          return selected.canceled || !selected.filePaths[0]
            ? null
            : await realpath(selected.filePaths[0])
        },
      })
      await localData.initialize()
    } catch {
      localData = undefined
      log.error('Local storage initialization failed')
    }
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    void error
    log.error('Application initialization failed')
    app.quit()
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitReady = false
app.on('before-quit', (event) => {
  if (quitReady || !database) return
  event.preventDefault()
  localData?.close()
  void database
    .close()
    .catch(() => log.error('Local storage shutdown failed'))
    .finally(() => {
      quitReady = true
      app.quit()
    })
})
