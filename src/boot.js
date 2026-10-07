// Runs in T3's window, loaded from t3code://app/__t3latex/boot.js before T3's
// own scripts. It publishes what the edited react-markdown reads: the math
// plugins to append and the delimiter normaliser. If this module fails to
// load, react-markdown finds nothing here and renders as it always did.
// It also makes selections take in whole formulas, so T3's "Cite" works on
// them (selection.js), and defines the element that shows ```visualize
// blocks (viz-element.js).

import { remarkPlugins, rehypePlugins, normalizeMarkdown } from './plugins.js'
import { snapSelectionsToFormulas } from './selection.js'
import { defineVizElement } from './viz-element.js'

function normalize(markdown) {
  try {
    return normalizeMarkdown(markdown)
  } catch {
    return markdown
  }
}

globalThis.__t3latex = Object.freeze({ remark: remarkPlugins, rehype: rehypePlugins, normalize })

try {
  snapSelectionsToFormulas(window)
} catch {}
try {
  defineVizElement(window)
} catch {}
