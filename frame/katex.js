// lib/katex.js in a visualization frame: KaTeX (with mhchem) as the global
// `katex`, its stylesheet, and every element with a data-tex attribute typeset
// as that TeX (data-display for display style), including ones added or
// changed later. runtime.js loads it when a block uses either.

import katex from 'katex'
import 'katex/contrib/mhchem'

window.katex = katex

const css = document.createElement('link')
css.rel = 'stylesheet'
css.href = new URL('../../katex.min.css', document.currentScript.src).href
document.head.append(css)

const done = new WeakMap() // element → what it shows: style and TeX

function typeset(el) {
  const tex = el.getAttribute('data-tex')
  const displayMode = el.hasAttribute('data-display')
  const key = (displayMode ? 'D' : 'I') + tex
  if (tex === null || done.get(el) === key) return
  done.set(el, key)
  try {
    katex.render(tex, el, { displayMode, throwOnError: false, strict: 'ignore' })
  } catch {
    el.textContent = tex
  }
}

function scan(node) {
  if (!(node instanceof Element)) return
  if (node.hasAttribute('data-tex')) typeset(node)
  for (const el of node.querySelectorAll('[data-tex]')) typeset(el)
}

new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes') typeset(record.target)
    else for (const node of record.addedNodes) scan(node)
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tex', 'data-display'] })

scan(document.documentElement)
