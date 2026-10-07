// Builds mod/assets/, the folder the loader serves at t3code://app/__t3latex/:
//   boot.js        our renderer module (remark-math + KaTeX + the normaliser)
//   katex.min.css  KaTeX's stylesheet, unchanged
//   t3-latex.css   our layout fixes
//   fonts/*.woff2  KaTeX's fonts
//   THIRD-PARTY-NOTICES.txt  licences of every package bundled into the above
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, 'mod', 'assets')
// Clear stale files if we can; a shell parked in the folder can lock it on
// Windows, which is harmless since every output file is overwritten below.
try {
  rmSync(assets, { recursive: true, force: true })
} catch {}
mkdirSync(join(assets, 'fonts'), { recursive: true })

const { metafile } = await build({
  entryPoints: [join(here, 'src', 'boot.js')],
  outfile: join(assets, 'boot.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome130',
  minify: true,
  legalComments: 'none',
  metafile: true,
})

// KaTeX's stylesheet lists each font woff2-first and Chromium takes the first
// format it supports, so only the woff2 files are ever requested.
const katexDir = join(here, 'node_modules', 'katex', 'dist')
cpSync(join(katexDir, 'katex.min.css'), join(assets, 'katex.min.css'))
cpSync(join(here, 'src', 't3-latex.css'), join(assets, 't3-latex.css'))
for (const f of readdirSync(join(katexDir, 'fonts')).filter(f => f.endsWith('.woff2'))) {
  cpSync(join(katexDir, 'fonts', f), join(assets, 'fonts', f))
}

// Every npm package esbuild took code from (KaTeX also supplies the
// stylesheet and fonts), with its licence text. Some MIT packages ship no
// licence file (remark-math); theirs is the MIT text with the package author.
const MIT = readFileSync(join(here, 'LICENSE'), 'utf8').replace(/^Copyright .*$/m, 'Copyright (c) {author}')
const packages = new Map()
for (const input of Object.keys(metafile.inputs)) {
  const m = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)
  if (m) packages.set(m[1], null)
}
const notices = [...packages.keys()].sort().map(dir => {
  const pkg = JSON.parse(readFileSync(join(here, dir, 'package.json'), 'utf8'))
  const file = readdirSync(join(here, dir)).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  const author = typeof pkg.author === 'string' ? pkg.author.replace(/\s*[<(].*$/, '') : pkg.author?.name
  let text
  if (file) text = readFileSync(join(here, dir, file), 'utf8').trim()
  else if (pkg.license === 'MIT' && author) text = MIT.replace('{author}', author).trim()
  else throw new Error(`${pkg.name}: no licence file, and its licence (${pkg.license}) is not MIT with an author`)
  return `${pkg.name} ${pkg.version} (${pkg.license})\n${'-'.repeat(60)}\n${text}\n`
})
writeFileSync(
  join(assets, 'THIRD-PARTY-NOTICES.txt'),
  `t3-latex bundles the following packages into mod/assets (boot.js, katex.min.css, fonts/).\n\n${notices.join('\n\n')}`,
)

const kb = p => Math.round(readFileSync(p).length / 1024)
console.log(`boot.js        ${kb(join(assets, 'boot.js'))} KB`)
console.log(`katex.min.css  ${kb(join(assets, 'katex.min.css'))} KB`)
console.log(`fonts          ${readdirSync(join(assets, 'fonts')).length} woff2`)
console.log(`notices        ${notices.length} packages`)
