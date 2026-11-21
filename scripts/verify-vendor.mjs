import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { format, resolveConfig } from 'prettier'

const manifestPath = 'resources/vendor/ai-elements.json'
const commit = 'ca8be600bfd01b3131f9bf6134b51602a71f4374'
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
if (process.argv.includes('--refresh')) {
  const entries = [
    ...['commit', 'conversation', 'message', 'tool', 'code-block', 'model-selector'].map(
      (name) => ({
        upstream: `packages/elements/src/${name}.tsx`,
        local: `src/renderer/src/components/ai-elements/${name}.tsx`,
        formatted: false,
      }),
    ),
    ...[
      'avatar',
      'badge',
      'button',
      'button-group',
      'collapsible',
      'select',
      'separator',
      'tooltip',
      'input',
      'textarea',
      'label',
      'scroll-area',
      'dialog',
      'command',
    ].map((name) => ({
      upstream: `packages/shadcn-ui/components/ui/${name}.tsx`,
      local: `src/renderer/src/components/ui/${name}.tsx`,
      formatted: true,
    })),
    {
      upstream: 'LICENSE',
      local: 'src/renderer/src/components/ai-elements/LICENSE',
      formatted: false,
    },
  ]
  await mkdir('.cache/vendor', { recursive: true })
  for (const entry of entries) {
    const cachePath = `.cache/vendor/${commit}-${entry.upstream.replaceAll('/', '_')}`
    let original
    try {
      original = await readFile(cachePath, 'utf8')
    } catch {
      original = execFileSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--fail',
          '--location',
          '--retry',
          '2',
          '--retry-all-errors',
          '--max-time',
          '20',
          `https://raw.githubusercontent.com/vercel/ai-elements/${commit}/${entry.upstream}`,
        ],
        { encoding: 'utf8' },
      )
      await writeFile(cachePath, original)
    }
    let adapted = original
      .replaceAll('@repo/shadcn-ui/components/ui/', '@/components/ui/')
      .replaceAll('@repo/shadcn-ui/lib/utils', '@/lib/utils')
    if (entry.formatted)
      adapted = await format(adapted, {
        ...(await resolveConfig(entry.local)),
        filepath: entry.local,
      })
    const local = await readFile(entry.local, 'utf8')
    if (adapted !== local) throw new Error(`Unrecorded vendor modification: ${entry.local}`)
    entry.upstreamSha256 = sha256(original)
    entry.localSha256 = sha256(local)
  }
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        upstream: 'https://github.com/vercel/ai-elements',
        commit,
        license: 'Apache-2.0',
        files: entries,
      },
      null,
      2,
    ) + '\n',
  )
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
for (const entry of manifest.files) {
  if (sha256(await readFile(entry.local)) !== entry.localSha256)
    throw new Error(
      `Vendor checksum changed: ${entry.local}; review and record upstream/local differences`,
    )
}
console.log(
  `Verified ${manifest.files.length} original AI Elements/UI/license files at ${manifest.commit}`,
)
