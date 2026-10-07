// serveFile: the HTML file a Codex-style visualization line points at.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { serveFile, FILE_PATH } = require('../mod/serve.cjs')

const dir = mkdtempSync(join(tmpdir(), 't3latex-file-'))
const page = join(dir, 'gauss-law.html')
writeFileSync(page, '﻿<div id="g">电场</div>\n<script>1</script>')
writeFileSync(join(dir, 'notes.txt'), 'secret')
writeFileSync(join(dir, 'big.html'), Buffer.alloc(5 * 1024 * 1024, 'a'))
test.after(() => rmSync(dir, { recursive: true, force: true }))

const get = (path, init = {}) => {
  const url = new URL(`t3code://app${FILE_PATH}`)
  if (path !== undefined) url.searchParams.set('path', path)
  return serveFile(new Request('http://x/', init), url)
}

test("T3's page gets the file's text, not as a page, readable by no other origin", async () => {
  const res = get(page)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<div id="g">电场</div>\n<script>1</script>') // BOM dropped
  assert.match(res.headers.get('content-type'), /^text\/plain/)
  assert.equal(res.headers.get('access-control-allow-origin'), null)
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  // Forward slashes and file: URLs name it too.
  assert.equal(get(page.replaceAll('\\', '/')).status, 200)
  assert.equal(get(pathToFileURL(page).href).status, 200)
})

test('only absolute .html paths of files that exist, under 4 MB', () => {
  assert.equal(get(join(dir, 'notes.txt')).status, 400)
  assert.equal(get('gauss-law.html').status, 400)
  assert.equal(get(undefined).status, 400)
  assert.equal(get(join(dir, 'missing.html')).status, 404)
  assert.equal(get(dir + '.html').status, 404)
  assert.equal(get(join(dir, 'big.html')).status, 413)
})

test("a sandboxed frame's request (origin null) and anything but GET are refused", () => {
  assert.equal(get(page, { headers: { origin: 'null' } }).status, 403)
  assert.equal(get(page, { method: 'POST', body: 'x' }).status, 403)
  assert.equal(get(page, { headers: { origin: 't3code://app' } }).status, 200)
})
