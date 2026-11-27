// Mount a local DMG read-only, copy its app to an owned Chinese/spaced install directory, test, detach.
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
if (process.platform !== 'darwin') throw Error('Actual macOS required')
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const dmg = resolve(
    process.env.DEVLY_RELEASE_DMG ||
      process.argv[2] ||
      `release/Devly-${pkg.version}-mac-${process.arch}.dmg`,
  ),
  root = await mkdtemp(join(tmpdir(), 'Devly 安装验收 ')),
  mount = join(root, '只读磁盘'),
  install = join(root, 'Applications 中文 空格'),
  copy = join(install, 'Devly.app')
let attached = false
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(`${cmd} failed: ${result.status ?? result.signal}`)
}
try {
  await mkdir(mount)
  await mkdir(install)
  run('/usr/bin/hdiutil', ['verify', dmg])
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
  attached = true
  const names = await readdir(mount)
  if (!names.includes('Devly.app')) throw Error('DMG application missing')
  run('/usr/bin/ditto', [join(mount, 'Devly.app'), copy])
  await writeFile(join(copy, '.devly-stage12-owned-copy'), 'temporary installation fixture', {
    flag: 'wx',
  })
  run(process.execPath, ['scripts/smoke-release-mac.mjs'], {
    env: {
      ...process.env,
      DEVLY_EXECUTABLE: join(copy, 'Contents/MacOS/Devly'),
      DEVLY_RELEASE_COPY_ROOT: copy,
    },
    timeout: 180000,
  })
  const report = JSON.parse(await readFile('output/release-mac-install.json', 'utf8'))
  report.dmgVerified = true
  report.dmgMountedReadOnly = true
  report.installedPathHasChineseAndSpaces = true
  report.systemApplicationsModified = false
  await writeFile('output/release-mac-install.json', JSON.stringify(report, null, 2))
  console.log(
    'PASS actual DMG → copied application → first install/upgrade/native failure checks; system /Applications untouched',
  )
} finally {
  if (attached) run('/usr/bin/hdiutil', ['detach', mount])
  await rm(root, { recursive: true, force: true })
}
