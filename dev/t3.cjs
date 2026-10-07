// Dev harness: an ISOLATED T3 Code with t3-latex loaded, driven from outside.
// It has its own T3CODE_HOME, APPDATA (T3 derives its Electron profile and
// single-instance lock from APPDATA, not --user-data-dir), TEMP (t3-latex's
// logs and its marker of the T3 with math) and taskbar identity
// under scratch/iso, auto update off, and a clean environment, so it never
// touches or hands over to the T3 you use.
// The main-process inspector stays open (local port, test instance only) so
// the commands below can screenshot and script it.
//
//   node dev/t3.cjs start              start it (prints the window title)
//   node dev/t3.cjs shot out.png       PNG of its window
//   node dev/t3.cjs js "<expr>"|@file  evaluate in its window, print result
//   node dev/t3.cjs main "<expr>"      evaluate in its main process
//   node dev/t3.cjs frame "<expr>"     evaluate in each visualization frame
//   node dev/t3.cjs click X Y          a real mouse click at window CSS pixels
//   node dev/t3.cjs log                the loader log
//   node dev/t3.cjs stop               quit it
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { startWithLoader, connect } = require('../launcher/launch.cjs')

const ISO = path.resolve(__dirname, '..', 'scratch', 'iso')
const SESSION = path.join(ISO, 'session.json')

// The user's environment minus this agent session's and T3's own variables.
function cleanEnv() {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|ELECTRON_|T3CODE_|T3LATEX_|NODE_OPTIONS$|NO_COLOR$)/i.test(k)) continue
    env[k] = v
  }
  env.T3CODE_HOME = path.join(ISO, 'home')
  env.APPDATA = path.join(ISO, 'appdata')
  env.TEMP = env.TMP = path.join(ISO, 'tmp')
  env.T3CODE_DESKTOP_APP_USER_MODEL_ID = 'com.t3tools.t3code.t3latex-test'
  env.T3CODE_DISABLE_AUTO_UPDATE = '1'
  return env
}

async function session() {
  const { ws } = JSON.parse(fs.readFileSync(SESSION, 'utf8'))
  return connect(ws)
}

async function mainEval(cdp, expr) {
  const wrapped = `(async () => { const require = process.getBuiltinModule('node:module').createRequire(${JSON.stringify(__filename)}); const electron = require('electron'); return (${expr}) })()`
  const r = await cdp.send('Runtime.evaluate', { expression: wrapped, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

// T3's window (the widest; minimized counts, it still runs scripts).
const mainWindow = `electron.BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && (w.isVisible() || w.isMinimized())).sort((a, b) => b.getBounds().width - a.getBounds().width)[0]`

async function run() {
  const [cmd, raw] = process.argv.slice(2)
  // js/main take an expression, or @file to read it from a file.
  const arg = raw?.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw
  if (cmd === 'start') {
    for (const d of ['home', 'appdata', 'tmp']) fs.mkdirSync(path.join(ISO, d), { recursive: true })
    // A thread with no project runs (and is git-checkpointed by T3) in
    // <T3CODE_HOME>/scratch. Under this checkout that would be this
    // repository; give it an empty one of its own.
    const noProject = path.join(ISO, 'home', 'scratch')
    if (!fs.existsSync(path.join(noProject, '.git'))) {
      fs.mkdirSync(noProject, { recursive: true })
      require('node:child_process').execFileSync('git', ['init', '-q', noProject])
    }
    const { child, cdp, url } = await startWithLoader({
      env: cleanEnv(),
      // Keep rendering while other windows cover it: otherwise Chromium
      // marks the page hidden, stops painting and requestAnimationFrame,
      // and screenshots and input tests go wrong.
      args: ['--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows'],
      keepInspector: true,
    })
    fs.writeFileSync(SESSION, JSON.stringify({ pid: child.pid, ws: url }))
    child.unref()
    cdp.close()
    // Wait for the window.
    const c = await session()
    for (let i = 0; i < 100; i++) {
      const title = await mainEval(c, `(${mainWindow})?.getTitle() ?? null`)
      if (title) {
        console.log('started pid', child.pid, 'window:', title)
        console.log('userData:', await mainEval(c, `electron.app.getPath('userData')`))
        c.close()
        return
      }
      await new Promise(r => setTimeout(r, 300))
    }
    c.close()
    throw new Error('no window after 30 s')
  }
  const c = await session()
  try {
    if (cmd === 'shot') {
      // A minimized window paints nothing: show it without focus for the
      // shot, then minimize it again. Captured before the page is visible
      // and has drawn again, the image is the one from before it was hidden.
      const b64 = await mainEval(
        c,
        `(async () => { const w = ${mainWindow}; const min = w.isMinimized(); if (min) { w.showInactive(); for (let i = 0; i < 50 && await w.webContents.executeJavaScript('document.hidden'); i++) await new Promise(r => setTimeout(r, 100)) } await w.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); const png = (await w.webContents.capturePage()).toPNG().toString('base64'); if (min) w.minimize(); return png })()`,
      )
      fs.writeFileSync(path.resolve(arg), Buffer.from(b64, 'base64'))
      console.log('wrote', path.resolve(arg))
    } else if (cmd === 'js') {
      const v = await mainEval(c, `(${mainWindow}).webContents.executeJavaScript(${JSON.stringify(arg)}, true)`)
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2))
    } else if (cmd === 'main') {
      const v = await mainEval(c, arg)
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2))
    } else if (cmd === 'frame') {
      // Every visualization frame (sandboxed, so the window's js can't reach in).
      const v = await mainEval(
        c,
        `Promise.all((${mainWindow}).webContents.mainFrame.framesInSubtree.filter(f => f.url.includes('/__t3latex/frame/')).map(f => f.executeJavaScript(${JSON.stringify(arg)}, true).catch(e => 'error: ' + e.message)))`,
      )
      console.log(JSON.stringify(v, null, 2))
    } else if (cmd === 'click') {
      // Through the window's DevTools protocol, which routes input like the
      // OS does, into out-of-process frames (visualizations) too;
      // webContents.sendInputEvent stops at the frame's element. The window
      // must be showing: input to a minimized one never completes.
      const [x, y] = process.argv.slice(3).map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('usage: click X Y')
      await mainEval(
        c,
        `(async () => { const w = ${mainWindow}; if (w.isMinimized()) w.showInactive(); const d = w.webContents.debugger; if (!d.isAttached()) d.attach('1.3'); for (const [type, buttons] of [['mouseMoved', 0], ['mousePressed', 1], ['mouseReleased', 0]]) await d.sendCommand('Input.dispatchMouseEvent', { type, x: ${x}, y: ${y}, button: 'left', buttons, clickCount: 1 }) })()`,
      )
      console.log('clicked', x, y)
    } else if (cmd === 'log') {
      console.log(fs.readFileSync(path.join(ISO, 'tmp', 't3-latex', 'loader.log'), 'utf8'))
    } else if (cmd === 'stop') {
      await mainEval(c, `(setTimeout(() => electron.app.quit(), 50), 'quitting')`)
      console.log('stopped')
    } else {
      throw new Error(`unknown command ${cmd}`)
    }
  } finally {
    c.close()
  }
}

run().then(
  () => process.exit(0),
  err => {
    console.error(err && err.stack)
    process.exit(1)
  },
)
