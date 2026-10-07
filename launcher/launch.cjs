// t3-latex launcher: starts T3 Code with formula rendering.
//
// T3 is started as usual plus one flag, --inspect-brk, which makes its main
// process stop at its first line and wait for a debugger on a local port.
// This script connects to that port, has the main process load
// ../mod/loader.cjs, lets T3 carry on, and closes the port again. Nothing in
// T3's install folder is changed; started any other way, T3 runs as shipped.
//
//   launcher/t3-latex.cmd [args for T3]     (the shortcut runs this)
//
// Runs on T3's own Node (t3-latex.cmd finds T3 with find-t3.cmd and runs this
// on it with ELECTRON_RUN_AS_NODE=1), so it needs nothing else installed.
// Logs to %TEMP%\t3-latex\launcher.log.

'use strict'

const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const LOADER = path.join(ROOT, 'mod', 'loader.cjs')
const CMD = path.join(__dirname, 't3-latex.cmd')
const STATE_DIR = path.join(os.tmpdir(), 't3-latex')
const LOG_FILE = path.join(STATE_DIR, 'launcher.log')
const RUNNING_FILE = path.join(STATE_DIR, 'running.json')

// The installed T3 exe as find-t3.cmd reports it ('' if there is none).
function findT3() {
  try {
    // /u: cmd prints UTF-16, so paths outside the console code page survive.
    const out = execFileSync('cmd.exe', ['/u', '/d', '/c', 'call', path.join(__dirname, 'find-t3.cmd')], {
      encoding: 'utf16le',
      windowsHide: true,
    })
    return out.trim()
  } catch {
    return ''
  }
}

// Started by t3-latex.cmd, this script runs on the T3 exe it found. Started
// on another Node (the dev harness, tests), look T3 up.
const T3_EXE = process.versions.electron ? process.execPath : findT3()
const CONHOST = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'conhost.exe')
// The shortcut's AppUserModelID (install.ps1 sets the same one). T3 takes it
// from T3CODE_DESKTOP_APP_USER_MODEL_ID, so its window shares a taskbar button
// with a pinned "T3 Code (LaTeX)". It must differ from T3's own
// com.t3tools.t3code: the Start menu lists one shortcut per ID.
const APP_ID = 'com.t3tools.t3code.latex'
// Message boxes are in Chinese where the regional format is Chinese, else in
// English (as are t3-latex.cmd's and the loader's).
const ZH = /^zh\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale)

function log(...parts) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${parts.join(' ')}\n`)
  } catch {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// The inspector's WebSocket URL, once T3's main process is listening.
async function debuggerUrl(port, child, timeoutMs) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`T3 exited (code ${child.exitCode}) before the debugger attached`)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const [target] = await res.json()
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl
    } catch {}
    await sleep(100)
  }
  throw new Error(`no debugger on port ${port} after ${timeoutMs} ms`)
}

// A minimal Chrome DevTools Protocol client over the global WebSocket.
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let nextId = 1
    const pending = new Map()
    const waiters = []
    ws.onerror = () => reject(new Error('debugger connection failed'))
    ws.onclose = () => {
      for (const { reject: r } of pending.values()) r(new Error('debugger connection closed'))
      pending.clear()
    }
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data)
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
      } else if (msg.method) {
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].resolve(msg.params)
        }
      }
    }
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          const id = nextId++
          ws.send(JSON.stringify({ id, method, params }))
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }))
        },
        once(method, timeoutMs) {
          return new Promise((res, rej) => {
            waiters.push({ method, resolve: res })
            setTimeout(() => rej(new Error(`no ${method} within ${timeoutMs} ms`)), timeoutMs).unref()
          })
        },
        close: () => ws.close(),
      })
  })
}

// The environment T3 starts with: without ELECTRON_RUN_AS_NODE (set for this
// script; T3 would run as plain Node) and with the shortcut's AppUserModelID,
// unless one is set already (the dev harness uses its own).
function t3Env(env = process.env) {
  const childEnv = { ...env }
  delete childEnv.ELECTRON_RUN_AS_NODE
  childEnv.T3CODE_DESKTOP_APP_USER_MODEL_ID ||= APP_ID
  return childEnv
}

// Start T3 with the loader in it. Returns { child, cdp, url }: when
// keepInspector is set, cdp is still connected and url is the inspector's
// address (the dev harness drives T3 through it); otherwise the inspector is
// closed and cdp is null.
async function startWithLoader({ exe = T3_EXE, args = [], env = process.env, keepInspector = false } = {}) {
  if (!exe || !fs.existsSync(exe)) throw new Error(exe ? `T3 Code not found at ${exe}` : 'T3 Code is not installed')
  if (!fs.existsSync(path.join(ROOT, 'mod', 'assets', 'boot.js'))) throw new Error('mod/assets is missing; run node build.mjs')

  const port = await freePort()
  const childEnv = t3Env(env)
  // If T3 restarts itself, or comes back after an update (after-update.js),
  // it does so through t3-latex.cmd (see loader.cjs), which looks T3 up anew:
  // an update can rename the exe (switching to Nightly does).
  childEnv.T3LATEX_RELAUNCH = JSON.stringify({
    execPath: CONHOST,
    args: ['--headless', 'cmd.exe', '/d', '/c', CMD],
    cmd: CMD,
  })
  if (exe !== T3_EXE) childEnv.T3LATEX_T3_EXE = exe

  log('starting', JSON.stringify(exe), 'port', port, 'app id', childEnv.T3CODE_DESKTOP_APP_USER_MODEL_ID, 'args', JSON.stringify(args))
  const child = spawn(exe, [`--inspect-brk=127.0.0.1:${port}`, ...args], {
    cwd: path.dirname(exe),
    env: childEnv,
    detached: true,
    stdio: 'ignore',
  })
  const spawned = new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  await spawned

  let resumed = false
  try {
    const url = await debuggerUrl(port, child, 20000)
    const cdp = await connect(url)
    const paused = cdp.once('Debugger.paused', 20000)
    await cdp.send('Runtime.enable')
    await cdp.send('Debugger.enable')
    await cdp.send('Runtime.runIfWaitingForDebugger')
    const { callFrames } = await paused
    const load = await cdp.send('Debugger.evaluateOnCallFrame', {
      callFrameId: callFrames[0].callFrameId,
      expression: `process.getBuiltinModule('node:module').createRequire(${JSON.stringify(LOADER)})(${JSON.stringify(LOADER)}), 'loaded'`,
    })
    if (load.exceptionDetails) {
      throw new Error(`loader failed: ${load.exceptionDetails.exception?.description || load.exceptionDetails.text}`)
    }
    log('loader loaded into pid', child.pid)
    await cdp.send('Debugger.resume')
    resumed = true
    if (keepInspector) return { child, cdp, url }
    // Close the debug port: nothing else gets to attach to T3 later.
    await cdp.send('Runtime.evaluate', {
      expression: `setTimeout(() => process.getBuiltinModule('node:inspector').close(), 0), 'closing'`,
    })
    cdp.close()
    return { child, cdp: null, url: null }
  } catch (err) {
    if (resumed) {
      // T3 is running with math; only closing the port went wrong.
      log('after resume:', err && err.message)
      return { child, cdp: null, url: null }
    }
    // T3 is still stopped at its first line with no window; end it so the
    // caller can start it normally instead.
    try {
      child.kill()
    } catch {}
    throw err
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// A message box from a hidden PowerShell; resolves once it is closed. (This
// script must stay alive meanwhile: Node ends its non-detached children when
// it exits, and a detached PowerShell gets no console and quits at once.)
// T3LATEX_NO_DIALOG=1 (tests) logs the text instead.
function tell(text, icon = 'Information') {
  if (process.env.T3LATEX_NO_DIALOG) return log('dialog:', JSON.stringify(text))
  const quote = s => `'${String(s).replace(/'/g, "''")}'`
  const script =
    'Add-Type -AssemblyName PresentationFramework;' +
    `[System.Windows.MessageBox]::Show(${quote(text)}, 'T3 Code (LaTeX)', 'OK', '${icon}') | Out-Null`
  return new Promise(resolve => {
    const box = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
    })
    box.once('error', resolve)
    box.once('exit', resolve)
  })
}

async function main() {
  const args = process.argv.slice(2)
  try {
    // One log for every launch; start over once it gets long.
    if (fs.statSync(LOG_FILE, { throwIfNoEntry: false })?.size > 256 * 1024) fs.writeFileSync(LOG_FILE, '')
  } catch {}
  log('launcher', process.version, 'args', JSON.stringify(args))
  let child
  try {
    ;({ child } = await startWithLoader({ args }))
  } catch (err) {
    log('FAILED', err && err.stack)
    // Still give the user their T3, just without math.
    if (fs.existsSync(T3_EXE)) {
      spawn(T3_EXE, args, { cwd: path.dirname(T3_EXE), env: t3Env(), detached: true, stdio: 'ignore' }).unref()
    }
    await tell(
      ZH
        ? `公式渲染没能加载，T3 已按普通方式打开。\n\n原因：${err.message}\n日志：${LOG_FILE}`
        : `Math rendering could not be loaded; T3 was opened normally.\n\nReason: ${err.message}\nLog: ${LOG_FILE}`,
      'Warning',
    )
    return
  }

  // If another T3 already owns the window, this one hands over and quits
  // within a few seconds. Say so when that T3 has no math loaded.
  const exit = await Promise.race([
    new Promise(resolve => child.once('exit', code => resolve(code))),
    sleep(10000).then(() => 'running'),
  ])
  if (exit === 0) {
    let running = null
    try {
      running = JSON.parse(fs.readFileSync(RUNNING_FILE, 'utf8'))
    } catch {}
    if (running && running.pid !== child.pid && isAlive(running.pid)) {
      log('T3 with math already running, pid', running.pid)
    } else {
      log('another T3 without math is running')
      await tell(
        ZH
          ? 'T3 Code 已经在运行，但它不是从「T3 Code (LaTeX)」打开的，所以没有公式渲染。\n\n请先完全退出 T3（包括托盘图标），再从「T3 Code (LaTeX)」打开。'
          : 'T3 Code is already running, but it was not opened from "T3 Code (LaTeX)", so it has no math rendering.\n\nQuit T3 completely (including its tray icon), then open it from "T3 Code (LaTeX)".',
      )
    }
  } else {
    log('T3 running, pid', child.pid, 'state', exit)
  }
  child.unref()
}

module.exports = { startWithLoader, freePort, connect, t3Env, findT3, APP_ID }

if (require.main === module) {
  main().then(
    () => process.exit(0),
    err => {
      log('crashed', err && err.stack)
      process.exit(1)
    },
  )
}
