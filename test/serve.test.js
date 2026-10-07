// What the loader serves at t3code://app/__t3latex/ (mod/serve.cjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { serveAsset, frameCsp } = require('../mod/serve.cjs')
const built = existsSync(fileURLToPath(new URL('../mod/assets/frame/frame.html', import.meta.url)))
const get = path => serveAsset(new URL(`t3code://app/__t3latex/${path}`))

test('the frame page gets its own policy: local and CDN scripts, nothing fetched from elsewhere', { skip: !built && 'run npm run build' }, async () => {
  const res = get('frame/frame.html')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/html/)
  const csp = Object.fromEntries(
    res.headers.get('content-security-policy').split('; ').map(d => [d.split(' ')[0], d.split(' ').slice(1)]),
  )
  assert.deepEqual(csp['default-src'], ["'none'"])
  assert.ok(csp['script-src'].includes("'self'") && csp['script-src'].includes('t3code:'))
  assert.ok(csp['script-src'].includes('https://cdn.jsdelivr.net'))
  for (const directive of ['script-src', 'connect-src', 'img-src', 'style-src', 'font-src']) {
    assert.ok(!csp[directive].includes('https:') && !csp[directive].includes('*'), `${directive}: ${csp[directive]}`)
  }
  assert.deepEqual(csp['form-action'], ["'none'"])
  assert.match(await res.text(), /runtime\.js/)
})

test('every asset can be loaded by the opaque-origin frame', { skip: !built && 'run npm run build' }, () => {
  for (const path of ['boot.js', 'frame/runtime.js', 'frame/lib/three.module.js', 'fonts/KaTeX_Main-Regular.woff2']) {
    const res = get(path)
    assert.equal(res.status, 200, path)
    assert.equal(res.headers.get('access-control-allow-origin'), '*', path)
    assert.equal(res.headers.get('content-security-policy'), null, path)
  }
  assert.equal(get('frame/lib/d3.module.js').headers.get('content-type'), 'text/javascript')
})

test('nothing outside mod/assets is served', () => {
  assert.equal(get('%2e%2e/loader.cjs').status, 404)
  assert.equal(get('..%5cloader.cjs').status, 404)
  assert.equal(get('frame/missing.js').status, 404)
  assert.equal(get('frame').status, 404) // a folder
  assert.equal(get('%E0%A4%A').status, 400)
})

test('the policy names the scheme the frame was loaded from', () => {
  assert.match(frameCsp('t3code-dev:'), /script-src 'self' t3code-dev: /)
})
