// Builds the release zip, dist/t3-latex-<version>.zip: one t3-latex\ folder
// with everything a user needs and nothing to build (mod/assets is built
// here; the launcher runs on T3's own Node).
//
//   npm run package
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const FILES = [
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
  'CHANGELOG.md',
  'install.cmd',
  'uninstall.cmd',
  'install.ps1',
  'uninstall.ps1',
  'launcher/launch.cjs',
  'launcher/t3-latex.cmd',
  'launcher/find-t3.cmd',
  'mod/loader.cjs',
  'mod/patch.cjs',
  'mod/serve.cjs',
  'mod/after-update.js',
  'mod/assets',
  'skill',
]

execFileSync(process.execPath, [join(here, 'build.mjs')], { stdio: 'inherit' })

const dist = join(here, 'dist')
const folder = join(dist, 't3-latex')
rmSync(dist, { recursive: true, force: true })
for (const f of FILES) {
  mkdirSync(dirname(join(folder, f)), { recursive: true })
  cpSync(join(here, f), join(folder, f), { recursive: true })
}
// Windows' own tar (bsdtar) writes a zip when the name ends in .zip; the tar
// on PATH may be another one (Git's GNU tar can't).
const zip = join(dist, `t3-latex-${version}.zip`)
const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', dist, 't3-latex'], { stdio: 'inherit' })
console.log(`wrote ${zip}`)
