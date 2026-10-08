// The frame a visualization runs in (frame/frame.html + runtime.js), in jsdom:
// the block's HTML written while the page parses, theme, libraries added on
// demand, remembered inputs restored, errors shown, messages to the host.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'

const page = readFileSync(new URL('../frame/frame.html', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../frame/runtime.js', import.meta.url), 'utf8')

// The frame as the host starts it (runtime.js inline, which jsdom can load);
// resolves once it has loaded. `posted` holds what it sent the host (its
// parent is itself here).
function frame(source, { theme = null, state = null, widget = null, lang = 'en' } = {}) {
  const posted = []
  const html = page
    .replace('<script src="runtime.js"></script>', () => `<script>${runtime.replaceAll('</script>', '<\\/script>')}</script>`)
    .replace(/<link rel="stylesheet"[^>]*>/, '')
    .replace(/<script type="importmap">[^]*?<\/script>/, '')
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true, // requestAnimationFrame
    virtualConsole: new VirtualConsole(), // the block's errors are expected in some tests
    beforeParse(window) {
      window.name = JSON.stringify({ t3viz: 1, source, theme, state, widget, lang })
      window.ResizeObserver = class {
        constructor(callback) {
          window.setTimeout(() => callback([]), 0)
        }
        observe() {}
      }
      window.postMessage = message => posted.push(message)
    },
  })
  return new Promise(resolve => {
    dom.window.addEventListener('load', () => dom.window.setTimeout(() => resolve({ window: dom.window, document: dom.window.document, posted }), 20))
  })
}

test("the block's scripts run in order, after its markup, and get DOMContentLoaded", async () => {
  const { window, document } = await frame(
    '<p id="a">A</p><script>window.log = [document.getElementById("a").textContent]</script>' +
      '<p id="b">B</p><script>log.push(document.getElementById("b").textContent)</script>' +
      '<script>document.addEventListener("DOMContentLoaded", () => log.push("ready"))</script>',
  )
  assert.deepEqual([...window.log], ['A', 'B', 'ready'])
  assert.equal(document.querySelectorAll('body > p').length, 2)
})

test("T3's theme is on the root before the block runs", async () => {
  const theme = { vars: { background: 'oklch(0.2 0 0)', primary: '#818cf8' }, scheme: 'dark', font: 'Segoe UI', size: '15px', text: '#eee' }
  const { window, document } = await frame('<script>window.seen = document.documentElement.dataset.theme</script>', { theme })
  const root = document.documentElement
  assert.equal(window.seen, 'dark')
  assert.equal(root.style.getPropertyValue('--background'), 'oklch(0.2 0 0)')
  assert.equal(root.style.getPropertyValue('--font-size'), '15px')
  assert.equal(window.t3viz.theme, 'dark')
})

test('a theme change from the host reaches the block as an event', async () => {
  const { window, document } = await frame('<script>addEventListener("t3viz:theme", e => window.seen = e.detail.theme)</script>')
  window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { t3viz: 'theme', theme: { vars: {}, scheme: 'dark' } } }))
  assert.equal(window.seen, 'dark')
  assert.equal(document.documentElement.dataset.theme, 'dark')
})

test('d3, KaTeX and THREE are added when the code uses them, and only then', async () => {
  const scripts = async source => [...(await frame(source)).document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
  assert.deepEqual(await scripts('<script>d3.select("svg")</script>'), ['lib/d3.min.js'])
  assert.deepEqual(await scripts('<span data-tex="x^2"></span>'), ['lib/katex.js'])
  assert.deepEqual(await scripts('<script>new THREE.Scene()</script>'), ['lib/three.min.js'])
  assert.deepEqual(await scripts('<script type="module">import * as THREE from "three"; new THREE.Scene()</script>'), [])
  assert.deepEqual(await scripts('<script type="module">import * as d3 from \'d3\'; d3.select("svg")</script>'), [])
  assert.deepEqual(await scripts('<p>no libraries</p>'), [])
  assert.deepEqual(await scripts('<i data-lucide="search"></i>'), ['lib/lucide.js'])
})

test('remembered inputs come back, with the events a user change fires', async () => {
  const source =
    '<input id="k" type="range" min="0" max="10" value="1"><select><option>a</option><option>b</option></select>' +
    '<input type="checkbox"><input id="ro" readonly value="x">' +
    '<script>window.seen = []; document.addEventListener("input", e => seen.push(e.target.id || e.target.tagName))</script>'
  const { window, document } = await frame(source, { state: { '#k': '7', 'select:1': 'b', 'input:2': true, '#ro': 'changed' } })
  assert.equal(document.getElementById('k').value, '7')
  assert.equal(document.querySelector('select').value, 'b')
  assert.equal(document.querySelector('input[type=checkbox]').checked, true)
  assert.equal(document.getElementById('ro').value, 'x')
  assert.deepEqual([...window.seen], ['k', 'SELECT', 'INPUT'])
})

test('a user change is reported to the host; the restore itself is not', async () => {
  const { window, document, posted } = await frame('<input id="k" type="range" value="1">', { state: { '#k': '4' } })
  await new Promise(r => window.setTimeout(r, 450))
  assert.equal(posted.filter(m => m.t3viz === 'state').length, 0)
  // jsdom cannot make a trusted event; the save path is checked in T3 (dev/t3.cjs).
  assert.equal(document.getElementById('k').value, '4')
})

test('an error in the block is shown in the frame, with a button that asks for a fix', async () => {
  const { window, document, posted } = await frame('<p>x</p><script>notDefined()</script>', { lang: 'zh' })
  const box = document.querySelector('.t3viz-error')
  assert.ok(box, 'error box')
  assert.match(box.textContent, /可视化出错了/)
  assert.match(box.querySelector('pre').textContent, /notDefined/)
  box.querySelector('button').click()
  const ask = posted.find(m => m.t3viz === 'ask')
  assert.match(ask.text, /notDefined/)
  assert.match(ask.text, /请修复/)
  assert.equal(window.document.documentElement.lang, 'zh-CN')
})

test('t3viz.ask sends the question to the host; the size is reported', async () => {
  const { window, posted } = await frame('<button onclick="t3viz.ask(\'  why?  \')">ask</button>')
  window.document.querySelector('button').click()
  assert.deepEqual({ ...posted.find(m => m.t3viz === 'ask') }, { t3viz: 'ask', text: 'why?' })
  assert.ok(posted.some(m => m.t3viz === 'size' && Number.isFinite(m.height)))
})

test('animation frames come at most about 60 a second; cancelling and errors work as usual', async () => {
  const { window, document } = await frame(
    '<script>window.times = []; const loop = t => { times.push(t); if (times.length < 6) requestAnimationFrame(loop) }; requestAnimationFrame(loop);' +
      'window.cancelled = false; const id = requestAnimationFrame(() => { cancelled = true }); cancelAnimationFrame(id);' +
      'requestAnimationFrame(() => { throw new Error("in a frame") })</script>',
  )
  await new Promise(r => window.setTimeout(r, 300))
  const times = [...window.times]
  assert.equal(times.length, 6)
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1000 / 64 - 1, `${times[i] - times[i - 1]} ms apart`)
  assert.equal(window.cancelled, false)
  assert.match(document.querySelector('.t3viz-error pre').textContent, /in a frame/)
})

// What Codex's visualizations expect of their host.

test('window.openai: saved widget state at start, saving it, and the set_globals event', async () => {
  const source =
    '<script>window.start = openai.widgetState; window.events = [];' +
    'addEventListener("openai:set_globals", e => events.push(e.detail.globals))</script>'
  const { window, posted } = await frame(source, { widget: { modelContent: { step: 2 }, privateContent: null } })
  assert.deepEqual({ ...window.start.modelContent }, { step: 2 })
  await window.openai.setWidgetState({ modelContent: { step: 3 } })
  const saved = posted.find(m => m.t3viz === 'widget')
  assert.deepEqual(JSON.parse(JSON.stringify(saved.state)), { modelContent: { step: 3 }, privateContent: null })
  assert.equal(window.openai.widgetState.modelContent.step, 3)
  assert.equal(window.events.length, 1)
  assert.equal(window.events[0].widgetState.modelContent.step, 3)
  // Updater functions work; non-objects and more than 16 KiB are refused.
  await window.openai.setWidgetState(prev => ({ ...prev, privateContent: { n: prev.modelContent.step + 1 } }))
  assert.equal(window.openai.widgetState.privateContent.n, 4)
  await assert.rejects(window.openai.setWidgetState([1]), /JSON object/)
  await assert.rejects(window.openai.setWidgetState({ modelContent: 'x'.repeat(17 * 1024) }), /16 KiB/)
  assert.equal(posted.filter(m => m.t3viz === 'widget').length, 2)
})

test('window.openai: follow-ups go to the composer, links to the browser, the theme is there', async () => {
  const { window, posted } = await frame('<p>x</p>', { theme: { vars: {}, scheme: 'dark' } })
  await window.openai.sendFollowUpMessage({ prompt: 'Explain the flux at r = 2', title: 'Explain' })
  assert.equal(posted.find(m => m.t3viz === 'ask').text, 'Explain the flux at r = 2')
  await window.openai.openExternal({ href: 'https://en.wikipedia.org/wiki/Gauss%27s_law' })
  await window.openai.openExternal({ href: 'javascript:alert(1)' })
  assert.deepEqual(posted.filter(m => m.t3viz === 'open').map(m => m.url), ['https://en.wikipedia.org/wiki/Gauss%27s_law'])
  assert.equal(window.openai.theme, 'dark')
  let seen = null
  window.addEventListener('openai:set_globals', e => (seen = e.detail.globals))
  window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { t3viz: 'theme', theme: { vars: {}, scheme: 'light' } } }))
  assert.equal(seen.theme, 'light')
})

test('HTML that saves its own state is not also auto-restored', async () => {
  const source = '<input id="k" type="range" value="1"><script>window.openai.setWidgetState</script>'
  const { document } = await frame(source, { state: { '#k': '4' } })
  assert.equal(document.getElementById('k').value, '1')
})

test('tabs show their panel; arrow keys move between them', async () => {
  const source =
    '<div class="nav nav-pills" role="tablist" aria-label="P">' +
    '<button class="nav-link active" id="a" role="tab" aria-controls="pa" aria-selected="true" type="button">A</button>' +
    '<button class="nav-link" id="b" role="tab" aria-controls="pb" aria-selected="false" type="button">B</button>' +
    '<button class="nav-link" id="c" role="tab" aria-controls="pa" aria-selected="false" type="button">C</button></div>' +
    '<div id="pa" role="tabpanel">a</div><div id="pb" role="tabpanel" hidden>b</div>'
  const { window, document } = await frame(source)
  const $ = id => document.getElementById(id)
  $('b').click()
  assert.deepEqual([$('a').getAttribute('aria-selected'), $('b').getAttribute('aria-selected')], ['false', 'true'])
  assert.ok($('b').classList.contains('active') && !$('a').classList.contains('active'))
  assert.deepEqual([$('pa').hidden, $('pb').hidden], [true, false])
  assert.equal($('pb').getAttribute('aria-labelledby'), 'b')
  $('b').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  assert.equal($('c').getAttribute('aria-selected'), 'true')
  assert.deepEqual([$('pa').hidden, $('pb').hidden], [false, true]) // c shares a's panel
  assert.equal(document.activeElement, $('c'))
})

test('a variant carousel shows one design at a time, with controls to switch', async () => {
  const source =
    '<div class="viz-carousel" aria-label="Players">' +
    '<section data-variant="Minimal">m</section><section data-variant="Studio" hidden>s</section></div>'
  const { document } = await frame(source, { lang: 'zh' })
  const [minimal, studio] = document.querySelectorAll('[data-variant]')
  const controls = document.querySelector('.viz-carousel-controls')
  assert.ok(controls)
  const [previous, next] = controls.querySelectorAll('button')
  assert.equal(next.getAttribute('aria-label'), '下一个')
  next.click()
  assert.deepEqual([minimal.hidden, studio.hidden], [true, false])
  assert.equal(controls.querySelector('select').value, '1')
  next.click()
  assert.deepEqual([minimal.hidden, studio.hidden], [false, true])
  previous.click()
  assert.equal(studio.hidden, false)
  assert.match(controls.querySelector('option').textContent, /Minimal · 1\/2/)
})

// "Quote current state": the host asks, the frame answers with one line.

async function quoted(f, title = '') {
  f.window.dispatchEvent(new f.window.MessageEvent('message', { source: f.window, data: { t3viz: 'quote', id: 'q1', title } }))
  const reply = f.posted.filter(m => m.t3viz === 'quote').at(-1)
  assert.equal(reply.id, 'q1')
  return reply.text
}

test('a quote names each control with its value as its label shows it, then the readouts', async () => {
  const source =
    '<div class="viz-controls">' +
    '<label class="form-label" for="theta">角度 θ = <output id="theta-out">0.80</output> rad\n' +
    '  <input id="theta" type="range" min="0" max="6.28" step="0.01" value="0.8"></label>' +
    '<label class="form-label">N = <span id="nv">5</span><input id="n" type="range" min="1" max="9" value="5"></label>' +
    '<label class="form-label">模型<select id="m"><option>线性</option><option selected>非线性</option></select></label>' +
    '<label class="form-check"><input type="checkbox" id="env" checked> 显示包络</label>' +
    '<fieldset><legend>阻尼</legend><label><input type="radio" name="d" value="u"> 欠阻尼</label>' +
    '<label><input type="radio" name="d" value="o" checked> 过阻尼</label></fieldset>' +
    '<input type="number" aria-label="质量 m (kg)" value="2"><input type="text" placeholder="备注" value="">' +
    '<div hidden><input id="h" value="9" aria-label="隐藏"></div>' +
    '<button id="play" type="button" aria-pressed="true">暂停</button>' +
    '<span id="readout" aria-live="polite">sin θ = 0.717</span></div>' +
    '<div class="viz-stat"><div class="text-muted">周期</div><div class="viz-stat-value">3.14 s</div></div>' +
    '<svg role="img" aria-label="单位圆与正弦曲线"></svg>'
  const f = await frame(source, { lang: 'zh' })
  assert.ok(f.posted.some(m => m.t3viz === 'quotable' && m.value === true))
  assert.equal(
    await quoted(f),
    '（可视化「单位圆与正弦曲线」的当前状态：角度 θ = 0.80 rad；N = 5；模型：非线性；显示包络：开；阻尼：过阻尼；质量 m (kg)：2；sin θ = 0.717；周期 3.14 s）',
  )
})

test('a quote gives the selected tab, variant and tile, and formulas as TeX; the host may name the visual', async () => {
  const katex = tex =>
    `<span class="katex"><span class="katex-mathml"><math><semantics><mi>q</mi><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span>` +
    '<span class="katex-html" aria-hidden="true">q1</span></span>'
  const source =
    '<div role="tablist"><button role="tab" aria-selected="true" aria-controls="p1">Field</button><button role="tab" aria-selected="false">Potential</button></div>' +
    `<div id="p1" role="tabpanel"><label>${katex('q_1')} = <output>2</output> nC<input type="range" value="2"></label></div>` +
    '<div class="viz-carousel"><section data-variant="Minimal">m</section><section data-variant="Studio" hidden>s</section></div>' +
    '<button class="viz-tile" aria-pressed="true">Point charge</button><button class="viz-tile" aria-pressed="false">Dipole</button>'
  const f = await frame(source)
  assert.equal(
    await quoted(f, 'Gauss'),
    '(Current state of the visualization "Gauss": Tab: Field; Variant: Minimal; Selected: Point charge; $q_1$ = 2 nC)',
  )
})

test("Codex's modelContent is quoted as it is; a visual with nothing to quote has no button", async () => {
  const withContent = await frame('<input id="n" type="range" value="3">', { widget: { modelContent: { N: 12 }, privateContent: null } })
  assert.equal(await quoted(withContent, 'Fourier'), '(Current state of the visualization "Fourier": {"N":12})')

  const still = await frame('<svg role="img" aria-label="A triangle"></svg><p>Angles add to 180°.</p>')
  assert.equal(still.posted.filter(m => m.t3viz === 'quotable').length, 0)
  assert.equal(await quoted(still), null)
  // Until it saves something for the model.
  await still.window.openai.setWidgetState({ modelContent: 'angle A = 40°' })
  assert.ok(still.posted.some(m => m.t3viz === 'quotable' && m.value === true))
  assert.equal(await quoted(still), '(Current state of the visualization "A triangle": angle A = 40°)')
})
