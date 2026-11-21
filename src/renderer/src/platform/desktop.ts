import {
  unwrapResult,
  type DesktopAPI,
  type EnvironmentInfo,
  type Project,
} from '@shared/contracts'

export class DesktopUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DesktopUnavailableError'
  }
}

import type { DataArgs, DataOperation, DataResult } from '@shared/data-contracts'

export const desktop = {
  getPlatform: (): string | null => window.devly?.platform ?? null,
  data: <K extends DataOperation>(operation: K, args: DataArgs<K>): Promise<DataResult<K>> => {
    if (!window.devly)
      return Promise.reject(new DesktopUnavailableError('请在桌面应用中使用本地数据'))
    return window.devly.data(operation, args).then(unwrapResult)
  },
  getEnvironment: (): Promise<EnvironmentInfo> => {
    if (!window.devly)
      return Promise.reject(new DesktopUnavailableError('请在 Electron 桌面应用中查看本机环境'))
    return window.devly.getEnvironment().then(unwrapResult)
  },
  openProject: (): Promise<Project | null> => {
    if (!window.devly) return Promise.reject(new DesktopUnavailableError('请从桌面应用中打开项目'))
    return window.devly.openProject().then(unwrapResult)
  },
  onEnvironmentChecked: (...args: Parameters<DesktopAPI['onEnvironmentChecked']>): (() => void) => {
    if (!window.devly) {
      args[1]({
        code: 'TRANSPORT_ERROR',
        message: '请在 Electron 桌面应用中订阅事件',
        retryable: false,
      })
      return () => {}
    }
    return window.devly.onEnvironmentChecked(...args)
  },
}
