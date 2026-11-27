import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const result = spawnSync(
  createRequire(import.meta.url)('electron'),
  ['scripts/windows-restrictions.integration.mjs'],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', timeout: 60000 },
)
if (result.error) console.error(result.error.message)
if (result.signal) console.error(result.signal)
process.exit(result.status ?? 1)
