import { z } from 'zod'

export const projectPathSchema = z.string().min(1).max(8192)
export type Project = { path: string; name: string }
export type EnvironmentInfo = {
  appVersion: string
  electron: string
  node: string
  platform: string
  git: string | null
  codex: string | null
}
export interface DesktopAPI {
  getEnvironment(): Promise<EnvironmentInfo>
  openProject(): Promise<Project | null>
}
