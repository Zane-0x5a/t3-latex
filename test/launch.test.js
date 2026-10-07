// The environment the launcher starts T3 with, and the AppUserModelID it
// shares with the shortcut install.ps1 creates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { t3Env, APP_ID } = require('../launcher/launch.cjs')

test('T3 gets the shortcut app id and no ELECTRON_RUN_AS_NODE', () => {
  const env = t3Env({ ELECTRON_RUN_AS_NODE: '1', PATH: 'C:\\Windows' })
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(env.T3CODE_DESKTOP_APP_USER_MODEL_ID, APP_ID)
  assert.equal(env.PATH, 'C:\\Windows')
})

test('an app id that is already set is kept', () => {
  const env = t3Env({ T3CODE_DESKTOP_APP_USER_MODEL_ID: 'com.t3tools.t3code.t3latex-test' })
  assert.equal(env.T3CODE_DESKTOP_APP_USER_MODEL_ID, 'com.t3tools.t3code.t3latex-test')
})

test("the app id matches install.ps1 and is not T3's own", () => {
  // The Start menu lists one shortcut per app id: with T3's id, the
  // "T3 Code (LaTeX)" shortcut would be hidden behind "T3 Code (Alpha)".
  assert.notEqual(APP_ID, 'com.t3tools.t3code')
  const install = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8')
  assert.equal(install.match(/^\$appId = '([^']+)'/m)?.[1], APP_ID)
})
