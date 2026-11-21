import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises'

const root = 'src/renderer/src/assets/provider-icons'
const manifestPath = 'resources/vendor/provider-icons.json'
const licensePath = 'resources/vendor/lobe-icons.LICENSE'
const sha = (value) => createHash('sha256').update(value).digest('hex')
const archiveIntegrity =
  'iIZ7qd77hIx9fsbLysXmFYHYKT+cLgSuQVb8/hOfGH06clDpcSo+u7RWcyiBeq9MAcUai+4qvCQXqVDdVe8g3Q=='

// Explicit update only: download/extract the pinned npm archive to .cache/provider-icons first.
// Normal verification and CI stay offline and never rewrite assets/checksums.
if (process.argv.includes('--import')) {
  const archive = await readFile('.cache/provider-icons/package.tgz')
  assert.equal(createHash('sha512').update(archive).digest('base64'), archiveIntegrity)
  const source = '.cache/provider-icons/package/icons'
  const files = await readdir(source)
  const ids = files
    .filter((name) => /^[a-z0-9]+\.svg$/.test(name))
    .map((name) => name.slice(0, -4))
    .sort()
  const entries = []
  await mkdir(root, { recursive: true })
  for (const id of ids) {
    const upstream = files.includes(`${id}-color.svg`) ? `${id}-color.svg` : `${id}.svg`
    const contents = await readFile(`${source}/${upstream}`)
    const label = contents
      .toString()
      .match(/<title>(.*?)<\/title>/)?.[1]
      .replaceAll('&amp;', '&')
    assert.ok(label, `Missing title: ${upstream}`)
    const entry = { id, label, color: upstream.endsWith('-color.svg') }
    await writeFile(`${root}/${id}.svg`, contents)
    entries.push({ ...entry, upstream: `icons/${upstream}`, sha256: sha(contents) })
  }
  const catalog = entries.map(({ id, label, color }) => ({ id, label, color }))
  const json = (value) => JSON.stringify(value, null, 2) + '\n'
  await writeFile(`${root}/catalog.json`, json(catalog))
  await copyFile('.cache/provider-icons/LICENSE', licensePath)
  await writeFile(
    manifestPath,
    json({
      package: '@lobehub/icons-static-svg',
      version: '1.104.0',
      source: 'https://github.com/lobehub/lobe-icons',
      commit: '5c966bad55cda839d0db663e02a2df169003ff4e',
      tarball:
        'https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.104.0.tgz',
      integrity: `sha512-${archiveIntegrity}`,
      license: 'MIT',
      licenseSha256: sha(await readFile(licensePath)),
      catalogSha256: sha(await readFile(`${root}/catalog.json`)),
      icons: entries,
    }),
  )
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
assert.equal(sha(await readFile(licensePath)), manifest.licenseSha256, 'License changed')
assert.equal(sha(await readFile(`${root}/catalog.json`)), manifest.catalogSha256, 'Catalog changed')
const files = (await readdir(root)).filter((file) => file.endsWith('.svg')).sort()
assert.deepEqual(
  files,
  manifest.icons.map(({ id }) => `${id}.svg`).sort(),
  'Untracked/missing icons',
)
for (const icon of manifest.icons) {
  const source = await readFile(`${root}/${icon.id}.svg`, 'utf8')
  assert.equal(sha(source), icon.sha256, `Icon changed: ${icon.id}`)
  // Reject executable/external content before local assets reach an Electron renderer.
  assert.doesNotMatch(
    source,
    /<\s*(script|foreignObject|image|use)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\(\s*['"]?(?:https?:|\/\/)/i,
  )
}
console.log(`Verified ${manifest.icons.length} offline brand SVGs, catalog and MIT notice`)
