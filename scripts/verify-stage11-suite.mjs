import { spawnSync } from 'node:child_process'
const scripts = [
  'verify:preview-ui',
  'verify:browser-ui',
  'verify:stage11-ui',
  'verify:execution-ui',
  'verify:editor-ui',
  'verify:extensions-ui',
  'verify:stability-ui',
]
for (const script of scripts) {
  console.log(`[stage11-desktop] ${script}`)
  const result =
    process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `pnpm run ${script}`], {
          stdio: 'inherit',
          timeout: 180000,
        })
      : spawnSync('pnpm', ['run', script], { stdio: 'inherit', timeout: 180000 })
  if (result.error) console.error(result.error.message)
  if (result.signal) console.error('Desktop fixture terminated by ' + result.signal)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
