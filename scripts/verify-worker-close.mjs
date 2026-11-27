import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const executable = createRequire(import.meta.url)('electron')
for (let processIndex = 0; processIndex < 3; processIndex++) {
  const result = spawnSync(executable, ['scripts/worker-close.integration.mjs'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    timeout: 45000,
  })
  if (result.error) console.error(result.error.message)
  if (result.signal) console.error(`Worker-close fixture terminated by ${result.signal}`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('All 3 independent Electron processes exited normally; no failed run was retried')
