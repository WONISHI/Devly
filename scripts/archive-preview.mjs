// Package the current working tree, including uncommitted feature files, never git HEAD alone.
import { spawnSync } from 'node:child_process'
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  lstat,
  mkdtemp,
  rm,
  realpath,
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
if (!pkg.version.includes('-preview.')) throw Error('Explicit preview version required')
const output = resolve('release'),
  dmg = join(output, `Devly-${pkg.version}-mac-arm64.dmg`),
  source = join(output, `Devly-${pkg.version}-source.zip`),
  temporary = await mkdtemp(join(tmpdir(), 'devly-source-')),
  target = join(temporary, 'Devly-source')
const rootFiles = new Set([
  'README.md',
  'AGENTS.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'electron-builder.yml',
  'electron.vite.config.ts',
  'tsconfig.json',
  'vitest.config.ts',
  'eslint.config.js',
  'components.json',
  '.gitignore',
  '.prettierignore',
  '.prettierrc',
  '.prettierrc.json',
])
const directories = ['src/', 'docs/', 'scripts/', 'tests/', 'resources/', 'build/', '.github/']
const hash = async (path) => {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' })
  if (r.status !== 0) throw Error('Git inventory unavailable')
  return r.stdout
}
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
  .split('\0')
  .filter(Boolean)
  .filter((f) => rootFiles.has(f) || directories.some((d) => f.startsWith(d)))
try {
  await mkdir(target)
  for (const file of files) {
    const info = await lstat(file).catch(() => null)
    if (!info) continue
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      file
        .split('/')
        .some((p) => p === '..' || p === '.git' || p.startsWith('.env') || p === 'credentials') ||
      /\.(p12|pfx|key)$/i.test(file)
    )
      throw Error('Refusing unsafe source entry: ' + file)
    if (!(await realpath(file)).startsWith((await realpath('.')) + '/'))
      throw Error('Source escapes root')
    await mkdir(dirname(join(target, file)), { recursive: true })
    await copyFile(file, join(target, file))
  }
  const snapshot = {
    version: pkg.version,
    commit: git('rev-parse', 'HEAD').trim(),
    workingTreeDirty: !!git('status', '--porcelain').trim(),
    files: files.length,
    description:
      'Actual current working-tree source; ignored caches, userData and credentials excluded',
  }
  await writeFile(join(target, 'SOURCE-SNAPSHOT.json'), JSON.stringify(snapshot, null, 2))
  const zipped = spawnSync(
    '/usr/bin/ditto',
    ['-c', '-k', '--norsrc', '--noextattr', '--noqtn', '--keepParent', target, source],
    { stdio: 'inherit' },
  )
  if (zipped.status !== 0) throw Error('Source archive failed')
  const install = JSON.parse(await readFile('output/release-mac-install.json', 'utf8'))
  if (install.appVersion !== pkg.version)
    throw Error('Install evidence belongs to another app version')
  if (
    !install.dmgVerified ||
    !install.dmgMountedReadOnly ||
    !install.installedPathHasChineseAndSpaces
  )
    throw Error('Actual install evidence required')
  const artifacts = []
  for (const path of [dmg, source])
    artifacts.push({
      file: path.split('/').at(-1),
      bytes: (await lstat(path)).size,
      sha256: await hash(path),
    })
  const manifest = {
    version: pkg.version,
    date: '2026-11-27',
    channel: 'local_unsigned_preview',
    platform: 'darwin',
    arch: 'arm64',
    published: false,
    signature: 'unsigned',
    notarization: 'not_performed',
    windows: 'deferred_by_user_not_tested',
    source: snapshot,
    artifacts,
    macInstallEvidence: install,
    remaining: [
      'Windows execution isolation and two-platform acceptance',
      'Developer ID signing/notarization and Windows signing',
      'Responses/Anthropic and search real endpoints',
      'Maintained Electron/toolchain and unresolved license notices before public release',
    ],
  }
  await writeFile(
    join(output, `Devly-${pkg.version}-manifest.json`),
    JSON.stringify(manifest, null, 2),
  )
  await writeFile(
    join(output, `Devly-${pkg.version}-SHA256SUMS.txt`),
    artifacts.map((a) => `${a.sha256}  ${a.file}`).join('\n') + '\n',
  )
  console.log(
    JSON.stringify(
      {
        version: pkg.version,
        artifacts,
        sourceFiles: files.length,
        kind: manifest.channel,
        windows: manifest.windows,
      },
      null,
      2,
    ),
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
