import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { executeProjectCommand } from '../src/main/agent/command-executor'

// Native host-boundary checks are explicit; a skipped check is not platform acceptance.
it.skipIf(process.platform !== 'darwin' || process.env.DEVLY_VERIFY_HOST_EXECUTION !== '1')(
  'verifies macOS command output, denial, timeout and cancellation on the real host',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'devly-host-'))
    const project = join(root, 'project')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(project)
    await writeFile(join(root, 'outside.txt'), 'outside-fixture')
    try {
      const execute = (command: string, controller = new AbortController(), timeoutMs = 3000) =>
        executeProjectCommand(project, { command, timeoutMs }, controller.signal)
      const good = await execute('printf result; printf warning >&2; exit 3')
      expect(good).toMatchObject({
        stdout: 'result',
        stderr: 'warning',
        exitCode: 3,
        state: 'failed',
      })
      const denied = await execute('cat ../outside.txt')
      expect(denied.exitCode).not.toBe(0)
      expect(denied.stdout).not.toContain('outside-fixture')
      const { symlink } = await import('node:fs/promises')
      await symlink(join(root, 'outside.txt'), join(project, 'alias.txt'))
      expect((await execute('cat alias.txt')).stdout).not.toContain('outside-fixture')
      await writeFile(join(project, '.env'), 'secret-fixture')
      expect((await execute('cat .env')).stdout).not.toContain('secret-fixture')
      await mkdir(join(project, '.aWs'))
      await writeFile(join(project, '.aWs/config'), 'case-sensitive-secret-fixture')
      expect((await execute('cat .aWs/config')).stdout).not.toContain(
        'case-sensitive-secret-fixture',
      )
      expect((await execute('printf bad > ../outside.txt')).exitCode).not.toBe(0)
      expect(await readFile(join(root, 'outside.txt'), 'utf8')).toBe('outside-fixture')
      let contacted = false
      const server = createServer((_req, res) => {
        contacted = true
        res.end('unexpected')
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      try {
        const address = server.address() as { port: number }
        expect(
          (await execute(`/usr/bin/curl --silent --max-time 1 http://127.0.0.1:${address.port}`))
            .exitCode,
        ).not.toBe(0)
        expect(contacted).toBe(false)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
      await execute('printf safe > inside.txt')
      expect(await readFile(join(project, 'inside.txt'), 'utf8')).toBe('safe')
      expect((await execute('sleep 20', new AbortController(), 100)).state).toBe('timeout')
      expect((await execute('/usr/bin/yes output', new AbortController(), 3000)).state).toBe(
        'output_limit',
      )
      const chunks: string[] = []
      const stream = executeProjectCommand(
        project,
        {
          command:
            'printf "first\\n"; sleep 0.2; printf "sk-fixture-"; sleep 0.1; printf "secret-value\\n"',
        },
        new AbortController().signal,
        (_kind, text) => chunks.push(text),
        'sk-fixture-secret-value',
      )
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(chunks.join('')).toContain('first\n')
      const streamed = await stream
      expect(chunks.join('')).not.toContain('sk-fixture-secret-value')
      expect(streamed.stdout).toContain('[REDACTED]')
      const controller = new AbortController()
      const running = execute('(sleep 1; printf escaped > late.txt) & wait', controller)
      setTimeout(() => controller.abort(), 100)
      expect((await running).state).toBe('cancelled')
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await expect(readFile(join(project, 'late.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
