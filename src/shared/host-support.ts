/** Runtime policy, not evidence that a target platform has been accepted. */
export function supportsHostExecution(platform: string | null): boolean {
  return platform === 'darwin'
}
export function hostExecutionNotice(platform: string | null): string {
  const name = platform === 'win32' ? 'Windows' : platform === 'linux' ? 'Linux' : '此平台'
  return `${name} 预览版尚未提供受隔离的项目写入、命令和交互终端；可使用普通聊天与只读 Agent。不会回退为无隔离执行。`
}
