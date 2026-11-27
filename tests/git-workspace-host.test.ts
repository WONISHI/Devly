import { it, expect } from 'vitest'
import { mkdtemp, mkdir, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readGit } from '../src/main/editor/git'
import { GitService } from '../src/main/git/service'
import { randomUUID } from 'node:crypto'
const host = process.env.DEVLY_VERIFY_HOST_EXECUTION === '1' && process.platform === 'darwin'
it.skipIf(!host)(
  'reads actual Git in a canonical Chinese/space project with strict profile',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'devly-git-host-'))
    try {
      const path = join(root, '中文 项目')
      await mkdir(path)
      execFileSync('/usr/bin/git', ['-C', path, 'init', '-q'])
      const canonical = await realpath(path)
      await writeFile(join(path, 'file.txt'), 'fixture')
      await writeFile(join(path, '中文 文件.txt'), 'fixture')
      const staged = await readGit(
        canonical,
        canonical,
        ['add', '--pathspec-from-file=-', '--pathspec-file-nul'],
        1048576,
        true,
        'file.txt\0',
      )
      expect(staged.code, staged.error).toBe(0)
      const projectId = randomUUID()
      const service = new GitService({
        execute: async <T>() =>
          [{ id: projectId, path: canonical, name: 'fixture', managed: false }] as T,
      })
      expect(await service.execute('git.snapshot', { projectId }, () => true)).toMatchObject({
        available: true,
      })
      for (const args of [
        ['status', '--porcelain=v1', '-z'],
        ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--raw', '--no-abbrev', '-z'],
        ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '-z'],
      ])
        expect((await readGit(canonical, canonical, args)).code, args.join(' ')).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
