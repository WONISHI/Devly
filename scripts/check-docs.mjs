import { readFile, readdir, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? markdownFiles(join(directory, entry.name))
          : entry.name.endsWith('.md')
            ? [join(directory, entry.name)]
            : [],
      ),
    )
  ).flat()
}
const files = ['README.md', 'AGENTS.md', ...(await markdownFiles('docs'))]
for (const file of files) {
  const content = await readFile(file, 'utf8')
  assert.equal((content.match(/^```/gm) || []).length % 2, 0, `Unbalanced code fences: ${file}`)
  for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(target)) continue
    await access(join(dirname(file), target.split('#')[0]))
  }
}
const plan = await readFile('docs/work-plan.md', 'utf8')
const ids = [...plan.matchAll(/^\|\s*(?:\d+\.\d+\s*\|\s*)?([A-Z]\d{2})\s*\|/gm)].map(
  (match) => match[1],
)
assert.equal(ids.length, new Set(ids).size, 'Task IDs must be unique')
assert.equal(ids.length, 106, 'Baseline and phase tasks must not silently disappear')
const logs = [...(await readFile('docs/work-log.md', 'utf8')).matchAll(/^## LOG-(\d{3})/gm)].map(
  (match) => Number(match[1]),
)
assert.deepEqual(
  logs,
  Array.from({ length: logs.length }, (_, index) => index + 1),
  'Log sequence must be contiguous',
)
console.log(
  `Checked ${files.length} Markdown files, ${ids.length} task IDs, ${logs.length} log entries`,
)
