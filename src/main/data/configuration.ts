import { open, writeFile, rename, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { portableConfigSchema, type PortableConfig } from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import type { DatabaseClient } from './client'
export type ConfigPrompts = {
  configExport?(kind: 'configuration' | 'diagnostics'): Promise<string | null>
  configImport?(): Promise<string | null>
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const suspectedCredential =
  /(?:\bsk-[a-z\d_-]{12,}|\b(?:api[_-]?key|access[_-]?token|authorization)\s*[:=]\s*\S+)/i
export function safeConfiguration(value: unknown): PortableConfig {
  const config = portableConfigSchema.parse(value)
  if (suspectedCredential.test(JSON.stringify(config)))
    throw new ContractError(failure('INVALID_REQUEST'))
  return config
}
async function readConfiguration(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > 1048576) throw new Error('CONFIG_LIMIT')
    return await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}
async function exportFile(path: string, value: unknown) {
  const temporary = join(dirname(path), `.devly-export-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
      flush: true,
    })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
export class ConfigurationService {
  private previews = new Map<
    string,
    { owner: string; path: string; hash: string; expires: number; config: PortableConfig }
  >()
  private busy = false
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private prompts: ConfigPrompts,
  ) {}
  clearOwner(owner: string) {
    for (const [id, value] of this.previews) if (value.owner === owner) this.previews.delete(id)
  }
  async execute(
    operation: string,
    args: Record<string, unknown>,
    owner: string,
    active: () => boolean,
  ) {
    if (this.busy) throw new ContractError(failure('LIMIT_EXCEEDED'))
    this.busy = true
    try {
      if (operation === 'config.import.inspect') {
        const path = await this.prompts.configImport?.()
        if (!path) return null
        if (!active()) throw new ContractError(failure('FORBIDDEN'))
        const raw = await readConfiguration(path),
          config = safeConfiguration(JSON.parse(raw)),
          previewId = randomUUID()
        for (const [id, value] of this.previews)
          if (value.expires < Date.now() || value.owner === owner) this.previews.delete(id)
        if (this.previews.size >= 8) throw new ContractError(failure('LIMIT_EXCEEDED'))
        this.previews.set(previewId, {
          owner,
          path,
          hash: digest(raw),
          expires: Date.now() + 300000,
          config,
        })
        return {
          previewId,
          theme: config.settings.theme,
          projectPermission: config.settings.projectPermission,
          maxTokens: config.settings.maxTokens,
          maxCost: config.settings.maxCost,
          providers: config.providers.map((p) => ({
            name: p.name,
            protocol: p.protocol,
            host: new URL(p.baseUrl).host,
            model: p.model,
          })),
        }
      }
      if (operation === 'config.import.apply') {
        const value = this.previews.get(String(args.previewId))
        if (!value || value.owner !== owner || value.expires < Date.now() || !active())
          throw new ContractError(failure('INVALID_REQUEST'))
        if (digest(await readConfiguration(value.path)) !== value.hash)
          throw new ContractError(failure('INVALID_REQUEST'))
        const result = await this.database.execute('internal.config.import', value.config)
        this.previews.delete(String(args.previewId))
        return result
      }
      const path = await this.prompts.configExport?.(
        operation === 'diagnostics.export' ? 'diagnostics' : 'configuration',
      )
      if (!path) return { saved: false }
      if (!active()) throw new ContractError(failure('FORBIDDEN'))
      const value = await this.database.execute(
        operation === 'diagnostics.export' ? 'internal.diagnostics' : 'internal.config.export',
        {},
      )
      await exportFile(path, operation === 'diagnostics.export' ? value : safeConfiguration(value))
      return { saved: true }
    } catch (error) {
      if (error instanceof ContractError) throw error
      throw new ContractError(failure('INVALID_REQUEST'))
    } finally {
      this.busy = false
    }
  }
}
