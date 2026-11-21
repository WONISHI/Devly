import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['scripts/smoke-desktop.mjs'], {
  env: { ...process.env, DEVLY_SMOKE_NO_CODEX: '1' },
  stdio: 'inherit',
  timeout: 60000,
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
