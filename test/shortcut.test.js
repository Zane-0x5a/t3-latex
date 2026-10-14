// T3's own Start menu shortcut, which Electron gives our AppUserModelID when
// T3 runs from the launcher (see loader.cjs): restore-shortcut.ps1 on
// shortcuts in a temp folder, and T3's own ID, checked in the installed T3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { T3_APP_ASAR } from './t3-install.js'

const require = createRequire(import.meta.url)
const { APP_ID } = require('../launcher/launch.cjs')
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const T3_APP_ID = readFileSync(join(ROOT, 'mod', 'loader.cjs'), 'utf8').match(/^const T3_APP_ID = '([^']+)'/m)?.[1]

const ps = (script, ...args) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)

// A temp folder (its name outside ASCII, as a Chinese user name would make
// the Start menu's) with helpers to make and read shortcuts there.
function withFolder(fn) {
  const dir = mkdtempSync(join(tmpdir(), 't3latex-开始菜单-'))
  try {
    const make = join(dir, 'make.ps1')
    writeFileSync(
      make,
      '\uFEFFparam($Path, $Target, $Arguments, $Id)\r\n' +
        `Add-Type -Path '${join(ROOT, 'mod', 'shortcut.cs')}'\r\n` +
        '$l = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)\r\n' +
        '$l.TargetPath = $Target; if ($Arguments) { $l.Arguments = $Arguments }; $l.Save()\r\n' +
        '[T3Latex.Shortcut]::SetAppUserModelId($Path, $Id)\r\n',
    )
    fn({
      dir,
      make: (name, target, id, args = '') => ps(make, '-Path', join(dir, `${name}.lnk`), '-Target', target, '-Arguments', args, '-Id', id),
      read: name => {
        const lines = ps(join(ROOT, 'dev', 'read-shortcut.ps1'), '-Path', join(dir, `${name}.lnk`))
        return Object.fromEntries(lines.map(l => l.match(/^(\w+):\s*(.*)$/).slice(1)))
      },
      restore: (name, exe) => ps(join(ROOT, 'mod', 'restore-shortcut.ps1'), '-Name', name, '-Exe', exe, '-From', APP_ID, '-To', T3_APP_ID, '-Dir', dir),
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("the loader's T3 id is T3's own, not ours", () => {
  assert.equal(T3_APP_ID, 'com.t3tools.t3code')
  assert.notEqual(APP_ID, T3_APP_ID)
})

test("T3's own app id is still com.t3tools.t3code in the installed T3", { skip: !existsSync(T3_APP_ASAR) && 'T3 not installed' }, () => {
  // T3 takes the override from this variable and falls back to its own id.
  const main = readFileSync(T3_APP_ASAR, 'latin1')
  assert.ok(main.includes('"T3CODE_DESKTOP_APP_USER_MODEL_ID"'), 'override variable')
  assert.match(main, /appUserModelId: getOrElse\([^\n]*: "com\.t3tools\.t3code"\)/)
})

test("restore-shortcut.ps1 gives T3's shortcut T3's id back, and keeps the rest", () => {
  withFolder(({ dir, make, read, restore }) => {
    const exe = process.execPath
    make('T3 Code (Alpha)', exe, APP_ID)
    const out = restore('T3 Code (Alpha)', exe)
    assert.deepEqual(out, [dir, `restored ${join(dir, 'T3 Code (Alpha).lnk')}`])
    assert.deepEqual(read('T3 Code (Alpha)'), { target: exe, args: '', aumid: T3_APP_ID })
    assert.deepEqual(restore('T3 Code (Alpha)', exe), [dir], 'nothing left to do')
  })
})

test('restore-shortcut.ps1 leaves every other shortcut alone', () => {
  withFolder(({ dir, make, read, restore }) => {
    const exe = process.execPath
    const conhost = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'conhost.exe')
    assert.deepEqual(restore('T3 Code (Alpha)', exe), [dir], 'no shortcut')
    // Ours, or anything else with our id that is not T3's exe.
    make('T3 Code (Alpha)', conhost, APP_ID, '--headless cmd.exe')
    assert.deepEqual(restore('T3 Code (Alpha)', exe), [dir], 'another target')
    assert.equal(read('T3 Code (Alpha)').aumid, APP_ID)
    // T3's exe with an id that is not ours (the dev harness has its own).
    make('T3 Code (Alpha)', exe, `${APP_ID}-other`)
    assert.deepEqual(restore('T3 Code (Alpha)', exe), [dir], 'another id')
    assert.equal(read('T3 Code (Alpha)').aumid, `${APP_ID}-other`)
  })
})
