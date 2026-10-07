// Main-process expression for `node dev/t3.cjs main @dev/simulate-update.js`:
// does what electron-updater's "restart to update" does — start the installer
// with --updated /S --force-run, then quit — with a stand-in installer that
// runs about 3 s. The loader should drop --force-run, and after-update.js
// should bring T3 back through the launcher (see %TEMP%\t3-latex\*.log).
(() => {
  const require = process.getBuiltinModule('node:module').createRequire(process.execPath)
  const cp = require('node:child_process')
  const child = cp.spawn('cmd.exe', ['/d', '/c', 'ping -n 4 127.0.0.1 >nul & rem', '--updated', '/S', '--force-run'], {
    detached: true,
    stdio: 'ignore',
  })
  setTimeout(() => electron.app.quit(), 300)
  return 'stand-in installer pid ' + child.pid + ', args ' + JSON.stringify(child.spawnargs.slice(1))
})()
