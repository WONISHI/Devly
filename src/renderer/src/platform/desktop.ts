import type { DesktopAPI } from '@shared/contracts'

export class DesktopUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DesktopUnavailableError'
  }
}

export const desktop = {
  getEnvironment: (): ReturnType<DesktopAPI['getEnvironment']> => {
    if (!window.devly)
      return Promise.reject(new DesktopUnavailableError('请在 Electron 桌面应用中查看本机环境'))
    return window.devly.getEnvironment()
  },
  openProject: (): ReturnType<DesktopAPI['openProject']> => {
    if (!window.devly) return Promise.reject(new DesktopUnavailableError('请从桌面应用中打开项目'))
    return window.devly.openProject()
  },
}
