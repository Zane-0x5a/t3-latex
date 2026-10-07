// t3-latex loader. Runs inside T3 Code's main process; the launcher loads it
// before T3's own code starts, so T3's files on disk are never changed.
//
// T3 serves its window from its own t3code:// scheme. This file wraps the
// function T3 registers for that scheme, and on the way through it
//
//   1. serves this folder's assets/ (KaTeX, our renderer module, and the
//      sandboxed frame visualizations run in) under t3code://app/__t3latex/,
//      and the HTML files Codex-style visualization lines point at
//      (serve.cjs);
//   2. adds the KaTeX stylesheet and our module to the window's index.html;
//   3. edits the one script that holds react-markdown, keyed on react-markdown's
//      own option names (minifying keeps those): append remark-math to its
//      remarkPlugins, append KaTeX to its rehypePlugins (after T3's sanitiser),
//      and pass the markdown through our delimiter normaliser first.
//
// If anything here fails, or a T3 update changes that script so the edits no
// longer match, T3 is served exactly as it shipped and shows plain text.

'use strict'

const electron = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { patchMarkdownScript, MARKER } = require('./patch.cjs')
const { serveAsset, serveFile, PREFIX, FILE_PATH } = require('./serve.cjs')

const STATE_DIR = path.join(os.tmpdir(), 't3-latex')
const LOG_FILE = path.join(STATE_DIR, 'loader.log')
const RUNNING_FILE = path.join(STATE_DIR, 'running.json')
const INSPECT_FLAG = /^--inspect/

function log(...parts) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${parts.join(' ')}\n`)
  } catch {}
}

try {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  // One log for every launch; start over once it gets long.
  if (fs.statSync(LOG_FILE, { throwIfNoEntry: false })?.size > 256 * 1024) fs.writeFileSync(LOG_FILE, '')
} catch {}
log('loader', 'pid', process.pid, 'electron', process.versions.electron)

// Chinese where the regional format is Chinese, as the launcher's dialogs.
const LANG = /^zh\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'zh' : 'en'

// ---- the scheme handler wrapper ------------------------------------------

const HEAD_TAGS =
  // The language for our own text in the window (T3's page itself follows
  // the Windows display language, which can differ).
  `<meta name="t3latex-lang" content="${LANG}">` +
  `<link rel="stylesheet" href="${PREFIX}katex.min.css">` +
  `<link rel="stylesheet" href="${PREFIX}t3-latex.css">` +
  `<script type="module" src="${PREFIX}boot.js"></script>`

const patchedScripts = new Map() // url → edited body, or null to serve as shipped
let markdownPatched = false
let warned = false

// Same status and headers (T3's Content-Security-Policy included), new body.
function withBody(res, body) {
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

// Each edit returns the response to serve instead, or null to serve T3's own.
async function editHtml(res) {
  const html = await res.text()
  markRunning()
  if (html.includes(PREFIX)) return null
  // Before T3's own module script, so the math plugins exist before any
  // markdown is rendered.
  const at = html.search(/<script\b[^>]*type=["']module["']/i)
  const i = at >= 0 ? at : html.indexOf('</head>')
  return i >= 0 ? withBody(res, html.slice(0, i) + HEAD_TAGS + html.slice(i)) : null
}

async function editScript(url, res) {
  if (!patchedScripts.has(url)) {
    const bytes = Buffer.from(await res.arrayBuffer())
    let out = null
    if (bytes.includes(MARKER)) {
      const patch = patchMarkdownScript(bytes.toString('utf8'))
      log('react-markdown script', url, patch.out ? 'patched' : 'NOT patched', `(${patch.counts})`)
      if (patch.out) markdownPatched = true
      else warnUnmatched()
      out = patch.out
    }
    patchedScripts.set(url, out)
  }
  const body = patchedScripts.get(url)
  return body === null ? null : withBody(res, body)
}

function wrapHandler(handler) {
  return async request => {
    let url
    try {
      url = new URL(request.url)
      if (url.pathname === FILE_PATH) return serveFile(request, url)
      if (url.pathname.startsWith(PREFIX)) return serveAsset(url)
    } catch (err) {
      log('asset error', err && err.stack)
      return new Response(null, { status: 500 })
    }
    const res = await handler(request)
    try {
      const type = res.headers.get('content-type') || ''
      if (res.status === 200 && type.includes('text/html')) return (await editHtml(res.clone())) ?? res
      if (res.status === 200 && type.includes('javascript')) return (await editScript(url.href, res.clone())) ?? res
    } catch (err) {
      log('edit failed, serving original', url.href, err && err.stack)
    }
    return res
  }
}

// T3 only shows plain text if react-markdown changed shape; say so once.
function warnUnmatched() {
  if (warned || markdownPatched) return
  warned = true
  try {
    new electron.Notification(
      LANG === 'zh'
        ? { title: 'T3 LaTeX 未启用', body: '这个版本的 T3 Code 改了 Markdown 渲染的代码，公式暂时按原文显示，T3 本身不受影响。' }
        : {
            title: 'T3 LaTeX is off',
            body: 'This T3 Code version changed its Markdown rendering code, so formulas show as plain text for now. T3 itself is unaffected.',
          },
    ).show()
  } catch {}
}

// ---- marker for the launcher ----------------------------------------------

// Written once the window loads (so only by the instance that owns the T3
// window, not by a second launch that hands over to it and quits).
let marked = false
function markRunning() {
  if (marked) return
  marked = true
  try {
    fs.writeFileSync(RUNNING_FILE, JSON.stringify({ pid: process.pid, t3: electron.app.getVersion() }))
    electron.app.on('quit', () => {
      try {
        if (JSON.parse(fs.readFileSync(RUNNING_FILE, 'utf8')).pid === process.pid) fs.rmSync(RUNNING_FILE)
      } catch {}
    })
  } catch {}
}

// ---- install ---------------------------------------------------------------

try {
  const proto = electron.protocol
  const handle = proto.handle.bind(proto)
  proto.handle = (scheme, handler) => {
    log('wrapping scheme', scheme)
    return handle(scheme, wrapHandler(handler))
  }
} catch (err) {
  log('could not wrap protocol.handle', err && err.stack)
}

// The launcher started T3 with --inspect-brk to load this file. Keep that flag
// away from anything T3 starts later: a child given it would stop and wait for
// a debugger. And when T3 restarts itself (some settings do), restart through
// the launcher so the new window has math too.
const via = (() => {
  try {
    return process.env.T3LATEX_RELAUNCH ? JSON.parse(process.env.T3LATEX_RELAUNCH) : null
  } catch {
    return null
  } finally {
    delete process.env.T3LATEX_RELAUNCH
  }
})()

try {
  const execArgv = process.execArgv.filter(a => !INSPECT_FLAG.test(a))
  process.execArgv.splice(0, process.execArgv.length, ...execArgv)

  const app = electron.app
  const relaunch = app.relaunch.bind(app)
  app.relaunch = (options = {}) => {
    const args = (options.args ?? process.argv.slice(1)).filter(a => !INSPECT_FLAG.test(a))
    log('relaunch', via ? 'through the launcher' : 'plain', JSON.stringify(args))
    if (via) return relaunch({ execPath: via.execPath, args: [...via.args, ...args] })
    return relaunch({ ...options, args })
  }
} catch (err) {
  log('could not wrap app.relaunch', err && err.stack)
}

// "Restart to update" runs T3's installer with --updated --force-run, and the
// installer then starts the new T3 itself, without math. Drop --force-run and
// leave after-update.js waiting for the installer to finish; it starts T3
// through t3-latex.cmd instead. (Those two flags are electron-updater's
// contract with its NSIS installer, not something T3 versions change.)
try {
  const childProcess = require('node:child_process')
  const spawn = childProcess.spawn
  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe')
  const afterUpdate = path.join(__dirname, 'after-update.js')
  childProcess.spawn = function (command, args, options) {
    if (
      via?.cmd &&
      Array.isArray(args) &&
      args.includes('--updated') &&
      args.includes('--force-run') &&
      fs.existsSync(wscript)
    ) {
      const installer = spawn.call(this, command, args.filter(a => a !== '--force-run'), options)
      spawn(wscript, [afterUpdate, String(installer.pid), via.cmd, LOG_FILE], {
        detached: true,
        stdio: 'ignore',
      }).unref()
      log('update installer', installer.pid, 'started; T3 comes back through the launcher')
      return installer
    }
    return spawn.apply(this, arguments)
  }
} catch (err) {
  log('could not wrap child_process.spawn', err && err.stack)
}

log('installed')
