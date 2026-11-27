import { lstat, realpath, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import type { DatabaseClient } from '../data/client'
import type { RecentProject } from '../../shared/data-contracts'
import { skillPath, skillSelection, type SkillInfo } from '../../shared/extension-contracts'
import { ReadOnlyToolbox, ToolFailure } from '../agent/tools'
import { ContractError, failure } from '../../shared/contracts'
import type { ProjectGuidance } from './context'
export const skillResourceRequest = z
  .object({
    skill: skillPath,
    file: z.string().min(1).max(1000),
    startLine: z.number().int().min(1).default(1),
    endLine: z.number().int().min(1).max(100000).default(200),
  })
  .strict()
  .refine((args) => args.endLine >= args.startLine && args.endLine - args.startLine < 300)
export const skillResourceTool = {
  name: 'read_skill_resource',
  description:
    'Read a project-relative resource from an explicitly enabled Skill directory. Never executes scripts; absolute paths, symlinks, secrets and traversal are denied.',
  parameters: z.toJSONSchema(skillResourceRequest) as Record<string, unknown>,
}
const roots = ['.agents/skills', '.claude/skills', '.devly/skills']
export class SkillService {
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  private async project(projectId: string) {
    const project = (await this.database.execute<RecentProject[]>('projects.list', {})).find(
      (p) => p.id === projectId && !p.managed,
    )
    if (!project || (await realpath(project.path).catch(() => null)) !== project.path)
      throw new ToolFailure('PROJECT_UNAVAILABLE')
    return project.path
  }
  private async toolbox(projectId: string, path: string, signal: AbortSignal, secret = '') {
    skillPath.parse(path)
    const root = await this.project(projectId)
    let cursor = root
    for (const part of path.split('/').slice(0, -1)) {
      cursor = join(cursor, part)
      const info = await lstat(cursor)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new ToolFailure('SYMLINK_DENIED')
    }
    return ReadOnlyToolbox.create(cursor, signal, secret)
  }
  async read(projectId: string, path: string, signal = new AbortController().signal, secret = '') {
    const toolbox = await this.toolbox(projectId, path, signal, secret),
      doc = await toolbox.document('SKILL.md')
    if (doc.text === null || !doc.version || Buffer.byteLength(doc.text) > 16384)
      throw new ToolFailure('SKILL_LIMIT')
    const text = doc.text,
      front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1] ?? ''
    const value = (key: string) =>
      new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.replace(/^['"]|['"]$/g, '')
    return {
      path,
      name: (value('name') ?? dirname(path).split('/').at(-1)!).slice(0, 100),
      description: (value('description') ?? '本地项目 Skill').slice(0, 500),
      hash: doc.version,
      content: text,
    }
  }
  async selected(projectId: string) {
    return this.database.execute<z.infer<typeof skillSelection>[]>('internal.skills.get', {
      projectId,
    })
  }
  async discover(projectId: string): Promise<SkillInfo[]> {
    const root = await this.project(projectId),
      selected = await this.selected(projectId),
      items: SkillInfo[] = []
    for (const source of roots) {
      let names: string[] = []
      try {
        let cursor = root
        for (const part of source.split('/')) {
          cursor = join(cursor, part)
          const stat = await lstat(cursor)
          if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE')
        }
        names = (await readdir(join(root, source))).sort().slice(0, 32)
      } catch {
        continue
      }
      for (const name of names) {
        const path = `${source}/${name}/SKILL.md`
        if (!skillPath.safeParse(path).success) continue
        try {
          const item = await this.read(projectId, path),
            saved = selected.find((s) => s.path === path)
          items.push({ ...item, enabled: !!saved, changed: !!saved && saved.hash !== item.hash })
        } catch {
          /* Unreadable or protected candidates never become executable guidance. */
        }
        if (items.length >= 32) return items
      }
    }
    return items
  }
  async select(projectId: string, entries: z.infer<typeof skillSelection>[]) {
    for (const entry of entries) {
      const actual = await this.read(projectId, entry.path)
      if (actual.hash !== entry.hash)
        throw new ContractError({
          ...failure('INVALID_REQUEST'),
          message: 'Skill 内容已变化，请重新扫描和查看后再启用',
        })
    }
    await this.database.execute('internal.skills.set', { projectId, entries })
    return { saved: true }
  }
  async guidance(projectId: string, signal: AbortSignal, secret = ''): Promise<ProjectGuidance[]> {
    const entries = await this.selected(projectId),
      records: ProjectGuidance[] = []
    for (const entry of entries) {
      try {
        const item = await this.read(projectId, entry.path, signal, secret)
        if (item.hash !== entry.hash) throw new Error('CHANGED')
        records.push({ kind: 'skill', path: item.path, scope: '.', text: item.content })
      } catch {
        throw new ContractError({
          ...failure('INVALID_REQUEST'),
          message: '已启用的 Skill 已变化或不可读，请到设置 → Skills 重新查看启用，或移除记录',
        })
      }
    }
    return records
  }
  async resource(projectId: string, input: string, signal: AbortSignal, secret = '') {
    let raw: unknown
    try {
      raw = JSON.parse(input)
    } catch {
      throw new ToolFailure('INVALID_JSON')
    }
    const args = skillResourceRequest.safeParse(raw)
    if (!args.success) throw new ToolFailure('INVALID_ARGUMENTS')
    const selection = (await this.selected(projectId)).find((s) => s.path === args.data.skill)
    if (!selection) throw new ToolFailure('SKILL_NOT_ENABLED')
    const skill = await this.read(projectId, selection.path, signal, secret)
    if (skill.hash !== selection.hash) throw new ToolFailure('SKILL_CHANGED')
    const toolbox = await this.toolbox(projectId, selection.path, signal, secret)
    return {
      ...(await toolbox.read(
        args.data.file,
        args.data.startLine,
        args.data.endLine - args.data.startLine + 1,
      )),
      skill: selection.path,
      source: 'user-enabled-skill-resource',
    }
  }
}
