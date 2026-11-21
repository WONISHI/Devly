import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI } from '../shared/contracts'

const api: DesktopAPI = {
  getEnvironment: () => ipcRenderer.invoke('app:environment'),
  openProject: () => ipcRenderer.invoke('project:open'),
}
contextBridge.exposeInMainWorld('devly', api)
