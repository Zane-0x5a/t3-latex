// normalizeDelimiters: the exact markdown it hands to remark-math.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDelimiters as norm } from '../src/normalize.js'

const same = s => assert.equal(norm(s), s)

test('non-strings and text without $ or \\ pass through', () => {
  assert.equal(norm(undefined), undefined)
  assert.equal(norm(42), 42)
  same('plain text')
})

test('inline $…$ is kept', () => {
  same('a $x$ b')
  same('二次方程 $ax^2 + bx + c = 0$（其中 $a \\neq 0$）')
  same('当$x>0$时')
  same('the $i$-th and $j$-th')
})

test('math that starts with a digit is kept', () => {
  same('$2x+1$')
  same('so $2^n$ grows')
})

test('prices are escaped, not paired', () => {
  assert.equal(norm('这本书 $5，那本 $10，一共 $15。'), '这本书 \\$5，那本 \\$10，一共 \\$15。')
  assert.equal(norm('从$5到$10'), '从\\$5到\\$10')
  assert.equal(norm('between $5-$10'), 'between \\$5-\\$10')
  assert.equal(norm('US$5'), 'US\\$5')
})

test('a price and math on one line', () => {
  assert.equal(norm('costs $5 and $x$ is'), 'costs \\$5 and $x$ is')
  assert.equal(norm('价格$5，数量为$n$'), '价格\\$5，数量为$n$')
  assert.equal(norm('从 $1 到 $n$'), '从 \\$1 到 $n$')
})

test('shell variables and lone dollars are escaped', () => {
  assert.equal(norm('set $HOME and $PATH'), 'set \\$HOME and \\$PATH')
  assert.equal(norm('a $ b'), 'a \\$ b')
})

test('spaced $ … $ is math only when it reads as math', () => {
  assert.equal(norm('$ E = mc^2 $'), '$E = mc^2$')
  assert.equal(norm('$ 5 and $'), '\\$ 5 and \\$')
})

test('already-escaped \\$ is left alone', () => {
  same('cost \\$5 and $x$')
  same('\\$\\$ not math')
})

test('CJK text inside \\text{} does not block math', () => {
  same('$v = \\text{速度}$')
  same('$1\\text{元}$')
})

test('\\(…\\) becomes $…$', () => {
  assert.equal(norm('by \\(\\frac{a}{b}\\) we'), 'by $\\frac{a}{b}$ we')
  assert.equal(norm('where \\( x \\) is'), 'where $x$ is')
})

test('\\[…\\] becomes a display block', () => {
  assert.equal(norm('\\[ \\int x \\]'), '$$\n\\int x\n$$')
  assert.equal(norm('对高斯积分：\n\n\\[ \\int e^{-x^2} = \\sqrt{\\pi} \\]'), '对高斯积分：\n\n$$\n\\int e^{-x^2} = \\sqrt{\\pi}\n$$')
})

test('a citation-looking \\[1\\] is not math', () => {
  same('see \\[1\\]')
  same('\\[TODO\\]')
})

test('$$…$$ becomes a display block', () => {
  assert.equal(norm('$$x^2$$'), '$$\nx^2\n$$')
  assert.equal(norm('$$\nx^2\n$$'), '$$\nx^2\n$$')
  assert.equal(norm('A $$x$$ B'), 'A\n$$\nx\n$$\nB')
  assert.equal(norm('而 $$\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$$'), '而\n$$\n\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}\n$$')
})

test('punctuation right after a display block joins the formula', () => {
  assert.equal(norm('A $$x$$.'), 'A\n$$\nx.\n$$')
  assert.equal(norm('其中 $$x$$，'), '其中\n$$\nx\\text{，}\n$$')
})

test('display math stays inside its list item', () => {
  assert.equal(norm('- 公式 $$x$$\n- 下一项'), '- 公式\n  $$\n  x\n  $$\n- 下一项')
  assert.equal(norm('1. $$x$$'), '1. $$\n   x\n   $$')
  assert.equal(norm('- a\n\n  $$\n  x\n  $$'), '- a\n\n  $$\n  x\n  $$')
})

test('display math stays inside its blockquote', () => {
  assert.equal(norm('> 引用 $$x$$'), '> 引用\n> $$\n> x\n> $$')
  same('> $$\n> a \\\\\n> b\n> $$')
})

test('a bare display environment becomes a display block', () => {
  assert.equal(
    norm('\\begin{align}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n&= a^2 + b^2 + 2ab\n\\end{align}'),
    '$$\n\\begin{align}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n&= a^2 + b^2 + 2ab\n\\end{align}\n$$',
  )
  assert.equal(norm('解为\n\\begin{cases} x & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}'), '解为\n$$\n\\begin{cases} x & x>0 \\\\ 0 & \\text{otherwise} \\end{cases}\n$$')
})

test('environments inside math are left to the math', () => {
  same('$R = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$')
  same('$$\n\\begin{aligned} a &= b \\end{aligned}\n$$')
})

test('\\label is dropped, KaTeX does not support it', () => {
  assert.equal(norm('$$\nE = mc^2 \\label{eq:1}\n$$'), '$$\nE = mc^2\n$$')
})

test('code fences are untouched, closed or still streaming', () => {
  same('```python\nprint(f"$x = {x}$")  # $$ and $5\n```')
  same('~~~\n$a$ \\(b\\)\n~~~')
  same('````md\n```\n$5\n```\n````')
  same('```\n$5 and $x')
  same('- item\n  ```sh\n  echo $HOME\n  ```')
})

test('code spans are untouched', () => {
  same('use `$PATH` and $x$')
  same('``a ` $5 ``')
  assert.equal(norm('`$x$` but $5'), '`$x$` but \\$5')
})

test('table cells: pipes inside math become \\vert', () => {
  assert.equal(norm('| $|x|$ | $y$ |'), '| $\\vert x\\vert$ | $y$ |')
  assert.equal(norm('| $\\|v\\|$ |'), '| $\\Vert v\\Vert$ |')
  assert.equal(norm('| $$x$$ |'), '| $\\displaystyle x$ |')
})

test('streaming: an unclosed $$ or \\[ does not swallow the rest', () => {
  assert.equal(norm('text\n$$\n\\frac{a}{'), 'text\n\\$\\$\n\\frac{a}{')
  same('see \\[ \\frac{a}{')
  assert.equal(norm('$x^2 +'), '\\$x^2 +')
})

test('$$ pairs only within a paragraph', () => {
  assert.equal(norm('$$a\n\nmore $$b$$'), '\\$\\$a\n\nmore\n$$\nb\n$$')
})

test('CRLF input is read as LF', () => {
  assert.equal(norm('$$\r\nx\r\n$$'), '$$\nx\n$$')
})

test('normalising twice changes nothing more', () => {
  const samples = [
    '这本书 $5，那本 $10，一共 $15。',
    'costs $5 and $x$ is',
    'by \\(\\frac{a}{b}\\) we',
    'A $$x$$ B',
    '其中 $$x$$，',
    '- 公式 $$x$$\n- 下一项',
    '> 引用 $$x$$',
    '\\begin{align}\na &= b\n\\end{align}',
    '| $|x|$ | $$y$$ |',
    'text\n$$\n\\frac{a}{',
  ]
  for (const s of samples) assert.equal(norm(norm(s)), norm(s), JSON.stringify(s))
})
