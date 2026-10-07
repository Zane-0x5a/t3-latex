// Window expression for `node dev/t3.cjs js @dev/copy-selection.js`: selects
// the last chat message and runs T3's own copy handler on it with a private
// DataTransfer (the system clipboard is not touched). Prints what a user
// would get on the clipboard; formulas should come out as $…$ / $$…$$.
(() => {
  const blocks = document.querySelectorAll('.chat-markdown')
  const md = blocks[blocks.length - 1]
  if (!md) return 'no chat message on screen'
  const selection = getSelection()
  selection.removeAllRanges()
  const range = document.createRange()
  range.selectNodeContents(md)
  selection.addRange(range)
  const data = new DataTransfer()
  md.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
  selection.removeAllRanges()
  return data.getData('text/plain') || '(nothing copied)'
})()
