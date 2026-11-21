import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const result = spawnSync(require('electron'), ['scripts/native-smoke.cjs'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  timeout: 20000,
})
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
