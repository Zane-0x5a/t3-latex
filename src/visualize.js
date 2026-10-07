// Interactive visualizations in T3's chat. A reply carries one in either of two
// forms:
//
//   ```visualize                       the HTML itself, in a fenced block (the
//   <div class="viz-controls">…</div>  form skill/t3-visualize teaches Claude)
//   <script>…</script>
//   ```
//
//   visualize{"path":"C:/…/gauss-law.html"}
//                                      a line pointing at an HTML file on disk,
//                                      as Codex's visualize plugin writes them
//                                      (Codex wraps it in private-use marks:
//                                      U+E200 visualize U+E202 {…} U+E201)
//
// rehypeVisualize turns either into a <t3latex-viz> element (viz-element.js),
// which shows the HTML in a sandboxed frame (frame/).
//
// prepareVisualize runs on the markdown first. It rewrites a file line into a
// ```visualize-file block, whose text then reaches the rehype step exactly as
// written (in a paragraph, markdown would eat the backslashes of a Windows
// path). A streaming reply shows a block before its closing fence arrives, and
// a file line before it is complete: both become ```visualize-pending, a
// placeholder instead of a frame that would reload on every token.

import { toText } from 'hast-util-to-text'
import { SKIP, visitParents } from 'unist-util-visit-parents'

export const VIZ_TAG = 't3latex-viz'
const LANG = 'visualize'
const FILE_LANG = 'visualize-file'
const PENDING_LANG = 'visualize-pending'
const OPEN_MARK = '\uE200'
const SEP_MARK = '\uE202'
const CLOSE_MARK = '\uE201'

// What opens a line before a fence: blockquote markers and indentation.
const PREFIX = /^(?:[ \t]{0,3}>[ \t]?)*[ \t]*/
const FENCE_OPEN = /^(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/
const FENCE_CLOSE = /^(`{3,}|~{3,})[ \t]*$/

// {"path": …, "title"?: …} from the JSON of a file line, or null.
export function parseReference(json) {
  let value = null
  try {
    value = JSON.parse(json)
  } catch {
    // Backslashes left unescaped, as in a Windows path written by hand.
    try {
      value = JSON.parse(json.replace(/\\\\|\\"|\\/g, m => (m === '\\' ? '\\\\' : m)))
    } catch {}
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const path = typeof value.path === 'string' ? value.path.trim() : ''
  if (!path) return null
  return { path, title: typeof value.title === 'string' ? value.title.trim() : '' }
}

// The JSON of a file line (also taken in backticks or Codex's marks), or null.
function referenceIn(body) {
  let text = body.trim()
  if (text.length > 2 && text.startsWith('`') && text.endsWith('`')) text = text.slice(1, -1).trim()
  // (While streaming, the JSON can be complete before the closing mark.)
  if (text.startsWith(OPEN_MARK)) text = text.slice(1)
  if (text.endsWith(CLOSE_MARK)) text = text.slice(0, -1)
  if (!text.startsWith(LANG)) return null
  text = text.slice(LANG.length)
  if (text.startsWith(SEP_MARK)) text = text.slice(1)
  if (!text.startsWith('{') || !text.endsWith('}')) return null
  return parseReference(text) ? text : null
}

// Is this, the reply's last line, a file line still coming in? Marked, from
// its first mark; unmarked, once it is into the JSON.
function streamingReference(body) {
  let text = body.trim().replace(/^`/, '')
  if (text.includes('}') || text.includes(CLOSE_MARK)) return false
  const marked = text.startsWith(OPEN_MARK)
  if (marked) text = text.slice(1)
  const head = `${LANG}${marked ? SEP_MARK : ''}{`
  return text.length >= head.length ? text.startsWith(head) : marked && head.startsWith(text)
}

function fenced(prefix, lang, content) {
  const longest = Math.max(0, ...(content.match(/`+/g) || []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return content
    ? `${prefix}${fence}${lang}\n${prefix}${content}\n${prefix}${fence}`
    : `${prefix}${fence}${lang}\n${prefix}${fence}`
}

export function prepareVisualize(markdown) {
  if (typeof markdown !== 'string' || !(markdown.includes(LANG) || markdown.includes(OPEN_MARK))) return markdown
  const edits = [] // { from, to, text }, in order
  let open = null
  let pos = 0
  for (;;) {
    const end = markdown.indexOf('\n', pos)
    const last = end < 0
    const line = markdown.slice(pos, last ? markdown.length : end)
    const prefix = PREFIX.exec(line)[0]
    const body = line.slice(prefix.length)
    if (!open) {
      const m = FENCE_OPEN.exec(body)
      // A backtick fence's info string may not hold a backtick.
      if (m && !(m[1][0] === '`' && m[3].includes('`'))) {
        open = { ch: m[1][0], len: m[1].length, viz: m[2] === LANG, at: pos + prefix.length + m[1].length }
      } else if (body.includes(LANG) || body.includes(OPEN_MARK)) {
        const json = referenceIn(body)
        if (json) edits.push({ from: pos, to: pos + line.length, text: fenced(prefix, FILE_LANG, json) })
        else if (last && streamingReference(body)) {
          edits.push({ from: pos, to: pos + line.length, text: fenced(prefix, PENDING_LANG, '') })
        }
      }
    } else {
      const m = FENCE_CLOSE.exec(body)
      if (m && m[1][0] === open.ch && m[1].length >= open.len) open = null
    }
    if (last) break
    pos = end + 1
  }
  if (open?.viz) {
    const at = markdown.indexOf(LANG, open.at)
    edits.push({ from: at, to: at + LANG.length, text: PENDING_LANG })
  }
  if (!edits.length) return markdown
  let out = ''
  let at = 0
  for (const edit of edits) {
    out += markdown.slice(at, edit.from) + edit.text
    at = edit.to
  }
  return out + markdown.slice(at)
}

// <pre><code class="language-visualize">…</code></pre> → <t3latex-viz data-source="…">,
// a file block → <t3latex-viz data-file="<path>">, and a pending block →
// <t3latex-viz data-pending="<characters so far>">.
export function rehypeVisualize() {
  return function (tree) {
    try {
      visitParents(tree, 'element', transform)
    } catch {
      // Leave the block as code rather than take the message down.
    }
  }
}

function transform(pre, parents) {
  if (pre.tagName !== 'pre') return
  const code = pre.children.find(child => child.type === 'element')
  const classes = code?.tagName === 'code' && Array.isArray(code.properties.className) ? code.properties.className : []
  const lang = [LANG, FILE_LANG, PENDING_LANG].find(name => classes.includes(`language-${name}`))
  if (!lang) return
  const parent = parents[parents.length - 1]
  if (!parent) return

  const source = toText(code, { whitespace: 'pre' }).replace(/\n$/, '')
  let properties
  if (lang === PENDING_LANG) properties = { dataPending: String(source.length) }
  else if (lang === LANG) {
    properties = {
      dataSource: source,
      // What T3's copy handler puts on the clipboard for this block.
      dataMarkdownCopy: `\`\`\`${LANG}\n${source}\n\`\`\`\n\n`,
    }
  } else {
    const reference = parseReference(source)
    if (!reference) return
    properties = { dataFile: reference.path, dataMarkdownCopy: `${LANG}${source}\n\n` }
    if (reference.title) properties.dataTitle = reference.title
  }
  parent.children.splice(parent.children.indexOf(pre), 1, { type: 'element', tagName: VIZ_TAG, properties, children: [] })
  return SKIP
}
