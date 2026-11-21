import { spawnSync } from 'node:child_process'

// Run the exact same checks locally and on every CI target. Stop on the first failure.
for (const script of [
  'typecheck',
  'lint',
  'format:check',
  'test',
  'check:docs',
  'verify:vendor',
  'build:bundle',
  'verify:data',
]) {
  console.log(`\n[check] ${script}`)
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm run ${script}`], {
          stdio: 'inherit',
        })
      : spawnSync('pnpm', ['run', script], { stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
