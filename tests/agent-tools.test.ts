import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadOnlyToolbox, readOnlyTools, redactToolText } from '../src/main/agent/tools'
import { assembleContext, compactToolContext } from '../src/main/agent/context'
import { defaultAgentLimits, agentLimitsSchema } from '../src/shared/agent-contracts'
import type { Message } from '../src/shared/provider-contracts'
let root: string, project: string, controller: AbortController, tools: ReadOnlyToolbox
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devly-tools-'))
  project = join(root, 'project')
  await mkdir(project)
  controller = new AbortController()
  tools = await ReadOnlyToolbox.create(project, controller.signal, 'fixture-active-credential')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const run = (name: string, args: unknown) => tools.execute(name, JSON.stringify(args))
describe('read-only registry and filesystem boundaries', () => {
  it('registers only three read-only tools and validates JSON, types and unknown properties', async () => {
    expect(readOnlyTools.map((t) => t.name)).toEqual(['list_files', 'read_file', 'search_text'])
    await expect(run('write_file', { path: 'a', content: 'bad' })).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
    })
    await expect(run('__proto__', {})).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' })
    await expect(tools.execute('read_file', '{"path":')).rejects.toMatchObject({
      code: 'INVALID_JSON',
    })
    for (const args of [
      { path: 'a', command: 'cat a' },
      { path: 'a', limit: -1 },
      { path: 'a', startLine: '1' },
    ])
      await expect(run('read_file', args)).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
  })
  it('paginates directory and line reads with exact project-relative paths', async () => {
    await writeFile(join(project, 'a.ts'), 'one\ntwo\nthree')
    await writeFile(join(project, 'b.ts'), 'four')
    expect(await run('list_files', { path: '.', limit: 1 })).toMatchObject({
      entries: [{ path: 'a.ts', type: 'file' }],
      nextOffset: 1,
      truncated: true,
    })
    expect(await run('list_files', { path: '.', offset: 1 })).toMatchObject({
      entries: [{ path: 'b.ts' }],
      nextOffset: null,
    })
    expect(await run('read_file', { path: 'a.ts', startLine: 2, limit: 1 })).toMatchObject({
      text: '2: two',
      startLine: 2,
      endLine: 2,
      nextLine: 3,
      truncated: true,
    })
  })
  it('rejects traversal, absolute and Windows paths plus symlinks to inside or outside the project', async () => {
    await writeFile(join(root, 'outside.txt'), 'outside')
    await writeFile(join(project, 'inside.txt'), 'inside')
    await symlink(join(root, 'outside.txt'), join(project, 'link'))
    await symlink(join(project, 'inside.txt'), join(project, 'inside-link'))
    await symlink(root, join(project, 'dir-link'))
    for (const path of [
      '../outside.txt',
      join(root, 'outside.txt'),
      'C:/outside.txt',
      'a\\b',
      'link',
      'inside-link',
      'dir-link/outside.txt',
    ])
      await expect(run('read_file', { path })).rejects.toBeDefined()
    expect(JSON.stringify(await run('list_files', {}))).not.toContain('link')
  })
  it('honors nested gitignore, fixed exclusions and sensitive file contents', async () => {
    await mkdir(join(project, 'src'))
    await mkdir(join(project, 'node_modules'))
    await writeFile(join(project, '.gitignore'), 'ignored*\n*.tmp\n!keep.tmp\n')
    await writeFile(join(project, 'src', '.gitignore'), 'hidden.ts\n')
    for (const name of ['ignored.ts', 'a.tmp', 'keep.tmp', '.env', 'credentials.json'])
      await writeFile(join(project, name), 'needle')
    await writeFile(join(project, 'src', 'hidden.ts'), 'needle')
    await writeFile(join(project, 'src', 'real.ts'), 'needle\nneedle')
    await writeFile(join(project, 'src', 'private.ts'), 'api_key = "very-private-secret-value"')
    await writeFile(join(project, 'active.txt'), 'fixture-active-credential')
    await writeFile(join(project, 'config.json'), '{"api_key":"private-json-credential"}')
    for (const path of [
      'ignored.ts',
      'a.tmp',
      '.env',
      'credentials.json',
      'node_modules/a',
      'src/hidden.ts',
    ])
      await expect(run('read_file', { path })).rejects.toBeDefined()
    for (const path of ['active.txt', 'src/private.ts', 'config.json'])
      await expect(run('read_file', { path })).rejects.toMatchObject({ code: 'SENSITIVE_CONTENT' })
    expect(await run('read_file', { path: 'keep.tmp' })).toMatchObject({ text: '1: needle' })
    const first = await run('search_text', { query: 'needle', limit: 1 })
    expect(first).toMatchObject({
      matches: [{ path: 'keep.tmp', line: 1 }],
      nextOffset: 1,
      truncated: true,
    })
    const second = await run('search_text', { query: 'needle', offset: 1, limit: 2 })
    expect(second).toMatchObject({
      matches: [
        { path: 'src/real.ts', line: 1 },
        { path: 'src/real.ts', line: 2 },
      ],
      truncated: false,
    })
  })
  it('rejects binary, invalid UTF8 and oversized files; bounds long-line output', async () => {
    await writeFile(join(project, 'binary'), Buffer.from([1, 0, 2]))
    await writeFile(join(project, 'bad-utf8'), Buffer.from([255, 254]))
    await writeFile(join(project, 'big'), 'x'.repeat(262145))
    await writeFile(join(project, 'line'), 'x'.repeat(15000))
    for (const [path, code] of [
      ['binary', 'BINARY_FILE'],
      ['bad-utf8', 'INVALID_UTF8'],
      ['big', 'FILE_TOO_LARGE'],
    ])
      await expect(run('read_file', { path })).rejects.toMatchObject({ code })
    expect(await run('read_file', { path: 'line' })).toMatchObject({
      truncated: true,
      nextLine: null,
    })
  })
  it('stops traversal and reads after cancellation', async () => {
    controller.abort()
    await expect(run('list_files', {})).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
describe('traceable context and redacted output', () => {
  it('orders scoped instructions and selected files while retaining the current request', async () => {
    await mkdir(join(project, 'src'))
    await writeFile(join(project, 'AGENTS.md'), 'root guidance')
    await writeFile(join(project, 'src', 'AGENTS.md'), 'nested guidance')
    await writeFile(join(project, 'src', 'a.ts'), 'const value = 1')
    const context = await assembleContext(
      tools,
      [],
      'Find the value',
      ['src/a.ts'],
      defaultAgentLimits,
      'fixture-active-credential',
    )
    expect(context.messages[0].role).toBe('system')
    expect(context.messages.at(-1)).toEqual({ role: 'user', content: 'Find the value' })
    expect(context.info.sources.map((s) => s.path)).toEqual([
      'Devly read-only policy',
      'last 0 messages',
      'AGENTS.md',
      'src/AGENTS.md',
      'src/a.ts',
    ])
    await expect(
      assembleContext(
        tools,
        [],
        'x'.repeat(40000),
        [],
        { ...defaultAgentLimits, contextChars: 4096 },
        '',
      ),
    ).rejects.toMatchObject({ code: 'CONTEXT_BUDGET' })
  })
  it('summarizes older history explicitly and compresses old tool bodies without losing IDs', async () => {
    const history: Message[] = Array.from({ length: 20 }, (_, i): Message =>
      i % 2
        ? { role: 'assistant', content: 'history ' + i }
        : { role: 'user', content: 'history ' + i },
    )
    const context = await assembleContext(tools, history, 'current', [], defaultAgentLimits, '')
    expect(context.info.summaries[0]).toContain('8 条')
    const messages: Message[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'a', name: 'read_file', arguments: '{}' }],
      },
      { role: 'tool', toolCallId: 'a', content: 'x'.repeat(7000) },
      { role: 'assistant', content: 'latest' },
    ]
    expect(compactToolContext(messages, 4096)).toContain('1 条工具输出')
    expect(messages[1]).toMatchObject({ role: 'tool', toolCallId: 'a' })
    expect(messages.at(-1)?.content).toBe('latest')
  })
  it('redacts protected keys and conventional secret shapes; strictly validates budget settings', () => {
    const safe = redactToolText(
      'fixture-active-credential password="private-value-123" sk-abcdefghijklmno',
      'fixture-active-credential',
    )
    for (const text of ['fixture-active-credential', 'private-value-123', 'sk-abcdefghijklmno'])
      expect(safe).not.toContain(text)
    expect(redactToolText('{"api_key":"private-json-credential"}')).toBe('{"api_key":"[REDACTED]"}')
    const encoded = [...'fixture-active-credential']
      .map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      .join('')
    expect(redactToolText(encoded, 'fixture-active-credential')).toBe(
      '[REDACTED encoded credential]',
    )
    expect(agentLimitsSchema.safeParse({ maxCalls: 0 }).success).toBe(false)
    expect(agentLimitsSchema.safeParse({ shell: true }).success).toBe(false)
  })
})
