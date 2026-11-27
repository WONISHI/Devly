import { parentPort, workerData } from 'node:worker_threads'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
try {
  const document = parse(String(workerData).slice(0, 2 * 1024 * 1024))
  let text = '',
    title = '',
    truncated = false
  const stack: Array<{ node: DefaultTreeAdapterTypes.Node; inTitle: boolean }> = [
    { node: document, inTitle: false },
  ]
  while (stack.length) {
    const { node, inTitle } = stack.pop()!
    if (
      'tagName' in node &&
      ['script', 'style', 'noscript', 'template', 'svg'].includes(node.tagName)
    )
      continue
    if ('value' in node) {
      const value = node.value.replace(/\s+/g, ' ').trim()
      if (inTitle) title += ' ' + value
      else text += value + '\n'
      if (text.length > 12000) {
        truncated = true
        break
      }
    }
    if ('childNodes' in node)
      for (const child of [...node.childNodes].reverse())
        stack.push({
          node: child,
          inTitle: inTitle || ('tagName' in node && node.tagName === 'title'),
        })
  }
  parentPort?.postMessage({
    title: title.trim().slice(0, 300),
    text: text.trim().slice(0, 12000),
    truncated,
  })
} catch {
  parentPort?.postMessage({ error: true })
}
