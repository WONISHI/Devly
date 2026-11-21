import { readdir, readFile, realpath, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = JSON.parse(await readFile('package.json', 'utf8'))
const readPackage = async (path) => JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
const licenseOf = (pkg) =>
  typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'UNKNOWN'
const repositoryOf = (pkg) =>
  typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || ''
const direct = []
for (const section of ['dependencies', 'devDependencies']) {
  for (const [name, range] of Object.entries(root[section])) {
    const pkg = await readPackage(join('node_modules', name))
    direct.push({
      name,
      range,
      version: pkg.version,
      scope: section,
      license: licenseOf(pkg),
      repository: repositoryOf(pkg),
      engines: pkg.engines || {},
      peerDependencies: pkg.peerDependencies || {},
    })
  }
}
const installed = new Map()
const visited = new Set()
async function inspect(path) {
  let canonical
  try {
    canonical = await realpath(path)
  } catch {
    return
  }
  if (visited.has(canonical)) return
  visited.add(canonical)
  let pkg
  try {
    pkg = await readPackage(path)
  } catch {
    return
  }
  const notices = (await readdir(path)).filter((file) =>
    /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file),
  )
  installed.set(`${pkg.name}@${pkg.version}`, {
    name: pkg.name,
    version: pkg.version,
    license: licenseOf(pkg),
    repository: repositoryOf(pkg),
    noticeFiles: notices.sort(),
  })
}
for (const entry of await readdir('node_modules/.pnpm')) {
  const base = join('node_modules/.pnpm', entry, 'node_modules')
  let names
  try {
    names = await readdir(base)
  } catch {
    continue
  }
  for (const name of names) {
    if (name.startsWith('@')) {
      for (const child of await readdir(join(base, name))) await inspect(join(base, name, child))
    } else {
      await inspect(join(base, name))
    }
  }
}
const packages = [...installed.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'),
)
const licenseCounts = {}
for (const pkg of packages) licenseCounts[pkg.license] = (licenseCounts[pkg.license] || 0) + 1
const report = {
  scope:
    'Currently installed packages on this host, including development dependencies; not a shipped-binary SBOM or a complete cross-platform lockfile inventory.',
  platform: `${process.platform}-${process.arch}`,
  direct: direct.sort((a, b) => a.name.localeCompare(b.name, 'en')),
  licenseCounts,
  packages,
}
await mkdir('.cache', { recursive: true })
await writeFile('.cache/dependency-inventory.json', JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      direct: direct.length,
      installed: packages.length,
      licenseCounts,
      unknown: packages
        .filter((pkg) => pkg.license === 'UNKNOWN')
        .map((pkg) => `${pkg.name}@${pkg.version}`),
      report: '.cache/dependency-inventory.json',
    },
    null,
    2,
  ),
)
