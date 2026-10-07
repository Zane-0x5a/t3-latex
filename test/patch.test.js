// The react-markdown edits, checked two ways:
//   • against the react-markdown script inside the T3 Code installed on this
//     machine (read-only), so a T3 update that changes its shape fails here;
//   • on a minified build of react-markdown from npm, rendered with React, to
//     check the edited code really renders math.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { T3_SERVER_ASAR } from './t3-install.js'

const require = createRequire(import.meta.url)
const { patchMarkdownScript, MARKER } = require('../mod/patch.cjs')

// node --check parses a file as an ES module without running it.
function assertParses(code) {
  const dir = mkdtempSync(join(tmpdir(), 't3latex-check-'))
  try {
    const file = join(dir, 'chunk.mjs')
    writeFileSync(file, code)
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('patches the react-markdown script of the installed T3', { skip: !existsSync(T3_SERVER_ASAR) && 'T3 not installed' }, () => {
  const asar = require('@electron/asar')
  const scripts = asar
    .listPackage(T3_SERVER_ASAR)
    .filter(p => /client[\\/]assets[\\/][^\\/]+\.js$/.test(p))
    .map(p => p.replace(/^[\\/]/, ''))
  const hits = scripts.filter(p => asar.extractFile(T3_SERVER_ASAR, p).includes(MARKER))
  assert.equal(hits.length, 1, `scripts holding ${MARKER}: ${hits.join(', ')}`)
  const src = asar.extractFile(T3_SERVER_ASAR, hits[0]).toString('utf8')
  const { out, counts } = patchMarkdownScript(src)
  assert.ok(out, counts)
  assert.equal(counts, 'remark 1, rehype 1, children 1')
  assertParses(out)
})

test('leaves scripts without react-markdown alone', () => {
  assert.equal(patchMarkdownScript('const a = b.children || ""').out, null)
  assert.equal(patchMarkdownScript('x.remarkPlugins||y; z.remarkRehypeOptions').out, null)
})

test('the edited react-markdown renders math, and plain text without our module', async () => {
  // Inside the project, so the bundle's imports of react resolve to node_modules.
  const dir = mkdtempSync(join(import.meta.dirname, '.tmp-'))
  try {
    const entry = join(dir, 'entry.mjs')
    writeFileSync(
      entry,
      `export { default as Markdown } from 'react-markdown'\n` +
        `export { createElement } from 'react'\n` +
        `export { renderToStaticMarkup } from 'react-dom/server'\n`,
    )
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      minify: true,
      write: false,
      external: ['react', 'react-dom', 'react/*', 'react-dom/*'],
    })
    const { out, counts } = patchMarkdownScript(result.outputFiles[0].text)
    assert.ok(out, counts)
    const file = join(dir, 'patched.mjs')
    writeFileSync(file, out)
    const { Markdown, createElement, renderToStaticMarkup } = await import(pathToFileURL(file))
    const render = md => renderToStaticMarkup(createElement(Markdown, null, md))

    delete globalThis.__t3latex
    assert.equal(render('a $x$ and $5'), '<p>a $x$ and $5</p>')

    const { remarkPlugins, rehypePlugins } = await import('../src/plugins.js')
    const { normalizeDelimiters } = await import('../src/normalize.js')
    globalThis.__t3latex = { remark: remarkPlugins, rehype: rehypePlugins, normalize: normalizeDelimiters }
    const html = render('a \\(x^2\\) costs $5\n\n$$\\int_0^1 x\\,dx$$')
    assert.equal(html.split('class="katex"').length - 1, 2, html)
    assert.equal(html.split('class="katex-display"').length - 1, 1, html)
    assert.ok(html.includes('costs $5'), html)
  } finally {
    delete globalThis.__t3latex
    rmSync(dir, { recursive: true, force: true })
  }
})
