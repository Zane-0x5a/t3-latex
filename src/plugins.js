// The plugins appended to T3's react-markdown and the pass its markdown goes
// through first, in one place so the tests run exactly what ships. rehype-katex
// goes LAST, after T3's own sanitiser, or the sanitiser strips KaTeX's markup;
// so does the visualization block, whose element the sanitiser does not know.

import remarkMath from 'remark-math'
import rehypeKatexCached from './katex.js'
import { normalizeDelimiters } from './normalize.js'
import { prepareVisualize, rehypeVisualize } from './visualize.js'

export const remarkPlugins = [remarkMath]
export const rehypePlugins = [rehypeVisualize, rehypeKatexCached]

export function normalizeMarkdown(markdown) {
  return normalizeDelimiters(prepareVisualize(markdown))
}
