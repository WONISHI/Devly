import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const result = spawnSync(
  createRequire(import.meta.url)('electron'),
  ['scripts/web.integration.mjs'],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', timeout: 120000 },
)
if (result.error) console.error(result.error.message)
if (result.signal) console.error(`Web fixture terminated by ${result.signal}`)
process.exit(result.status ?? 1)
