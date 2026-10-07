// Selecting text that contains formulas, checked against T3's own "Cite"
// code: the function that turns a selection into a citation is taken from the
// react-markdown chunk of the T3 installed on this machine (read-only) and run
// on our rendered markdown in jsdom. A T3 update that moves or reshapes it
// fails the first test, like the react-markdown check in patch.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { selectFromFormula, snapToFormulas } from '../src/selection.js'
import { renderMarkdown } from './markdown.js'
import { T3_SERVER_ASAR } from './t3-install.js'

const require = createRequire(import.meta.url)
const installed = existsSync(T3_SERVER_ASAR)
const skip = !installed && 'T3 not installed'

// T3's selection → citation function and the helpers before it, from the
// list of elements it skips ([aria-hidden=true], …) to the function itself.
function loadT3Cite() {
  const asar = require('@electron/asar')
  const needle = 'closest(`[data-assistant-citation-source]`)'
  const sources = asar
    .listPackage(T3_SERVER_ASAR)
    .map(p => p.replace(/^[\\/]/, ''))
    .filter(p => /client[\\/]assets[\\/][^\\/]+\.js$/.test(p))
    .map(p => asar.extractFile(T3_SERVER_ASAR, p).toString('utf8'))
    .filter(s => s.includes(needle))
  assert.equal(sources.length, 1, `scripts with ${needle}`)
  const [src] = sources
  const at = src.indexOf(needle)
  const fnStart = src.lastIndexOf('function ', at)
  const name = /^function ([\w$]+)\(/.exec(src.slice(fnStart))?.[1]
  const skipList = src.lastIndexOf('[aria-hidden=true]', fnStart)
  assert.ok(name && skipList !== -1, 'citation function or its skip list not found')
  const start = src.lastIndexOf('var ', skipList)
  const end = /\}(?=function |var |let |const |export|class )/g
  end.lastIndex = at
  const stop = end.exec(src)
  assert.ok(start !== -1 && stop, 'citation code boundaries not found')
  return new Function(`${src.slice(start, stop.index + 1)}\nreturn ${name}`)()
}

const cite = installed ? loadT3Cite() : null

// A message as T3 lays it out, with the selection API of its window.
function message(md) {
  const { window } = new JSDOM(
    `<div data-assistant-citation-viewport><div data-assistant-citation-source="m1"><div class="chat-markdown">${renderMarkdown(md)}</div></div></div>`,
  )
  const doc = window.document
  const viewport = doc.querySelector('[data-assistant-citation-viewport]')
  const texts = () => {
    const walker = doc.createTreeWalker(viewport, 4 /* SHOW_TEXT */)
    const all = []
    while (walker.nextNode()) all.push(walker.currentNode)
    return all
  }
  return {
    window,
    // The text node with this text outside any formula.
    text: s => texts().find(t => t.data.includes(s) && !t.parentElement.closest('.katex')),
    // The first text node of the n-th formula's glyphs.
    glyph: n => texts().find(t => t.parentElement.closest('.katex-html') === doc.querySelectorAll('.katex-html')[n]),
    // The last one, which in a fraction is drawn at the bottom, not the end.
    lastGlyph: n => texts().findLast(t => t.parentElement.closest('.katex-html') === doc.querySelectorAll('.katex-html')[n]),
    select(anchor, anchorOffset, focus, focusOffset) {
      const selection = window.getSelection()
      selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
      return selection
    },
    // What T3 would quote, or null when it shows no Cite button.
    cited: selection => cite(viewport, selection)?.selector.text ?? null,
  }
}

const MD = '设 $x^2+1$ 为正，且 $y$ 也是。'

test('T3 has no Cite for a selection that ends on formula glyphs', { skip }, () => {
  const m = message(MD)
  const selection = m.select(m.text('设'), 0, m.glyph(0), 1)
  assert.equal(m.cited(selection), null)
})

test('snapped, a selection ending in a formula cites the whole formula as TeX', { skip }, () => {
  const m = message(MD)
  const selection = m.select(m.text('设'), 0, m.glyph(0), 1)
  assert.equal(snapToFormulas(selection), true)
  assert.equal(m.cited(selection), '设 $x^2+1$')
})

test('a selection starting in a formula', { skip }, () => {
  const m = message(MD)
  const selection = m.select(m.glyph(0), 0, m.text('为正'), 3)
  snapToFormulas(selection)
  assert.equal(m.cited(selection), '$x^2+1$ 为正')
})

test('a selection inside one formula takes the formula', { skip }, () => {
  const m = message(MD)
  const selection = m.select(m.glyph(0), 0, m.glyph(0), 1)
  snapToFormulas(selection)
  assert.equal(m.cited(selection), '$x^2+1$')
})

test('formulas inside a selection are quoted as TeX, not glyph text', { skip }, () => {
  const m = message(MD)
  const end = m.text('也是')
  const selection = m.select(m.text('设'), 0, end, end.data.indexOf('是'))
  assert.equal(snapToFormulas(selection), false) // nothing to snap
  assert.equal(m.cited(selection), '设 $x^2+1$ 为正，且 $y$ 也')
})

test('display math is quoted as $$ … $$ on its own lines', { skip }, () => {
  const m = message('前文\n\n$$\\frac{1}{2}$$\n\n后文')
  const selection = m.select(m.text('前文'), 0, m.glyph(0), 1)
  snapToFormulas(selection)
  // Blocks are separated by newlines, as T3 quotes any two paragraphs.
  assert.match(m.cited(selection), /^前文\n+\$\$\n\\frac\{1\}\{2\}\n\$\$$/)
})

test('a selection starting on any glyph of a formula takes the formula', { skip }, () => {
  const m = message('$$\\frac{1}{2}$$\n\n后文')
  const last = m.lastGlyph(0)
  const selection = m.select(last, last.length, m.text('后文'), 1)
  snapToFormulas(selection)
  assert.match(m.cited(selection), /^\$\$\n\\frac\{1\}\{2\}\n\$\$\n+后$/)
})

test('a backward selection stays backward', { skip }, () => {
  const m = message(MD)
  const start = m.text('设')
  const selection = m.select(m.glyph(0), 1, start, 0)
  snapToFormulas(selection)
  assert.equal(selection.focusNode, start)
  assert.equal(selection.focusOffset, 0)
  assert.equal(m.cited(selection), '设 $x^2+1$')
})

test('an end in a formula that takes none of its glyphs moves out of it', { skip }, () => {
  const m = message(MD)
  const close = m.window.document.querySelectorAll('.katex')[0].lastElementChild.firstChild
  const after = m.text('为正')
  const selection = m.select(close, 0, after, 3) // starts right after the glyphs
  snapToFormulas(selection)
  assert.equal(m.cited(selection), ' 为正')
})

test('selections without formulas are left alone', () => {
  const m = message('只是文字。')
  const t = m.text('只是')
  const selection = m.select(t, 0, t, 2)
  assert.equal(snapToFormulas(selection), false)
  assert.equal(selection.toString(), '只是')
})

// A drag that starts on a formula's glyphs, to a point after, before, or on it.
test('a drag from a formula forward takes the formula and the text after', { skip }, () => {
  const m = message(MD)
  const formula = m.window.document.querySelectorAll('.katex')[0]
  const selection = m.window.getSelection()
  selectFromFormula(selection, formula, m.text('为正'), 3)
  assert.equal(m.cited(selection), '$x^2+1$ 为正')
})

test('a drag from a formula backward keeps the formula at its far end', { skip }, () => {
  const m = message(MD)
  const formula = m.window.document.querySelectorAll('.katex')[1]
  const selection = m.window.getSelection()
  selectFromFormula(selection, formula, m.text('为正'), 1)
  assert.equal(m.cited(selection), '为正，且 $y$')
  assert.equal(selection.focusNode, m.text('为正')) // backward: the focus is where the mouse is
})

test('a drag that stays on its formula selects just the formula', { skip }, () => {
  const m = message(MD)
  const formula = m.window.document.querySelectorAll('.katex')[0]
  const selection = m.window.getSelection()
  selectFromFormula(selection, formula, m.lastGlyph(0), 0)
  assert.equal(m.cited(selection), '$x^2+1$')
})
