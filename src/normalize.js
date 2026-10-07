// Normalise the TeX delimiters models write into the two forms remark-math
// reads: inline math as $…$, and display math as a fenced block
//
//   $$
//   …
//   $$
//
// remark-math v6 reads a one-line $$…$$ as INLINE math and ignores \(…\), \[…\]
// and a bare \begin{align}; models write all of those. It also pairs any two $
// the way a code span pairs backticks, so "$5 and $10" would become math. This
// pass runs on the raw message before remark parses it:
//
//   • code fences, code spans and escaped \$ are left alone;
//   • $$…$$, \[…\] and a bare display environment become a fenced block, kept
//     inside the list item or blockquote they were written in;
//   • \(…\) becomes $…$;
//   • a $…$ pair is kept only when it reads as math (pandoc's rule, plus a check
//     for prices in Chinese prose); every other $ is escaped as \$;
//   • a $$ or \[ that is not closed yet is left as text, so a reply that is
//     still streaming does not swallow what follows.

// Environments models write with no $$ around them. Each becomes display math.
const DISPLAY_ENVS = new Set([
  'align', 'align*', 'aligned', 'alignat', 'alignat*', 'alignedat',
  'gather', 'gather*', 'gathered', 'equation', 'equation*',
  'multline', 'multline*', 'split', 'CD',
  'cases', 'dcases', 'rcases', 'array', 'darray',
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix',
])

// What opens a line before its content: blockquote markers, indentation and a
// list marker. Display blocks are re-indented with it.
const CONTAINER = /^((?:[ \t]{0,3}>[ \t]?)*)([ \t]*)((?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$))?/
const QUOTE_MARKER = /^[ \t]{0,3}>[ \t]?/
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE = /^(`{3,}|~{3,})[ \t]*$/
// A line holding only whitespace (or only blockquote markers) ends a paragraph.
const BLANK_LINE = /\n[ \t>]*(?=\n|$)/g
const SPECIAL = /[$\\`\n]/g
const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/
const CJK_PUNCT = /[　-〿！-／：-＠［-｀｛-･]/
const TEXT_ARG = /\\(?:text[a-z]*|mbox|hbox|mathrm|operatorname\*?)\s*\{[^{}]*\}/g
const MATHY = /[\\^_={}]/
const LABEL = /\\label\s*\{[^{}]*\}/g
// Punctuation that may follow a display formula on its closing line.
const TAIL_PUNCT = /^[ \t]*([.,;:，。；：、]+)[ \t]*$/
// \[…\] that is really a citation or a bracketed word, not math.
const NOT_DISPLAY = /^[\s\d.,;:–-]*$|^[A-Za-z][A-Za-z ]+$/

const memo = new Map()

export function normalizeDelimiters(src) {
  if (typeof src !== 'string' || (src.indexOf('$') < 0 && src.indexOf('\\') < 0)) return src
  let out = memo.get(src)
  if (out === undefined) {
    out = normalize(src)
    // A streaming reply re-renders on every token; keep the recent results.
    if (memo.size >= 64) memo.delete(memo.keys().next().value)
    memo.set(src, out)
  }
  return out
}

function normalize(input) {
  const src = input.includes('\r') ? input.replace(/\r\n?/g, '\n') : input
  const n = src.length
  const fences = fenceRegions(src)
  let f = 0 // the next fence region
  let out = ''
  let i = 0
  let lineStart = 0
  let line = null

  const limit = () => (f < fences.length ? fences[f].start : n)
  const lineOf = () => (line && line.start === lineStart ? line : (line = container(src, lineStart)))
  const lineEndFrom = k => {
    const e = src.indexOf('\n', k)
    return e < 0 ? n : e
  }
  // Copy src up to `to` unchanged.
  const copyTo = to => {
    const nl = src.lastIndexOf('\n', to - 1)
    if (nl >= i) lineStart = nl + 1
    out += src.slice(i, to)
    i = to
  }
  // Continue at `to`, after text that was consumed and rewritten.
  const jumpTo = to => {
    const nl = src.lastIndexOf('\n', to - 1)
    if (nl >= i) lineStart = nl + 1
    i = to
  }

  while (i < n) {
    if (f < fences.length && i === fences[f].start) {
      copyTo(fences[f].end)
      f++
      continue
    }
    SPECIAL.lastIndex = i
    const m = SPECIAL.exec(src)
    const stop = Math.min(m ? m.index : n, limit())
    if (stop > i) {
      copyTo(stop)
      continue
    }
    const c = src[i]
    if (c === '\n') {
      out += c
      i++
      lineStart = i
    } else if (c === '`') codeSpan()
    else if (c === '$') src[i + 1] === '$' ? displayDollars() : inlineDollar()
    else backslash()
  }
  return out

  function codeSpan() {
    let r = 1
    while (src[i + r] === '`') r++
    const end = paraEnd(src, i, limit())
    let k = i + r
    while (k < end) {
      const s = src.indexOf('`', k)
      if (s < 0 || s >= end) break
      let e = s
      while (src[e] === '`') e++
      if (e - s === r) return copyTo(e)
      k = e
    }
    copyTo(i + r) // an unmatched run is literal backticks
  }

  function inlineDollar() {
    const close = dollarClose(i + 1, Math.min(lineEndFrom(i), limit()))
    if (close > 0 && readsAsMath(src.slice(i + 1, close), src[close + 1])) {
      out += '$' + inlineTex(src.slice(i + 1, close), inTable()) + '$'
      jumpTo(close + 1)
    } else {
      out += '\\$'
      i++
    }
  }

  // The first unescaped $ after an opener is its only possible closer.
  function dollarClose(from, end) {
    for (let k = from; k < end; k++) {
      if (src[k] === '\\') {
        if (src[k + 1] === '$') return -1 // remark-math would close on it
        k++
      } else if (src[k] === '$') return k
    }
    return -1
  }

  function displayDollars() {
    const end = paraEnd(src, i, limit())
    let k = i + 2
    for (;;) {
      const s = src.indexOf('$$', k)
      if (s < 0 || s >= end) break
      if (src[s - 1] === '\\') {
        k = s + 1
        continue
      }
      if (displayBlock(src.slice(i + 2, s), s + 2)) return
      break
    }
    out += '\\$\\$'
    i += 2
  }

  function backslash() {
    const next = src[i + 1]
    if (next === '(' || next === '[') {
      const closer = next === '(' ? '\\)' : '\\]'
      const close = src.indexOf(closer, i + 2)
      if (close >= 0 && close < paraEnd(src, i, limit())) {
        const tex = src.slice(i + 2, close)
        if (next === '(' && tex.trim()) {
          out += '$' + inlineTex(tex, inTable()) + '$'
          return jumpTo(close + 2)
        }
        if (next === '[' && !NOT_DISPLAY.test(tex.trim()) && displayBlock(tex, close + 2)) return
      }
    } else if (next === 'b' && i === lineOf().contentStart && bareEnvironment()) return
    // Anything else: copy it, together with the character it escapes.
    const step = next && /[!-/:-@[-`{-~]/.test(next) ? 2 : 1
    out += src.slice(i, i + step)
    i += step
  }

  function bareEnvironment() {
    const m = /^\\begin\{([A-Za-z]+\*?)\}/.exec(src.slice(i, i + 40))
    if (!m || !DISPLAY_ENVS.has(m[1])) return false
    const open = `\\begin{${m[1]}}`
    const close = `\\end{${m[1]}}`
    const end = paraEnd(src, i, limit())
    let depth = 0
    let k = i
    while (k < end) {
      const a = src.indexOf(open, k)
      const b = src.indexOf(close, k)
      if (b < 0 || b >= end) return false
      if (a >= 0 && a < b) {
        depth++
        k = a + open.length
      } else {
        depth--
        k = b + close.length
        if (depth === 0) break
      }
    }
    if (depth !== 0) return false
    // Followed by prose on the same line, it was meant inline; leave it.
    const tail = src.slice(k, lineEndFrom(k))
    if (tail.trim() && !TAIL_PUNCT.test(tail)) return false
    return displayBlock(src.slice(i, k), k)
  }

  // Emit `tex` as a display block in place of src[i, after). False if empty.
  function displayBlock(tex, after) {
    const ln = lineOf()
    if (inTable()) {
      // A table cell cannot hold a block; keep it inline at display size.
      if (!tex.trim()) return false
      out += '$\\displaystyle ' + inlineTex(tex, true) + '$'
      jumpTo(after)
      return true
    }
    const lines = tex
      .replace(LABEL, '')
      .split('\n')
      .map((l, k) => (k ? stripQuotes(l, ln.depth) : l).trim())
      .filter(Boolean)
    if (!lines.length) return false
    // Punctuation after the closer belongs to the sentence the formula ends.
    const lineEnd = lineEndFrom(after)
    const tail = src.slice(after, lineEnd)
    const punct = TAIL_PUNCT.exec(tail)
    if (punct) lines[lines.length - 1] += [...punct[1]].map(p => (CJK_PUNCT.test(p) ? `\\text{${p}}` : p)).join('')
    // Text before the opener stays a paragraph of its own.
    if (hasContent(out)) out = out.replace(/[ \t]+$/, '') + '\n' + ln.prefix
    out += '$$\n' + lines.map(l => ln.prefix + l).join('\n') + '\n' + ln.prefix + '$$'
    if (punct || !tail.trim()) return jumpTo(lineEnd), true
    // Text after the closer starts a new paragraph line in the same container.
    out += '\n' + ln.prefix
    jumpTo(after + (tail.length - tail.trimStart().length))
    return true
  }

  function inTable() {
    return src[lineOf().contentStart] === '|'
  }
}

// Inline TeX for $…$: one line, no \label, and no bare | inside a table row
// (GFM would split the cell there).
function inlineTex(tex, table) {
  let s = tex.replace(LABEL, '').replace(/\s*\n\s*/g, ' ')
  if (table) s = s.replace(/\\\|/g, '\\Vert ').replace(/\|/g, '\\vert ')
  return s.trim()
}

// Does the text between a $ pair read as math rather than prose with prices?
function readsAsMath(tex, after) {
  if (!tex.trim() || /\d/.test(after || '')) return false
  const spaced = /\s/.test(tex[0]) || /\s/.test(tex[tex.length - 1])
  if (spaced && !MATHY.test(tex)) return false
  const bare = tex.replace(TEXT_ARG, '')
  if (CJK_PUNCT.test(bare)) return false
  if (/^\s*\d/.test(tex) && CJK.test(bare)) return false
  return true
}

function container(src, start) {
  const e = src.indexOf('\n', start)
  const text = src.slice(start, e < 0 ? src.length : e)
  const m = CONTAINER.exec(text)
  const depth = (m[1].match(/>/g) || []).length
  return {
    start,
    depth,
    contentStart: start + m[0].length,
    prefix: '> '.repeat(depth) + m[2].replace(/\t/g, '    ') + ' '.repeat((m[3] || '').length),
  }
}

// Whether the output's current line has text after its container.
function hasContent(out) {
  const ln = out.slice(out.lastIndexOf('\n') + 1)
  return ln.slice(CONTAINER.exec(ln)[0].length).trim() !== ''
}

function stripQuotes(line, depth) {
  let s = line
  for (let d = 0; d < depth; d++) {
    const m = QUOTE_MARKER.exec(s)
    if (!m) break
    s = s.slice(m[0].length)
  }
  return s
}

// The end of the paragraph that src[from] is in (a blank line), capped at limit.
function paraEnd(src, from, limit) {
  BLANK_LINE.lastIndex = from
  const m = BLANK_LINE.exec(src)
  return Math.min(m ? m.index : src.length, limit)
}

// [start, end) of every fenced code block. An unclosed fence (a reply still
// streaming) runs to the end.
function fenceRegions(src) {
  const regions = []
  if (src.indexOf('```') < 0 && src.indexOf('~~~') < 0) return regions
  let open = null
  let pos = 0
  for (;;) {
    const e = src.indexOf('\n', pos)
    const text = src.slice(pos, e < 0 ? src.length : e)
    const body = text.slice(CONTAINER.exec(text)[0].length)
    if (!open) {
      const m = FENCE_OPEN.exec(body)
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) open = { start: pos, ch: m[1][0], len: m[1].length }
    } else {
      const m = FENCE_CLOSE.exec(body)
      if (m && m[1][0] === open.ch && m[1].length >= open.len) {
        regions.push({ start: open.start, end: e < 0 ? src.length : e + 1 })
        open = null
      }
    }
    if (e < 0) break
    pos = e + 1
  }
  if (open) regions.push({ start: open.start, end: src.length })
  return regions
}
