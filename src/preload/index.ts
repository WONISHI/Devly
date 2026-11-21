import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  ContractError,
  failure,
  type DesktopAPI,
  type OperationResult,
} from '../shared/contracts'
import { createDesktopClient } from './desktop-client'

const client = createDesktopClient(
  {
    invoke: (request) => ipcRenderer.invoke(IPC.request, request),
    listen: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, raw: unknown): void => listener(raw)
      ipcRenderer.on(IPC.event, wrapped)
      return () => {
        ipcRenderer.removeListener(IPC.event, wrapped)
      }
    },
  },
  () => crypto.randomUUID(),
)
async function result<T>(operation: () => Promise<T>): Promise<OperationResult<T>> {
  try {
    return { ok: true, data: await operation() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ContractError ? error.info : failure('INTERNAL_ERROR'),
    }
  }
}
const api: DesktopAPI = {
  platform: process.platform,
  data: (operation, args) => result(() => client.data(operation, args)),
  getEnvironment: () => result(client.getEnvironment),
  openProject: () => result(client.openProject),
  onEnvironmentChecked: client.onEnvironmentChecked,
}
contextBridge.exposeInMainWorld('devly', api)
