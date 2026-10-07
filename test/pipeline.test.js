// The whole pipeline as T3 runs it (see markdown.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { normalizeDelimiters } from '../src/normalize.js'
import { renderMarkdown as html } from './markdown.js'

const count = (s, needle) => s.split(needle).length - 1
function math(md) {
  const out = html(md)
  const display = count(out, 'class="katex-display"')
  return {
    out,
    display,
    inline: count(out, 'class="katex"') - display,
    errors: count(out, 'katex-error'),
  }
}
function expectMath(md, inline, display) {
  const r = math(md)
  assert.equal(r.errors, 0, `KaTeX error in:\n${r.out}`)
  assert.deepEqual({ inline: r.inline, display: r.display }, { inline, display }, r.out)
  return r.out
}

// The seven cases verify/index.html checked by eye, now checked here.
test('inline and display with $ and $$', () => {
  expectMath(
    '二次方程 $ax^2 + bx + c = 0$（其中 $a \\neq 0$）的解为：\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n其中判别式 $\\Delta = b^2 - 4ac$ 决定根的个数。',
    3,
    1,
  )
})

test('GPT-style \\( \\) and \\[ \\]', () => {
  expectMath(
    "由链式法则，\\(\\frac{d}{dx} f(g(x)) = f'(g(x))\\,g'(x)\\)。对高斯积分：\n\n\\[ \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi} \\]",
    1,
    1,
  )
})

test('bare align environment', () => {
  expectMath('\\begin{align}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n        &= a^2 + b^2 + 2ab\n\\end{align}', 0, 1)
})

test('matrices and limits', () => {
  expectMath(
    '旋转矩阵 $R(\\theta) = \\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$，\n\n而 $$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}, \\qquad \\lim_{x \\to 0} \\frac{\\sin x}{x} = 1.$$',
    1,
    1,
  )
})

test('escaped braces and subscripts survive markdown', () => {
  const out = expectMath('集合 $A = \\{x \\in \\mathbb{R} : x_1^2 + x_2^2 \\le 1\\}$，梯度 $\\nabla_\\theta J(\\theta)$。', 2, 0)
  assert.ok(out.includes('<span class="t3latex-src">$A = \\{x'), out)
})

test('prices are not math', () => {
  const out = expectMath('这本书 $5，那本 $10，一共 $15。另外 `$PATH` 是环境变量。', 0, 0)
  assert.ok(out.includes('这本书 $5，那本 $10，一共 $15。'), out)
  assert.ok(out.includes('<code>$PATH</code>'), out)
})

test('markdown around the math is intact', () => {
  const out = expectMath(
    '**要点**：\n\n- 损失函数 $L = \\frac{1}{n}\\sum_i (y_i - \\hat{y}_i)^2$\n- 代码里的 `$x$` 保持原样\n- 下面代码块不渲染：\n\n```python\nprint(f"$x = {x}$")  # $$ 不该变成公式\n```\n',
    1,
    0,
  )
  assert.ok(out.includes('<strong>要点</strong>'), out)
  assert.ok(out.includes('<code>$x$</code>'), out)
  assert.ok(out.includes('print(f"$x = {x}$")  # $$ 不该变成公式'), out)
})

test('math that starts with a digit', () => {
  expectMath('$2x+1$', 1, 0)
})

test('a price and math on one line', () => {
  const out = expectMath('costs $5 and $x$ is', 1, 0)
  assert.ok(out.includes('costs $5 and'), out)
})

test('display math inside a list item', () => {
  const out = expectMath('- 公式 $$x^2$$\n- 下一项', 0, 1)
  assert.equal(count(out, '<li>'), 2, out)
  assert.match(out, /<li>[^]*?katex-display[^]*?<\/li>\s*<li>/)
})

test('display math inside a blockquote', () => {
  const out = expectMath('> 引用 $$x^2$$\n> 之后', 0, 1)
  assert.match(out, /<blockquote>[^]*katex-display[^]*之后[^]*<\/blockquote>/)
})

test('math with pipes in a table', () => {
  const out = expectMath('| a | b |\n|---|---|\n| $|x|$ | $\\|v\\|$ |', 2, 0)
  assert.equal(count(out, '<td>'), 2, out)
})

test('\\label in an equation is dropped instead of failing', () => {
  expectMath('\\begin{equation}\nE = mc^2 \\label{eq:1}\n\\end{equation}', 0, 1)
})

test('```math fences render as display math', () => {
  expectMath('```math\n\\int_0^1 x\\,dx\n```', 0, 1)
})

test('chemistry with \\ce', () => {
  expectMath('水是 $\\ce{H2O}$，反应 $$\\ce{2H2 + O2 -> 2H2O}$$', 1, 1)
})

test('each formula carries its source for T3 copy handler', () => {
  const out = html('设 $a<b$ 且\n\n$$\\frac{1}{2}$$')
  assert.ok(out.includes('data-markdown-copy="$a<b$"'), out)
  assert.ok(out.includes('data-markdown-copy="$$\n\\frac{1}{2}\n$$\n\n"'), out)
})

test('each formula holds its source as hidden text around aria-hidden glyphs', () => {
  const { document } = new JSDOM(html('设 $a<b$ 且\n\n$$\\frac{1}{2}$$\n\n$\\ce{H2O}$')).window
  const formulas = [...document.querySelectorAll('.katex')]
  assert.equal(formulas.length, 3)
  const sources = formulas.map(f => {
    const kids = [...f.children]
    assert.deepEqual(
      kids.map(k => k.className),
      ['t3latex-src', 'katex-html', 't3latex-src'],
      f.outerHTML.slice(0, 200),
    )
    assert.equal(kids[1].getAttribute('aria-hidden'), 'true')
    return kids[0].textContent + kids[2].textContent
  })
  assert.deepEqual(sources, ['$a<b$', '$$\n\\frac{1}{2}\n$$', '$\\ce{H2O}$'])
  assert.equal(document.querySelector('.katex-mathml'), null)
})

test('broken TeX shows KaTeX error markup, not a crash', () => {
  const r = math('$\\frac{a}{$ and $\\notacommand$')
  assert.ok(r.errors >= 1, r.out)
})

const LONG = [
  '设 $f(x) = x^2$，则 $f\'(x) = 2x$。价格 $5 不是公式。',
  '',
  '$$\n\\int_0^1 f(x)\\,dx = \\frac{1}{3}\n$$',
  '',
  '由 \\(a^2 + b^2 = c^2\\) 得：',
  '',
  '\\[ c = \\sqrt{a^2 + b^2} \\]',
  '',
  '- 第一项 $$\\sum_{i=1}^n i$$',
  '- 第二项 $x_i$',
  '',
  '\\begin{align}',
  'a &= b + c \\\\',
  '  &= d',
  '\\end{align}',
  '',
  '```js',
  'const price = "$5" // $x$',
  '```',
  '',
  '| 量 | 值 |',
  '|---|---|',
  '| $|v|$ | $3$ |',
].join('\n')

test('streaming: every prefix renders, with no KaTeX error on the way', () => {
  for (let k = 1; k <= LONG.length; k++) {
    const r = math(LONG.slice(0, k))
    assert.equal(r.errors, 0, `prefix ${k}: ${JSON.stringify(LONG.slice(0, k))}\n${r.out}`)
  }
  const end = math(LONG)
  assert.deepEqual({ inline: end.inline, display: end.display }, { inline: 6, display: 4 }, end.out)
})

test('streaming: an unclosed $$ leaves the following text as text', () => {
  const r = math('前文\n\n$$\n\\int_0^1\n\n之后的段落 $x$')
  assert.equal(r.display, 0, r.out)
  assert.ok(r.out.includes('之后的段落'), r.out)
  assert.equal(r.inline, 1, r.out)
})

test('normalising a long reply is fast', () => {
  const big = LONG.repeat(200) // about 60 KB
  const t = performance.now()
  normalizeDelimiters(big + ' ')
  const ms = performance.now() - t
  assert.ok(ms < 200, `${ms.toFixed(1)} ms`)
})
