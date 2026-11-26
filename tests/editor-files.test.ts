import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EditorService } from '../src/main/editor/service'
import { editorArguments } from '../src/shared/editor-contracts'
import { parseStatus } from '../src/main/editor/git'
let root: string, project: string, service: EditorService
const projectId = randomUUID()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devly-editor-'))
  project = join(root, 'project')
  await mkdir(project)
  project = await realpath(project)
  const database = {
    execute: async <T>() =>
      [{ id: projectId, path: project, name: 'fixture', managed: false }] as T,
  }
  service = new EditorService(database)
})
afterEach(async () => {
  await service.close()
  await rm(root, { recursive: true, force: true })
})
const call = (operation: string, args: Record<string, unknown>, owner = 'owner') =>
  service.execute(
    operation,
    editorArguments[operation as keyof typeof editorArguments].parse(args),
    owner,
    () => true,
  )
it('lists one directory at a time, respects ignores, and preserves exact text versions', async () => {
  await mkdir(join(project, 'src'))
  await mkdir(join(project, 'node_modules'))
  await writeFile(join(project, '.gitignore'), 'ignored.txt\n')
  await writeFile(join(project, 'ignored.txt'), 'ignored')
  await writeFile(join(project, 'src/a.ts'), '\ufeffconst answer = 1\r\n')
  const page = (await call('editor.list', { projectId, path: '.' })) as {
    entries: { path: string }[]
  }
  expect(page.entries.map((item) => item.path)).toEqual(['.gitignore', 'src'])
  const doc = (await call('editor.read', { projectId, path: 'src/a.ts' })) as {
    text: string
    version: string
    status: string
  }
  expect(doc.status).toBe('text')
  expect(doc.text).toBe('\ufeffconst answer = 1\r\n')
  expect(doc.version).toHaveLength(64)
})
it('reports missing, binary, large, invalid encoding and forbidden files without returning their content', async () => {
  await writeFile(join(project, 'binary.bin'), Buffer.from([0, 1, 2]))
  await writeFile(join(project, 'large.txt'), 'x'.repeat(262145))
  await writeFile(join(project, 'bad.txt'), Buffer.from([255]))
  await writeFile(join(root, 'outside.txt'), 'outside')
  await symlink(join(root, 'outside.txt'), join(project, 'alias.txt'))
  for (const [path, status] of [
    ['gone.ts', 'missing'],
    ['binary.bin', 'binary'],
    ['large.txt', 'too_large'],
    ['bad.txt', 'encoding'],
    ['../outside.txt', 'denied'],
    ['alias.txt', 'denied'],
    ['.env', 'denied'],
  ]) {
    expect(await call('editor.read', { projectId, path })).toMatchObject({
      status,
      text: null,
      version: null,
    })
  }
  await expect(
    call('editor.read', { projectId: randomUUID(), path: 'binary.bin' }),
  ).rejects.toMatchObject({ info: { code: 'PROJECT_UNAVAILABLE' } })
})
it('observes expanded directories, refreshes after outside edits and deletion, and scopes watch cleanup', async () => {
  await mkdir(join(project, 'src'))
  const watchId = randomUUID(),
    args = { projectId, watchId, paths: ['src'] }
  const before = (await call('editor.observe', args)) as { revision: number; watching: number }
  expect(before.watching).toBe(2)
  await writeFile(join(project, 'src/new.txt'), 'external')
  await expect
    .poll(async () => ((await call('editor.observe', args)) as { revision: number }).revision, {
      timeout: 3000,
    })
    .toBeGreaterThan(before.revision)
  await rm(join(project, 'src'), { recursive: true })
  expect(await call('editor.observe', args)).toMatchObject({ degraded: true })
  await expect(call('editor.observe', args, 'wrong-owner')).rejects.toMatchObject({
    info: { code: 'FORBIDDEN' },
  })
  expect(await call('editor.release', { watchId }, 'wrong-owner')).toEqual({ removed: false })
  expect(await call('editor.release', { watchId })).toEqual({ removed: true })
})
it('does not recreate a released watch when its earlier setup arrives late', async () => {
  const watchId = randomUUID()
  const settingUp = call('editor.observe', { projectId, watchId, paths: [] })
  await call('editor.release', { watchId })
  await expect(settingUp).rejects.toMatchObject({ info: { code: 'FORBIDDEN' } })
  expect(await call('editor.release', { watchId })).toEqual({ removed: false })
})
it('parses NUL Git status including rename paths, whitespace and unmerged records', () => {
  expect(
    parseStatus(
      Buffer.from('R  new name.ts\0old name.ts\0?? new.txt\0 D removed.ts\0UU merge.ts\0'),
    ),
  ).toEqual([
    { path: 'new name.ts', oldPath: 'old name.ts', status: 'R ', kind: 'renamed' },
    { path: 'new.txt', oldPath: null, status: '??', kind: 'added' },
    { path: 'removed.ts', oldPath: null, status: ' D', kind: 'deleted' },
    { path: 'merge.ts', oldPath: null, status: 'UU', kind: 'unmerged' },
  ])
})
