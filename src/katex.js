// rehype-katex with a cache. It finds math the same way rehype-katex 7 does
// (remark-math's math-inline / math-display classes, and ```math fences) and
// typesets it with KaTeX. A streaming reply is re-rendered on every token, so
// each formula's result is cached by its source and cloned on reuse instead of
// running KaTeX and the HTML parser again.
//
// Each formula also carries data-markdown-copy, the attribute T3's copy handler
// reads instead of an element's text: copying a selection with math in it
// gives $…$ / $$…$$ source rather than KaTeX's glyphs.
//
// And each formula holds its source as hidden text around KaTeX's glyphs:
//   <span class="katex"><span class="t3latex-src">$x^2</span>
//     <span class="katex-html" aria-hidden="true">…glyphs…</span>
//     <span class="t3latex-src">$</span></span>
// T3's "Cite" builds the quoted text from a message's text nodes, skipping
// aria-hidden ones, and only accepts a selection whose first and last
// selected text nodes are not aria-hidden. With the source around the glyphs,
// a cited formula reads $x^2$, and a selection snapped to whole formulas
// (selection.js) always starts and ends on text T3 accepts. The source text
// also stands in for KaTeX's MathML for screen readers, which is why the
// MathML is left out: it would be read out twice, and T3 would quote it.

import katex from 'katex'
import 'katex/contrib/mhchem' // \ce{…} and \pu{…}
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import { toText } from 'hast-util-to-text'
import { SKIP, visitParents } from 'unist-util-visit-parents'

export const SOURCE_CLASS = 't3latex-src'

const CACHE_SIZE = 1000
const cache = new Map()

export const KATEX_OPTIONS = Object.freeze({
  strict: 'ignore',
  output: 'html', // glyphs only; the source text above replaces the MathML
  trust: false,
  maxExpand: 1000,
})

export default function rehypeKatexCached(options) {
  const settings = { ...KATEX_OPTIONS, ...options }
  return function (tree) {
    try {
      visitParents(tree, 'element', (element, parents) => transform(element, parents, settings))
    } catch {
      // Never take the message down with us; untouched math stays as code.
    }
  }
}

function transform(element, parents, settings) {
  const classes = Array.isArray(element.properties.className) ? element.properties.className : []
  const languageMath = classes.includes('language-math')
  const mathDisplay = classes.includes('math-display')
  const mathInline = classes.includes('math-inline')
  if (!languageMath && !mathDisplay && !mathInline) return

  let parent = parents[parents.length - 1]
  let scope = element
  let displayMode = mathDisplay
  // A ```math fence, or display math whose math-display class a sanitiser
  // stripped: replace the whole <pre> and typeset as display.
  if (element.tagName === 'code' && languageMath && parent?.type === 'element' && parent.tagName === 'pre') {
    scope = parent
    parent = parents[parents.length - 2]
    displayMode = true
  }
  if (!parent) return

  const result = typeset(toText(scope, { whitespace: 'pre' }), displayMode, settings)
  parent.children.splice(parent.children.indexOf(scope), 1, ...result)
  return SKIP
}

function typeset(tex, displayMode, settings) {
  const key = (displayMode ? 'D' : 'I') + tex
  let nodes = cache.get(key)
  if (nodes) {
    cache.delete(key) // most recently used goes last
  } else {
    nodes = render(tex, displayMode, settings)
    const source = tex.trim()
    const copy = displayMode ? `$$\n${source}\n$$\n\n` : `$${source}$`
    for (const node of nodes) {
      if (node.type !== 'element') continue
      node.properties.dataMarkdownCopy = copy
      addSource(node, displayMode, source)
    }
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value)
  }
  cache.set(key, nodes)
  return structuredClone(nodes)
}

// The hidden source text around the glyphs of a rendered formula.
function addSource(node, displayMode, source) {
  const formula = hasClass(node, 'katex') ? node : node.children.find(child => hasClass(child, 'katex'))
  if (!formula) return // KaTeX's error markup: plain text already
  const [open, close] = displayMode ? [`$$\n${source}\n`, '$$'] : [`$${source}`, '$']
  const text = value => ({
    type: 'element',
    tagName: 'span',
    properties: { className: [SOURCE_CLASS] },
    children: [{ type: 'text', value }],
  })
  formula.children.unshift(text(open))
  formula.children.push(text(close))
}

function hasClass(node, name) {
  return node.type === 'element' && Array.isArray(node.properties.className) && node.properties.className.includes(name)
}

function render(tex, displayMode, settings) {
  let html
  try {
    // A ParseError comes back as KaTeX's own red error markup.
    html = katex.renderToString(tex, { ...settings, displayMode, throwOnError: false })
  } catch (error) {
    return [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['katex-error'], title: String(error) },
        children: [{ type: 'text', value: tex }],
      },
    ]
  }
  return fromHtmlIsomorphic(html, { fragment: true }).children
}
