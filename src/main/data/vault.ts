import { mkdir, writeFile, readFile, rename, unlink, readdir, chmod } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { entityId } from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'

export interface Encryption {
  available(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}
export class CredentialVault {
  constructor(
    private root: string,
    private encryption: Encryption,
  ) {}
  available(): boolean {
    return this.encryption.available()
  }
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await chmod(this.root, 0o700)
  }
  async put(secret: string): Promise<string> {
    if (!this.available()) throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
    if (!secret || Buffer.byteLength(secret) > 8192 || /[\r\n\0]/.test(secret))
      throw new ContractError(failure('INVALID_REQUEST'))
    const id = randomUUID()
    const temporary = join(this.root, `${id}.tmp`)
    try {
      const encrypted = this.encryption.encrypt(secret)
      await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600, flush: true })
      await rename(temporary, join(this.root, `${id}.key`))
      return id
    } catch {
      await unlink(temporary).catch(() => {})
      throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
    }
  }
  async read(id: string): Promise<string> {
    entityId.parse(id)
    if (!this.available()) throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
    try {
      return this.encryption.decrypt(await readFile(join(this.root, `${id}.key`)))
    } catch {
      throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
    }
  }
  async remove(id: string | null): Promise<void> {
    if (!id) return
    entityId.parse(id)
    await unlink(join(this.root, `${id}.key`)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
    })
  }
  async reconcile(references: string[]): Promise<void> {
    const keep = new Set(references.map((id) => `${entityId.parse(id)}.key`))
    for (const file of await readdir(this.root))
      if (/^[\da-f-]{36}\.(key|tmp)$/.test(file) && !keep.has(file))
        await unlink(join(this.root, file))
  }
}
