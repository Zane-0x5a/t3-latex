// The batch files in launcher/: how find-t3.cmd finds T3, and what
// t3-latex.cmd does without it. The registry cases run a copy of find-t3.cmd
// pointed at a throwaway key, HKCU\Software\t3latex-test, deleted afterwards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { findT3 } = require('../launcher/launch.cjs')
const LAUNCHER = fileURLToPath(new URL('../launcher/', import.meta.url))
const read = name => readFileSync(join(LAUNCHER, name), 'utf8')

// Runs a .cmd and returns what it prints (cmd /u: UTF-16, any path survives),
// or `exit <code>` if it fails.
function run(cmd, env = {}) {
  try {
    return execFileSync('cmd.exe', ['/u', '/d', '/c', 'call', cmd], {
      encoding: 'utf16le',
      windowsHide: true,
      env: { ...process.env, T3LATEX_T3_EXE: '', ...env },
    }).trim()
  } catch (err) {
    return `exit ${err.status}`
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
  assert.equal(run(join(LAUNCHER, 'find-t3.cmd'), { T3LATEX_T3_EXE: exe }), exe)
})

const installed = findT3()
test('find-t3.cmd finds the T3 installed here', { skip: !installed && 'T3 not installed' }, () => {
  assert.match(installed, /\\T3 Code[^\\]*\.exe$/)
  assert.ok(existsSync(join(dirname(installed), 'resources', 'app.asar')), installed)
})

test("find-t3.cmd reads T3's installer entries", () => {
  const TEST = 'HKCU\\Software\\t3latex-test'
  const src = read('find-t3.cmd')
  const guid = src.match(/set "guid=([0-9a-f-]+)"/)[1]
  const copy = src
    .replace('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\%guid%', `${TEST}\\Uninstall\\%guid%`)
    .replace('HKCU\\Software\\%guid%', `${TEST}\\%guid%`)
  assert.equal(copy.split(TEST).length, 3, 'both registry keys redirected')

  const dir = mkdtempSync(join(tmpdir(), 't3latex-find-'))
  const reg = (...args) => execFileSync('reg.exe', args, { stdio: 'pipe' })
  const set = (key, name, value) => reg('add', `${TEST}\\${key}`, '/v', name, '/t', 'REG_SZ', '/d', value, '/f')
  try {
    const find = join(dir, 'find-t3.cmd')
    writeFileSync(find, copy)
    // A folder name outside ASCII (a Chinese user name, say).
    const t3 = join(dir, '用户 张三', 't3code')
    mkdirSync(t3, { recursive: true })
    const exe = join(t3, 'T3 Code (Nightly).exe')
    for (const f of [exe, join(t3, 'Uninstall T3 Code (Nightly).exe')]) writeFileSync(f, '')

    assert.equal(run(find), 'exit 1', 'no entries')
    set(`Uninstall\\${guid}`, 'DisplayIcon', `${exe},0`)
    assert.equal(run(find), exe, 'DisplayIcon names the exe')
    set(`Uninstall\\${guid}`, 'DisplayIcon', join(t3, 'uninstallerIcon.ico'))
    set(guid, 'InstallLocation', t3)
    assert.equal(run(find), exe, 'DisplayIcon is an icon: the T3 exe in InstallLocation')
    set(`Uninstall\\${guid}`, 'DisplayIcon', `${join(t3, 'T3 Code (Alpha).exe')},0`)
    assert.equal(run(find), exe, 'DisplayIcon names an exe that is gone: InstallLocation')
    reg('delete', `${TEST}\\${guid}`, '/f')
    assert.equal(run(find), 'exit 1', 'stale DisplayIcon, no InstallLocation')
  } finally {
    try {
      reg('delete', TEST, '/f')
    } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

test('without T3, t3-latex.cmd shows its message, in Chinese or English', () => {
  // The Chinese message is why the .cmd switches to UTF-8 before reading it.
  // Each run forces one language and swaps the message box for writing the
  // text to a file.
  const src = read('t3-latex.cmd')
  const pick = "(Get-Culture).Name -like 'zh*'"
  const show = /\[System\.Windows\.MessageBox\]::Show\(\$text[^"]*/
  assert.ok(src.includes(pick) && show.test(src), 'message line as expected')
  const [, zh, en] = src.match(/\{ '([^']+)' \} else \{ '([^']+)' \}/)
  assert.match(zh, /[一-鿿]/)
  assert.match(en, /^T3 Code was not found/)
  for (const [force, want] of [['$true', zh], ['$false', en]]) {
    const dir = mkdtempSync(join(tmpdir(), 't3latex-missing-'))
    try {
      const out = join(dir, 'message.txt')
      writeFileSync(join(dir, 't3-latex.cmd'), src.replace(pick, force).replace(show, `Set-Content -Encoding UTF8 -LiteralPath '${out}' -Value $text`))
      writeFileSync(join(dir, 'find-t3.cmd'), '@echo off\r\nexit /b 1\r\n')
      assert.equal(run(join(dir, 't3-latex.cmd'), { T3LATEX_NO_DIALOG: '' }), 'exit 1')
      assert.equal(readFileSync(out, 'utf8').replace(/^﻿/, '').trim(), want)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
