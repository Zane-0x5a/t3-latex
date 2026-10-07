// Serves mod/assets/ at t3code://app/__t3latex/ (the loader routes requests
// there), kept apart from the loader so it can be tested without Electron.
//
// Two kinds of page load these files: T3's own window (boot.js, KaTeX), and
// the sandboxed frames visualizations run in (frame/). A sandboxed frame has an
// opaque origin, so its module scripts and fonts are cross-origin requests:
// every file is served with Access-Control-Allow-Origin: *. The frame's page
// gets its own Content-Security-Policy: scripts, styles and fonts from these
// assets and a few CDNs only, no fetching from anywhere else.
//
// serveFile reads the HTML file a Codex-style visualization line points at.

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

const PREFIX = '/__t3latex/'
const ASSETS = path.join(__dirname, 'assets')
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// The CDNs models load libraries from (the same list Codex's visualizations
// allow, so code written for those runs here too).
const CDNS = 'https://cdn.jsdelivr.net https://unpkg.com https://esm.sh https://cdnjs.cloudflare.com'
function frameCsp(scheme) {
  const self = `'self' ${scheme}`
  return [
    "default-src 'none'",
    `script-src ${self} 'unsafe-inline' 'unsafe-eval' blob: ${CDNS}`,
    `style-src ${self} 'unsafe-inline' ${CDNS} https://fonts.googleapis.com https://fonts.bunny.net`,
    `font-src ${self} data: ${CDNS} https://fonts.gstatic.com https://fonts.bunny.net`,
    `img-src ${self} data: blob: ${CDNS}`,
    `media-src ${self} data: blob:`,
    `connect-src ${self} data: blob: ${CDNS}`,
    `worker-src ${self} blob:`,
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

// url: the request's URL, whose pathname starts with PREFIX.
function serveAsset(url, assets = ASSETS) {
  let file
  try {
    file = path.resolve(assets, '.' + decodeURIComponent(url.pathname.slice(PREFIX.length - 1)))
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!file.startsWith(assets + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    return new Response(null, { status: 404, headers: { 'access-control-allow-origin': '*' } })
  }
  const ext = path.extname(file)
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  }
  if (ext === '.html') headers['content-security-policy'] = frameCsp(url.protocol)
  return new Response(fs.readFileSync(file), { headers })
}

// The HTML file a Codex-style `visualize{"path":…}` line points at, as text:
// t3code://app/__t3latex/file?path=<absolute path>. Only .html files, for T3's
// own page (the element that shows the line fetches it, same origin). Unlike
// the assets this sends no Access-Control-Allow-Origin and refuses requests
// from an opaque origin, so a visualization's sandboxed frame cannot read it.
const FILE_PATH = `${PREFIX}file`
const MAX_FILE_BYTES = 4 * 1024 * 1024
function serveFile(request, url) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' }
  const fail = status => new Response(null, { status, headers })
  if (request.method !== 'GET' || request.headers.get('origin') === 'null') return fail(403)
  let file = url.searchParams.get('path') || ''
  try {
    if (/^file:/i.test(file)) file = fileURLToPath(file)
  } catch {
    return fail(400)
  }
  if (!path.isAbsolute(file) || !/\.html?$/i.test(file)) return fail(400)
  const stat = fs.statSync(file, { throwIfNoEntry: false })
  if (!stat?.isFile()) return fail(404)
  if (stat.size > MAX_FILE_BYTES) return fail(413)
  let text
  try {
    text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  } catch {
    return fail(404)
  }
  return new Response(text, { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } })
}

module.exports = { serveAsset, serveFile, frameCsp, PREFIX, FILE_PATH }
