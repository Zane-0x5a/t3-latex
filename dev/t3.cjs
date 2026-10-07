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

const mainWindow = `electron.BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.isVisible()).sort((a, b) => b.getBounds().width - a.getBounds().width)[0]`

async function run() {
  const [cmd, raw] = process.argv.slice(2)
  // js/main take an expression, or @file to read it from a file.
  const arg = raw?.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw
  if (cmd === 'start') {
    for (const d of ['home', 'appdata', 'tmp']) fs.mkdirSync(path.join(ISO, d), { recursive: true })
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
      const b64 = await mainEval(c, `(${mainWindow}).webContents.capturePage().then(i => i.toPNG().toString('base64'))`)
      fs.writeFileSync(path.resolve(arg), Buffer.from(b64, 'base64'))
      console.log('wrote', path.resolve(arg))
    } else if (cmd === 'js') {
      const v = await mainEval(c, `(${mainWindow}).webContents.executeJavaScript(${JSON.stringify(arg)}, true)`)
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2))
    } else if (cmd === 'main') {
      const v = await mainEval(c, arg)
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2))
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
