// The plugins appended to T3's react-markdown, in one place so the tests run
// exactly what ships. rehype-katex goes LAST, after T3's own sanitiser, or the
// sanitiser strips KaTeX's markup.

import remarkMath from 'remark-math'
import rehypeKatexCached from './katex.js'

export const remarkPlugins = [remarkMath]
export const rehypePlugins = [rehypeKatexCached]
