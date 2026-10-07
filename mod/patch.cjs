// The three edits to react-markdown's code, kept apart from the loader so they
// can be tested against T3's real script without Electron.
//
// react-markdown's createProcessor reads `options.remarkPlugins || empty` and
// `options.rehypePlugins || empty` next to `options.remarkRehypeOptions`, and
// its createFile reads `options.children || ''` right before a string check.
// Minifiers rename the variables but keep those property names, so the edits
// key on them:
//
//   remarkPlugins → (…).concat(globalThis.__t3latex?.remark ?? [])
//   rehypePlugins → (…).concat(globalThis.__t3latex?.rehype ?? [])   (last,
//                   so KaTeX runs after T3's sanitiser)
//   children      → (globalThis.__t3latex?.normalize ?? (s => s))(…)
//
// Without globalThis.__t3latex (our module failed to load) each edit is a no-op.

'use strict'

const GLOBAL = 'globalThis.__t3latex'
// The match must be a whole operand: after `=`, `,`, `(`, … and not followed
// by more member access or a call.
const OPERAND_START = '(?<=[=,(:;{?]\\s*)'
const pluginsRead = name =>
  new RegExp(
    `${OPERAND_START}([\\w$]+)\\.${name}(\\|\\||\\?\\?)([\\w$]+)(?![\\w$.(\\[])(?=[^]{0,200}?\\.remarkRehypeOptions)`,
    'g',
  )
const REMARK = pluginsRead('remarkPlugins')
const REHYPE = pluginsRead('rehypePlugins')
const CHILDREN = new RegExp(
  `${OPERAND_START}([\\w$]+)\\.children(\\|\\||\\?\\?)(""|''|\`\`)(?=[^]{0,120}?typeof [\\w$]+===?["'\`]string["'\`])`,
  'g',
)

// A cheap test for "might hold react-markdown" before decoding a script.
const MARKER = 'remarkRehypeOptions'

// { out, counts }: out is the edited script, or null when the script is not
// react-markdown or not every edit applied (then serve the original).
function patchMarkdownScript(src) {
  let remark = 0
  let rehype = 0
  let children = 0
  const out = src
    .replace(REMARK, (_, o, op, d) => (remark++, `(${o}.remarkPlugins${op}${d}).concat(${GLOBAL}?.remark??[])`))
    .replace(REHYPE, (_, o, op, d) => (rehype++, `(${o}.rehypePlugins${op}${d}).concat(${GLOBAL}?.rehype??[])`))
    .replace(CHILDREN, (_, o, op, e) => (children++, `(${GLOBAL}?.normalize??(s=>s))(${o}.children${op}${e})`))
  const ok = remark > 0 && remark === rehype && rehype === children
  return { out: ok ? out : null, counts: `remark ${remark}, rehype ${rehype}, children ${children}` }
}

module.exports = { patchMarkdownScript, MARKER }
