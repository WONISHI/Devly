import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
if (process.platform !== 'darwin') {
  console.log(
    'SKIPPED editor native save/Git acceptance: current macOS boundary only; Windows remains T12',
  )
  process.exit(0)
}
const result = spawnSync(require('electron'), ['scripts/editor.integration.mjs'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  timeout: 90000,
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
