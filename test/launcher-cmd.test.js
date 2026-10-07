// The batch files in launcher/: how find-t3.cmd finds T3, how t3-latex.cmd
// starts what it found, and what t3-latex.cmd does without T3. The registry
// cases run copies pointed at a throwaway key, HKCU\Software\t3latex-test,
// deleted afterwards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { findT3 } = require('../launcher/launch.cjs')
const LAUNCHER = fileURLToPath(new URL('../launcher/', import.meta.url))
const read = name => readFileSync(join(LAUNCHER, name), 'utf8')

// Runs a .cmd and returns what it prints (cmd /u: UTF-16, any path survives),
// or `exit <code>` if it fails. With cp, the console is first switched to that
// code page: 437 is what GitHub's runners and English Windows have.
function run(cmd, { env = {}, cp } = {}) {
  let target = cmd
  if (cp) {
    target = join(dirname(cmd), `cp${cp}-${Math.random().toString(36).slice(2)}.cmd`)
    writeFileSync(target, `@echo off\r\nchcp ${cp} >nul\r\ncall "${cmd}" %*\r\n`)
  }
  try {
    return execFileSync('cmd.exe', ['/u', '/d', '/c', 'call', target], {
      encoding: 'utf16le',
      windowsHide: true,
      env: { ...process.env, T3LATEX_T3_EXE: '', ...env },
    }).trim()
  } catch (err) {
    return `exit ${err.status}`
  } finally {
    if (cp) rmSync(target, { force: true })
  }
}

// A temp folder holding find-t3.cmd redirected to the test key, a folder for
// T3 whose name is outside ASCII and outside code page 437 (a Chinese user
// name, say), and helpers to fill the key. Cleans up after fn.
function withTestInstall(fn) {
  const TEST = 'HKCU\\Software\\t3latex-test'
  const src = read('find-t3.cmd')
  const guid = src.match(/set "guid=([0-9a-f-]+)"/)[1]
  const copy = src
    .replace('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\%guid%', `${TEST}\\Uninstall\\%guid%`)
    .replace('HKCU\\Software\\%guid%', `${TEST}\\%guid%`)
  assert.equal(copy.split(TEST).length, 3, 'both registry keys redirected')

  const dir = mkdtempSync(join(tmpdir(), 't3latex-find-'))
  const reg = (...args) => execFileSync('reg.exe', args, { stdio: 'pipe' })
  try {
    writeFileSync(join(dir, 'find-t3.cmd'), copy)
    const t3 = join(dir, '用户 张三', 't3code')
    mkdirSync(t3, { recursive: true })
    fn({
      dir,
      t3,
      find: join(dir, 'find-t3.cmd'),
      setIcon: value => reg('add', `${TEST}\\Uninstall\\${guid}`, '/v', 'DisplayIcon', '/t', 'REG_SZ', '/d', value, '/f'),
      setFolder: value => reg('add', `${TEST}\\${guid}`, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', value, '/f'),
      dropFolder: () => reg('delete', `${TEST}\\${guid}`, '/f'),
    })
  } finally {
    try {
      reg('delete', TEST, '/f')
    } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the batch files have CRLF line endings', () => {
  // With bare LF, cmd misreads lines around goto, labels and chcp.
  for (const dir of [LAUNCHER, join(LAUNCHER, '..')]) {
    for (const name of readdirSync(dir).filter(n => n.endsWith('.cmd'))) {
      assert.doesNotMatch(readFileSync(join(dir, name), 'utf8'), /(^|[^\r])\n/, name)
    }
  }
})

test('find-t3.cmd prints T3LATEX_T3_EXE when it is set', () => {
  const exe = 'C:\\Somewhere\\T3 Code (Nightly).exe'
  assert.equal(run(join(LAUNCHER, 'find-t3.cmd'), { env: { T3LATEX_T3_EXE: exe } }), exe)
})

const installed = findT3()
test('find-t3.cmd finds the T3 installed here', { skip: !installed && 'T3 not installed' }, () => {
  assert.match(installed, /\\T3 Code[^\\]*\.exe$/)
  assert.ok(existsSync(join(dirname(installed), 'resources', 'app.asar')), installed)
})

test("find-t3.cmd reads T3's installer entries, whatever the console's code page", () => {
  withTestInstall(({ t3, find, setIcon, setFolder, dropFolder }) => {
    const exe = join(t3, 'T3 Code (Nightly).exe')
    for (const f of [exe, join(t3, 'Uninstall T3 Code (Nightly).exe')]) writeFileSync(f, '')
    const cp = '437'
    assert.equal(run(find, { cp }), 'exit 1', 'no entries')
    setIcon(`${exe},0`)
    assert.equal(run(find, { cp }), exe, 'DisplayIcon names the exe')
    setIcon(join(t3, 'uninstallerIcon.ico'))
    setFolder(t3)
    assert.equal(run(find, { cp }), exe, 'DisplayIcon is an icon: the T3 exe in InstallLocation')
    setIcon(`${join(t3, 'T3 Code (Alpha).exe')},0`)
    assert.equal(run(find, { cp }), exe, 'DisplayIcon names an exe that is gone: InstallLocation')
    dropFolder()
    assert.equal(run(find, { cp }), 'exit 1', 'stale DisplayIcon, no InstallLocation')
  })
})

test('t3-latex.cmd runs launch.cjs on the exe it found, without leaking its variable', () => {
  // This Node stands in for T3 (both run launch.cjs as Node), copied into
  // the folder with the non-ASCII name; a stand-in launch.cjs reports.
  withTestInstall(({ dir, t3, setIcon }) => {
    const exe = join(t3, 'T3 Code (Nightly).exe')
    copyFileSync(process.execPath, exe)
    setIcon(`${exe},0`)
    writeFileSync(join(dir, 't3-latex.cmd'), read('t3-latex.cmd'))
    const out = join(dir, 'report.json')
    writeFileSync(
      join(dir, 'launch.cjs'),
      `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ execPath: process.execPath, exe: process.env.exe ?? null, runAsNode: process.env.ELECTRON_RUN_AS_NODE, args: process.argv.slice(2) }))\n`,
    )
    // (No message box if the lookup fails: the test fails on the report.)
    run(join(dir, 't3-latex.cmd'), { env: { T3LATEX_NO_DIALOG: '1' }, cp: '437' })
    assert.ok(existsSync(out), 't3-latex.cmd found and started the exe')
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { execPath: exe, exe: null, runAsNode: '1', args: [] })
  })
})

test('without T3, t3-latex.cmd shows its message, in Chinese or English', () => {
  // Each run forces one language and swaps the message box for writing the
  // text to a file. The Chinese one needs the .cmd to be read as UTF-8.
  const src = read('t3-latex.cmd')
  const pick = "(Get-Culture).Name -like 'zh*'"
  const show = /\[System\.Windows\.MessageBox\]::Show\(\$text[^"]*/
  assert.ok(src.includes(pick) && show.test(src), 'message line as expected')
  const [, zh, en] = src.match(/\{ '([^']+)' \} else \{ '([^']+)' \}/)
  assert.match(zh, /[\u4e00-\u9fff]/)
  assert.match(en, /^T3 Code was not found/)
  for (const [force, want] of [
    ['$true', zh],
    ['$false', en],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 't3latex-missing-'))
    try {
      const out = join(dir, 'message.txt')
      writeFileSync(join(dir, 't3-latex.cmd'), src.replace(pick, force).replace(show, `Set-Content -Encoding UTF8 -LiteralPath '${out}' -Value $text`))
      writeFileSync(join(dir, 'find-t3.cmd'), '@echo off\r\nexit /b 1\r\n')
      assert.equal(run(join(dir, 't3-latex.cmd'), { env: { T3LATEX_NO_DIALOG: '' }, cp: '437' }), 'exit 1')
      assert.equal(readFileSync(out, 'utf8').replace(/^\uFEFF/, '').trim(), want)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
