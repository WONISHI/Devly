import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
const rootRequire = createRequire(import.meta.url)
async function packageRoot(name, parent) {
  let current = dirname(parent.resolve(name))
  for (let i = 0; i < 6; i++) {
    try {
      const data = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'))
      if (data.name === name) return { root: current, version: data.version }
    } catch {
      /* Try the next package parent or license filename. */
    }
    current = dirname(current)
  }
  throw Error('Package metadata not found: ' + name)
}
const ansi = createRequire(rootRequire.resolve('ansi-to-react')),
  math = createRequire(import.meta.resolve('@streamdown/math')),
  link = await packageRoot('linkify-it', ansi),
  uc = await packageRoot('uc.micro', createRequire(join(link.root, 'package.json'))),
  katex = await packageRoot('katex', math)
for (const [name, item] of [
  ['linkify-it', link],
  ['uc-micro', uc],
  ['katex', katex],
]) {
  let data
  for (const file of ['LICENSE', 'LICENSE-MIT', 'LICENSE.txt', 'LICENSE.md']) {
    try {
      data = await readFile(join(item.root, file))
      break
    } catch {
      /* Try the next package parent or license filename. */
    }
  }
  if (!data) throw Error('Actual license missing: ' + name)
  await writeFile(`resources/vendor/stage12-${name}.LICENSE`, data)
  console.log(`${name}@${item.version}: copied actual license`)
}
