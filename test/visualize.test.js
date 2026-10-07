// ```visualize blocks: the streaming rename, and what the pipeline (as T3
// runs it, markdown.js) makes of a block.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { prepareVisualize as mark } from '../src/visualize.js'
import { renderMarkdown as html } from './markdown.js'

const same = s => assert.equal(mark(s), s)

test('a closed block, other fences and plain text are left alone', () => {
  same('```visualize\n<div></div>\n```')
  same('```visualize\n<div></div>\n```\n\nafter')
  same('~~~visualize\n<div></div>\n~~~')
  same('```js\nconst a = 1')
  same('we could visualize this')
  same('```visualizer\n<div>')
  assert.equal(mark(undefined), undefined)
})

test('a block without its closing fence becomes visualize-pending', () => {
  assert.equal(mark('text\n\n```visualize\n<div>'), 'text\n\n```visualize-pending\n<div>')
  assert.equal(mark('```visualize'), '```visualize-pending')
  assert.equal(mark('~~~ visualize\n<p>'), '~~~ visualize-pending\n<p>')
  assert.equal(mark('> ```visualize\n> <p>'), '> ```visualize-pending\n> <p>')
  // A shorter fence does not close it; a different fence character neither.
  assert.equal(mark('````visualize\n```\n<p>'), '````visualize-pending\n```\n<p>')
  assert.equal(mark('```visualize\n~~~\n<p>'), '```visualize-pending\n~~~\n<p>')
  // Only the last, unclosed block is renamed.
  assert.equal(
    mark('```visualize\n<a>\n```\n\n```visualize\n<b>'),
    '```visualize\n<a>\n```\n\n```visualize-pending\n<b>',
  )
})

test('a block shown as an example inside another fence is not a block', () => {
  same('````markdown\n```visualize\n<div>\n````')
})

function vizElements(md) {
  const { document } = new JSDOM(html(md)).window
  return [...document.querySelectorAll('t3latex-viz')]
}

test('a block becomes <t3latex-viz> with its HTML in data-source', () => {
  const source = '<div id="root" class="viz-controls">\n  <input type="range">\n</div>\n<script>\n  const n = `${1 + 1}`\n</script>'
  const [viz, ...more] = vizElements(`看这个：\n\n\`\`\`visualize\n${source}\n\`\`\`\n\n结论。`)
  assert.equal(more.length, 0)
  assert.equal(viz.getAttribute('data-source'), source)
  assert.equal(viz.getAttribute('data-markdown-copy'), `\`\`\`visualize\n${source}\n\`\`\`\n\n`)
  assert.equal(viz.children.length, 0) // the HTML is data, not markup in the page
})

test("the block's code keeps every $ and backslash the math normaliser would touch", () => {
  const source = '<p>$5 and $10</p>\n<span data-tex="\\frac{a}{b}"></span>\n<script>const s = `$${x}` + "\\(y\\)" + "$$z$$"</script>'
  const [viz] = vizElements(`公式 $E = mc^2$ 和价格 $5：\n\n\`\`\`visualize\n${source}\n\`\`\``)
  assert.equal(viz.getAttribute('data-source'), source)
  assert.match(html(`公式 $E = mc^2$\n\n\`\`\`visualize\n<p></p>\n\`\`\``), /class="katex"/)
})

test('a block that is still streaming becomes a placeholder', () => {
  const [viz] = vizElements('先说明。\n\n```visualize\n<div id="a">\n<script>let x')
  assert.equal(viz.getAttribute('data-source'), null)
  assert.equal(viz.getAttribute('data-pending'), String('<div id="a">\n<script>let x'.length))
})

test('blocks inside lists keep their place; ```html is still code', () => {
  const out = html('1. 第一步\n\n   ```visualize\n   <p>a</p>\n   ```\n\n```html\n<p>b</p>\n```')
  const { document } = new JSDOM(out).window
  assert.equal(document.querySelector('li t3latex-viz')?.getAttribute('data-source'), '<p>a</p>')
  assert.ok(document.querySelector('pre code.language-html'))
})

// Codex's form: a line pointing at an HTML file.

test('a file line becomes <t3latex-viz> with the path in data-file', () => {
  const line = 'visualize{"path":"C:/Users/me/.codex/visualizations/2026/09/26/t/gauss-law.html"}'
  const [viz, ...more] = vizElements(`拖动滑块看看。\n\n${line}\n\n**结论**：只看里面的电荷。`)
  assert.equal(more.length, 0)
  assert.equal(viz.getAttribute('data-file'), 'C:/Users/me/.codex/visualizations/2026/09/26/t/gauss-law.html')
  assert.equal(viz.getAttribute('data-markdown-copy'), `${line}\n\n`)
  assert.equal(viz.getAttribute('data-source'), null)
})

test("a file line keeps a Windows path's backslashes, escaped or not; title and mode are read", () => {
  // In these JS strings \\\\ is an escaped backslash in the JSON, \\ a bare one.
  const [a] = vizElements('visualize{"path":"C:\\\\Users\\\\me\\\\new\\\\a.html","title":"Field","mode":"wide"}')
  assert.equal(a.getAttribute('data-file'), 'C:\\Users\\me\\new\\a.html')
  assert.equal(a.getAttribute('data-title'), 'Field')
  const [b] = vizElements('visualize{"path":"C:\\Users\\me\\new\\b.html"}')
  assert.equal(b.getAttribute('data-file'), 'C:\\Users\\me\\new\\b.html')
})

test('a file line right after text, in backticks, in a list or a quote still counts', () => {
  const path = '/home/me/viz.html'
  for (const md of [
    `Drag the charge.\nvisualize{"path":"${path}"}\nThe flux stays.`,
    `\`visualize{"path":"${path}"}\``,
    `1. step\n\n   visualize{"path":"${path}"}`,
    `> visualize{"path":"${path}"}`,
  ]) {
    const found = vizElements(md)
    assert.equal(found.length, 1, md)
    assert.equal(found[0].getAttribute('data-file'), path, md)
  }
})

test('file lines that are not one stay text: inside code, mid-sentence, without a path, not JSON', () => {
  same('```text\nvisualize{"path":"/a.html"}\n```')
  for (const md of [
    'use visualize{"path":"/a.html"} to show it',
    'visualize{"title":"no path"}',
    'visualize{path: /a.html}',
    'visualize{"path":"/a.html"} and more',
  ]) {
    assert.equal(vizElements(md).length, 0, md)
  }
  assert.equal(vizElements('    visualize{"path":"/a.html"}').length, 0) // indented code
})

test('a file line still streaming at the end becomes a placeholder; complete, it is the file', () => {
  assert.equal(mark('看这里：\n\nvisualize{"path":"C:/Us'), '看这里：\n\n```visualize-pending\n```')
  const [viz] = vizElements('看这里：\n\nvisualize{"path":"C:/Us')
  assert.equal(viz.getAttribute('data-pending'), '0')
  // Not at the end, a broken line is left as text.
  same('visualize{"path":"C:/Us\n\nmore')
  assert.equal(vizElements('visualize{"path":"C:/a.html"}')[0].getAttribute('data-file'), 'C:/a.html')
})

test('both forms in one reply, and a path holding backticks', () => {
  const out = vizElements('```visualize\n<p>a</p>\n```\n\nvisualize{"path":"/x/`odd`.html"}')
  assert.deepEqual(
    out.map(v => [v.getAttribute('data-source'), v.getAttribute('data-file')]),
    [['<p>a</p>', null], [null, '/x/`odd`.html']],
  )
})

// As Codex actually writes it: U+E200 visualize U+E202 {…} U+E201.
const MARKED = '\uE200visualize\uE202{"path":"D:/p/scratch/output/fourier-square-wave.html"}\uE201'

test("Codex's marked file line, right after a line of text, becomes the file", () => {
  const [viz, ...more] = vizElements(`上图是最新加入的一项，下图是所有项相加的结果。\n${MARKED}\n项数越多，平台越平。`)
  assert.equal(more.length, 0)
  assert.equal(viz.getAttribute('data-file'), 'D:/p/scratch/output/fourier-square-wave.html')
  assert.equal(viz.getAttribute('data-markdown-copy'), 'visualize{"path":"D:/p/scratch/output/fourier-square-wave.html"}\n\n')
  assert.equal(vizElements(`> ${MARKED}`).length, 1)
})

test('a marked line still streaming is a placeholder from its first mark; a citation is not', () => {
  for (const cut of [1, 5, 10, 11, 30, MARKED.length - 3]) {
    const [viz] = vizElements(`文字。\n\n${MARKED.slice(0, cut)}`)
    assert.equal(viz?.getAttribute('data-pending'), '0', JSON.stringify(MARKED.slice(0, cut)))
  }
  // The JSON whole, the closing mark not yet there: already the file.
  assert.ok(vizElements(MARKED.slice(0, -1))[0].getAttribute('data-file').endsWith('fourier-square-wave.html'))
  assert.equal(vizElements('\uE200cite\uE202turn0search0').length, 0)
  same('\uE200cite\uE202turn0search0\uE201')
})
