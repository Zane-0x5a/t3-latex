// Formulas are selected whole. T3's "Cite" gives up on a selection whose
// first or last selected text lies in KaTeX's glyphs (they are aria-hidden),
// so a selection that starts or ends inside a formula would get no Cite
// button. Once a selection is made (mouse released, or changed from the
// keyboard), an end that lands on a formula's glyphs is moved to take in the
// whole formula, out to the hidden source text katex.js puts on either side;
// an end in that source text is moved to the formula's near edge. (Where on
// the glyphs it landed does not matter: in a fraction or a matrix, the order
// of the glyphs in the page has little to do with where they are drawn.)
// T3 reads the selection a moment after the mouse is released, by which time
// it has been snapped.

import { SOURCE_CLASS } from './katex.js'

// The rendered formula a DOM position lies in, if katex.js made it.
function formulaAt(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement
  const formula = element?.closest('.katex')
  return formula?.firstElementChild?.classList.contains(SOURCE_CLASS) ? formula : null
}

// Where a position in a formula lies: before, on, or after its glyphs.
function side(formula, node, offset) {
  const glyphs = formula.querySelector(':scope > .katex-html')
  if (glyphs?.contains(node)) return 'on'
  if (node === formula) return offset <= [...formula.childNodes].indexOf(glyphs) ? 'before' : 'after'
  return formula.firstElementChild.contains(node) ? 'before' : 'after'
}

// Is there any text between two positions? (None when b is not after a.)
function textBetween(doc, [aNode, aOffset], [bNode, bOffset]) {
  const range = doc.createRange()
  range.setStart(aNode, aOffset)
  range.setEnd(bNode, bOffset)
  return range.toString() !== ''
}

// Snaps a selection's ends out to whole formulas. Returns true if it moved them.
export function snapToFormulas(selection) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  const startFormula = formulaAt(range.startContainer)
  const endFormula = formulaAt(range.endContainer)
  if (!startFormula && !endFormula) return false
  const doc = range.startContainer.ownerDocument
  const open = formula => [formula.firstElementChild.firstChild, 0]
  const close = formula => [formula.lastElementChild.firstChild, formula.lastElementChild.firstChild.length]

  let start = [range.startContainer, range.startOffset]
  let end = [range.endContainer, range.endOffset]
  if (startFormula) start = side(startFormula, ...start) === 'after' ? close(startFormula) : open(startFormula)
  if (endFormula) end = side(endFormula, ...end) === 'before' ? open(endFormula) : close(endFormula)
  // Both ends beside one formula's glyphs, on the same side: nothing to take in.
  if (!textBetween(doc, start, end)) return false
  if (start[0] === range.startContainer && start[1] === range.startOffset && end[0] === range.endContainer && end[1] === range.endOffset) {
    return false
  }

  // Keep the direction the selection was made in.
  const backward = selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset
  if (backward) selection.setBaseAndExtent(end[0], end[1], start[0], start[1])
  else selection.setBaseAndExtent(start[0], start[1], end[0], end[1])
  return true
}

// Selects from a formula to a DOM position, for a drag that started on the
// formula: from its far side, so the whole formula is in; just the formula
// when the position is inside it.
export function selectFromFormula(selection, formula, node, offset) {
  const doc = formula.ownerDocument
  const open = [formula.firstElementChild.firstChild, 0]
  const closeText = formula.lastElementChild.firstChild
  const close = [closeText, closeText.length]
  const bounds = doc.createRange()
  bounds.selectNodeContents(formula)
  const where = bounds.comparePoint(node, offset)
  if (where === 0) selection.setBaseAndExtent(...open, ...close)
  else if (where > 0) selection.setBaseAndExtent(...open, node, offset)
  else selection.setBaseAndExtent(...close, node, offset)
}

function caretAt(doc, x, y) {
  const position = doc.caretPositionFromPoint?.(x, y)
  if (position) return [position.offsetNode, position.offset]
  const range = doc.caretRangeFromPoint?.(x, y)
  return range ? [range.startContainer, range.startOffset] : null
}

// Snap selections in a window as they are made: after the mouse button is
// released and on other changes such as Shift+arrow keys, but not while an
// ordinary drag is on, which would fight the browser.
//
// A drag that starts on a formula's glyphs is handled here outright: Chromium
// does not grow a selection from a caret it placed on KaTeX's math glyphs
// (with KaTeX's own output on a plain page too), so such a drag would select
// nothing. The browser still moves its caret as the mouse moves, so after
// each move (before the next paint) and on release, the selection is set to
// run from the formula to the point under the mouse. Once the formula is
// selected, the press point lies inside the selection, and the browser would
// take the next move for dragging the selected text away; that is cancelled.
export function snapSelectionsToFormulas(win) {
  const doc = win.document
  let pressed = false
  let drag = null // { formula, x, y, moved } while a drag that began on a formula is on
  const snap = () => {
    try {
      snapToFormulas(win.getSelection())
    } catch {}
  }
  const extend = (formula, x, y) => {
    try {
      const at = caretAt(doc, x, y)
      if (at) selectFromFormula(win.getSelection(), formula, ...at)
    } catch {}
  }
  const release = e => {
    const ended = drag
    drag = null
    if (!pressed) return
    pressed = false
    // T3 reads the selection from a timer it sets on mouseup; this one is
    // set first, so it runs first.
    win.setTimeout(() => {
      if (ended?.moved) extend(ended.formula, e.clientX, e.clientY)
      snap()
    }, 0)
  }
  win.addEventListener('pointerdown', e => e.isPrimary && e.button === 0 && (pressed = true), true)
  win.addEventListener(
    'mousedown',
    e => {
      drag = null
      if (e.button !== 0 || e.detail !== 1 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const formula = e.target?.closest?.('.katex-html') && formulaAt(e.target)
      if (formula) drag = { formula, x: e.clientX, y: e.clientY, moved: false }
    },
    true,
  )
  win.addEventListener(
    'mousemove',
    e => {
      if (!drag) return
      if (!(e.buttons & 1)) return void (drag = null)
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 3) return // still a click
      drag.moved = true
      const { formula } = drag
      win.requestAnimationFrame(() => drag?.formula === formula && extend(formula, e.clientX, e.clientY))
    },
    true,
  )
  win.addEventListener('dragstart', e => drag?.moved && e.preventDefault(), true)
  win.addEventListener('pointerup', release, true)
  win.addEventListener('mouseup', release, true)
  win.addEventListener('pointercancel', () => ((pressed = false), (drag = null)), true)
  win.addEventListener('blur', () => ((pressed = false), (drag = null)))
  doc.addEventListener('selectionchange', () => pressed || snap())
}
