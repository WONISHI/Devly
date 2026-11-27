import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Ansi from 'ansi-to-react'
const rootRequire = createRequire(import.meta.url)
const ansiRequire = createRequire(rootRequire.resolve('ansi-to-react'))
const mathRequire = createRequire(resolve('node_modules/@streamdown/math/package.json'))
it('renders real ANSI links through the fixed parser without javascript anchors', () => {
  const output = renderToStaticMarkup(
    createElement(
      Ansi,
      { linkify: 'fuzzy' },
      '\u001b[32mPASS\u001b[0m https://example.com javascript:alert(1)',
    ),
  )
  expect(output).toContain('PASS')
  expect(output).toMatch(/href="https:\/\/example.com\/?"/)
  expect(output).not.toContain('href="javascript:')
  const Linkify = ansiRequire('linkify-it')
  const parser = Linkify()
  // Adversarial repeated mailto prefixes must return under the test's bounded timeout.
  const matches = parser.match('mailto:'.repeat(12000) + ' invalid')
  expect(matches === null || Array.isArray(matches)).toBe(true)
}, 5000)
it('renders actual math and rejects trusted HTML/unsafe URLs with the fixed KaTeX', () => {
  const katex = mathRequire('katex')
  const output = katex.renderToString('\\frac{1}{2}+x^2', { trust: false, throwOnError: false })
  expect(output).toContain('katex-mathml')
  const unsafe = katex.renderToString('\\href{javascript:alert(1)}{x}', {
    trust: false,
    throwOnError: false,
    strict: 'ignore',
  })
  expect(unsafe).not.toContain('href="javascript:')
  expect(unsafe).not.toContain('<script')
})
