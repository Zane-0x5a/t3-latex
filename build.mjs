// Builds mod/assets/, the folder the loader serves at t3code://app/__t3latex/:
//   boot.js        our renderer module (remark-math + KaTeX + the normaliser,
//                  and the element that shows ```visualize blocks)
//   katex.min.css  KaTeX's stylesheet, unchanged
//   t3-latex.css   our layout fixes
//   fonts/*.woff2  KaTeX's fonts
//   frame/         the sandboxed frame a visualization runs in:
//     frame.html, frame.css, runtime.js
//     lib/         libraries a visualization can use: d3, three.js (+ addons),
//                  KaTeX, Lucide
//   THIRD-PARTY-NOTICES.txt  licences of every package bundled into the above
import { build, transform } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, 'mod', 'assets')
const frame = join(assets, 'frame')
const lib = join(frame, 'lib')
// Clear stale files if we can; a shell parked in the folder can lock it on
// Windows, which is harmless since every output file is overwritten below.
try {
  rmSync(assets, { recursive: true, force: true })
} catch {}
mkdirSync(join(assets, 'fonts'), { recursive: true })
mkdirSync(lib, { recursive: true })

const common = { bundle: true, platform: 'browser', target: 'chrome130', minify: true, legalComments: 'none', metafile: true }
const bundles = [
  { entryPoints: [join(here, 'src', 'boot.js')], outfile: join(assets, 'boot.js'), format: 'esm' },
  { entryPoints: [join(here, 'frame', 'runtime.js')], outfile: join(frame, 'runtime.js'), format: 'iife' },
  { entryPoints: [join(here, 'frame', 'katex.js')], outfile: join(lib, 'katex.js'), format: 'iife' },
  { entryPoints: [join(here, 'frame', 'three-global.js')], outfile: join(lib, 'three.min.js'), format: 'iife' },
  // The ES module builds the frame's import map points at.
  { stdin: { contents: "export * from 'three'", resolveDir: here }, outfile: join(lib, 'three.module.js'), format: 'esm' },
  { stdin: { contents: "export * from 'd3'", resolveDir: here }, outfile: join(lib, 'd3.module.js'), format: 'esm' },
]
const inputs = new Set()
for (const options of bundles) {
  const { metafile } = await build({ ...common, ...options })
  for (const input of Object.keys(metafile.inputs)) inputs.add(input)
}

// KaTeX's stylesheet lists each font woff2-first and Chromium takes the first
// format it supports, so only the woff2 files are ever requested.
const katexDir = join(here, 'node_modules', 'katex', 'dist')
cpSync(join(katexDir, 'katex.min.css'), join(assets, 'katex.min.css'))
cpSync(join(here, 'src', 't3-latex.css'), join(assets, 't3-latex.css'))
for (const f of readdirSync(join(katexDir, 'fonts')).filter(f => f.endsWith('.woff2'))) {
  cpSync(join(katexDir, 'fonts', f), join(assets, 'fonts', f))
}

cpSync(join(here, 'frame', 'frame.html'), join(frame, 'frame.html'))
cpSync(join(here, 'frame', 'frame.css'), join(frame, 'frame.css'))
// d3's own script build, for the global d3, and Lucide's, for the global
// lucide (with all its icons) that Codex's visualizations expect.
cpSync(join(here, 'node_modules', 'd3', 'dist', 'd3.min.js'), join(lib, 'd3.min.js'))
cpSync(join(here, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'), join(lib, 'lucide.js'))

// three.js addons, imported as 'three/addons/…' (the import map's prefix, as
// in three's docs). They import 'three' and each other; a file that needs
// anything else (WebGPU, TSL, a file left out) is left out too.
const ADDON_DIRS = [
  'animation', 'controls', 'curves', 'environments', 'geometries', 'helpers', 'interactive', 'lines',
  'math', 'misc', 'modifiers', 'objects', 'renderers', 'shaders', 'utils',
]
const ADDON_FILES = ['libs/lil-gui.module.min.js', 'libs/stats.module.js']
const jsm = join(here, 'node_modules', 'three', 'examples', 'jsm')
const walk = dir => readdirSync(join(jsm, dir)).flatMap(f => (statSync(join(jsm, dir, f)).isDirectory() ? walk(`${dir}/${f}`) : [`${dir}/${f}`]))
const addons = new Map() // path under jsm → its minified code (no comments to misread as imports)
for (const file of [...ADDON_DIRS.flatMap(walk), ...ADDON_FILES].filter(f => f.endsWith('.js'))) {
  const source = readFileSync(join(jsm, file), 'utf8')
  const { code } = await transform(source, { loader: 'js', format: 'esm', target: 'chrome130', minify: true, legalComments: 'none' })
  addons.set(file, code)
}
const IMPORT = /\b(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
const importsOf = source => [...source.matchAll(IMPORT)].map(m => m[1] ?? m[2])
for (let changed = true; changed; ) {
  changed = false
  for (const [file, source] of addons) {
    const ok = importsOf(source).every(spec =>
      spec === 'three' ? true : spec.startsWith('.') ? addons.has(posix.join(posix.dirname(file), spec)) : false,
    )
    if (!ok) {
      addons.delete(file)
      changed = true
    }
  }
}
for (const [file, code] of addons) {
  const out = join(lib, 'three', 'addons', file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, code)
}

// Every npm package esbuild took code from (KaTeX also supplies the
// stylesheet and fonts), with its licence text. Some MIT packages ship no
// licence file (remark-math); theirs is the MIT text with the package author.
const MIT = readFileSync(join(here, 'LICENSE'), 'utf8').replace(/^Copyright .*$/m, 'Copyright (c) {author}')
const packages = new Map([['node_modules/d3', null], ['node_modules/lucide', null]]) // copied as they ship
for (const input of inputs) {
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
  `t3-latex bundles the following packages into mod/assets (boot.js, katex.min.css, fonts/, frame/).\n\n${notices.join('\n\n')}`,
)

const size = p => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size)
const kb = p => `${Math.round(size(p) / 1024)} KB`
console.log(`boot.js        ${kb(join(assets, 'boot.js'))}`)
console.log(`katex.min.css  ${kb(join(assets, 'katex.min.css'))}`)
console.log(`fonts          ${readdirSync(join(assets, 'fonts')).length} woff2`)
console.log(`frame/         ${kb(frame)} (runtime.js ${kb(join(frame, 'runtime.js'))}, three addons ${addons.size} files)`)
console.log(`notices        ${notices.length} packages`)
