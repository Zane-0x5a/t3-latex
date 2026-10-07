---
name: t3-visualize
description: Interactive visual in the T3 Code chat — a simulation, adjustable plot, geometric construction, 3D scene or step-through the user can play with. Use when the user asks to see, plot, animate or explore something, and proactively when turning a knob would make a math, physics or CS idea click. T3 Code only (your system prompt says you run in T3 Code).
---

# Visualize in T3

A fenced block with the language `visualize` holding an HTML fragment renders in the chat as a live, sandboxed mini-page (t3-latex does this). The user drags, clicks and watches it inside the conversation.

Reach for it when the idea has a **knob**: a parameter whose change the user should watch, a process unfolding in time, a shape to rotate, a point to drag. Definitions, derivations, lists and tables read better as text, and formulas as LaTeX in the reply. T3 shows Mermaid as plain code, so draw a static diagram as SVG in a `visualize` block when a picture is worth it. One visual per reply unless the user asks for more.

## Steps

1. **Pick the idea and its knob.** Name the one insight the visual must make visible and the one or two knobs that reveal it. Done when you can say "moving X shows Y".
2. **Write the reply.** Explain in prose with LaTeX formulas, put the block on its own where the visual belongs, then one sentence on what to try ("把阻尼比 ζ 拖过 1，振荡就消失了"). Describe what the visual shows; the HTML, the frame and this skill stay unmentioned. Explanations, formulas and instructions live in the reply text, so the block holds only the visual, its controls and its labels.
3. **Write the block** to the contract below.
4. **Check it** against every line of the checklist before sending. Done when each line holds.

To change a visual in a later turn, send the whole revised block again; each block stands alone.

## The contract

```visualize
<div class="viz-controls">…labelled controls…</div>
<svg id="fig" role="img" aria-label="what it shows"></svg>
<script>…</script>
```

- **A fragment**: markup, `<style>`, `<script>`; no `<html>`, `<head>` or `<body>`. It is written into its own page while that page parses, so classic scripts run in order and see the markup above them; `<script type="module">` runs after the page is parsed.
- **Width** is the chat column, usually 560–760px and as narrow as 320px. Draw from the measured container width and redraw in a `ResizeObserver`. The user can expand the visual to most of the window, so width-driven layouts simply grow.
- **Height** follows the content: the frame grows and shrinks to fit. Give the figure a height computed from its width or a fixed pixel height; `vh`, `height: 100%` on the root and `position: fixed` layouts have nothing to measure against.
- **Sandboxed**: no network (fetch, XHR and WebSocket are blocked; images only as `data:` or `blob:`), and `localStorage`, `sessionStorage` and cookies throw. Scripts load from the bundled libraries below, or from cdn.jsdelivr.net, unpkg.com, esm.sh and cdnjs.cloudflare.com, which can be slow or unreachable on some networks.
- **Remembered inputs**: every `input`, `select` and `textarea` value is saved when the user changes it and restored when the message is redrawn (scrolled away and back, thread reopened), by setting it and firing `input` and `change`. So derive the whole picture from the controls in one `update()` that every control's `input` listener calls, and give controls ids.
- **Errors** show inside the frame with a button that asks you for a fix.

## Theme

The page background is transparent and follows T3's light or dark theme, so take every colour from a variable: never a hex value, `white` or `black`.

- Text and structure: `--foreground`, `--muted-foreground`, `--border`; surfaces: `--card`, `--muted`, `--accent`; emphasis: `--primary`, `--destructive`.
- Series, in order (blue, orange, aqua, yellow, magenta, green): `--viz-1` … `--viz-6`, validated for colour-blind readers in both themes. One quantity keeps one colour across views.
- In SVG, attributes take variables: `stroke="var(--viz-1)"`; unfilled `<text>` takes the text colour.
- Canvas and WebGL need real colours: `t3viz.color('--viz-1')` returns `'#rrggbb'`. Redraw on `window.addEventListener('t3viz:theme', …)`, which fires when the theme changes. Create three.js renderers with `alpha: true`.

## Ready-made styles

Native `button`, `select`, `input` (range, number, checkbox, radio, color) and `textarea` already match T3. Classes:

- `.viz-controls`: a responsive grid of labelled controls; inside, `<label class="form-label">Name <output>…</output><input type="range"></label>`.
- `.viz-row` (wrapping flex row), `.viz-grid` (equal columns that stack when narrow).
- `.card`; `.viz-stat` with `.viz-stat-value` for a big live number.
- `.btn-primary`, and `button[aria-pressed="true"]` for a pressed toggle (play/pause).
- `.text-muted`, `.text-small`, `.tabular-nums` (use on every changing number), `.table`.
- `data-tooltip="…"` on any element, SVG marks included, shows a themed tooltip on hover, focus and tap; newlines break lines.
- `data-tex="\frac{1}{2}mv^2"` typesets TeX with KaTeX (`data-display` for display style), and re-typesets when the attribute changes. In SVG, wrap it in `<foreignObject>`; plain axis labels read fine in Unicode (θ, ω, ∇, x², v₀).

## Libraries

Bundled, so they work offline and load instantly:

- **d3** v7: the global `d3` is loaded when your code uses `d3.`; in a module, `import * as d3 from 'd3'`.
- **three.js** r186, in `<script type="module">`: `import * as THREE from 'three'`, addons from `'three/addons/…'`, e.g. `controls/OrbitControls.js`, `geometries/ParametricGeometry.js`, `renderers/CSS2DRenderer.js` (HTML labels), `lines/Line2.js`, `math/ConvexHull.js`, `libs/lil-gui.module.min.js`.
- **KaTeX**: the global `katex` is loaded when your code uses `katex.` or `data-tex`.

## Making it teach

- **Open on the interesting case**: defaults that already show the phenomenon.
- **Every knob shows its live value and unit**; the quantity that matters (net flux, period, energy) sits beside the picture as a live number.
- **Link views**: when one cause has two pictures (unit circle and sine wave, phase portrait and time series, a lens and its rays), draw both and move them together.
- **Drag what is draggable** (a point, a charge, a vertex) rather than giving it a slider.
- **Motion on request**: a play/pause toggle, time advanced by the real frame interval. Keep the animated value in a variable and only show it on the slider: a range input snaps to its `step`, so adding a frame's worth to `input.value` runs at the wrong speed or not at all.
- **Faithful numbers**: closed forms where they exist, RK4 with a small fixed step for ODEs, real units and constants. A wrong simulation teaches wrong physics.
- `t3viz.ask("为什么…？")` puts a question into the user's composer for them to send; it works only from a click handler. Offer it for a follow-up the visual raises ("这时为什么通量为零？").

## Checklist

- Every element the script queries exists, every identifier is defined, and classic scripts come after the markup they touch.
- Each control's `input` drives `update()`, and the picture is a function of the control values.
- Drawn from the measured width and correct at 320px.
- Every colour comes from a theme variable or `t3viz.color`.
- Nothing fetched, nothing stored.

## Example

A unit circle linked to the sine curve, with a θ knob and play/pause:

```visualize
<div class="viz-controls">
  <label class="form-label" for="theta">角度 θ = <output id="theta-out" class="tabular-nums"></output> rad
    <input id="theta" type="range" min="0" max="6.28" step="0.01" value="0.8">
  </label>
  <div class="viz-row">
    <button id="play" type="button" aria-pressed="false">播放</button>
    <span id="readout" class="tabular-nums" aria-live="polite"></span>
  </div>
</div>
<svg id="fig" role="img" aria-label="单位圆上的点 P 与 sin θ 曲线"></svg>
<script>
const theta = document.getElementById('theta'), play = document.getElementById('play')
const fig = document.getElementById('fig'), NS = 'http://www.w3.org/2000/svg'
function add(tag, attrs) {
  const node = document.createElementNS(NS, tag)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  return fig.appendChild(node)
}
let t = +theta.value // the angle; the slider shows it
function update() {
  const w = fig.parentElement.clientWidth
  const r = Math.min(96, w / 6.5), h = 2 * r + 24, cx = r + 8, cy = h / 2
  const x0 = 2 * r + 40, sx = (w - x0 - 16) / (2 * Math.PI), y = a => cy - r * Math.sin(a)
  fig.setAttribute('viewBox', `0 0 ${w} ${h}`)
  fig.setAttribute('height', h)
  fig.replaceChildren()
  add('circle', { cx, cy, r, fill: 'none', stroke: 'var(--muted-foreground)' })
  add('line', { x1: x0, y1: cy, x2: w - 8, y2: cy, stroke: 'var(--border)' })
  add('text', { x: w - 8, y: cy - 6, 'text-anchor': 'end', class: 'text-small' }).textContent = 'θ'
  let d = `M${x0},${cy}`
  for (let a = 0; a <= t; a += 0.02) d += `L${x0 + a * sx},${y(a)}`
  add('path', { d, fill: 'none', stroke: 'var(--viz-1)', 'stroke-width': 2 })
  const px = cx + r * Math.cos(t)
  add('line', { x1: cx, y1: cy, x2: px, y2: y(t), stroke: 'var(--foreground)' })
  add('line', { x1: px, y1: cy, x2: px, y2: y(t), stroke: 'var(--viz-2)', 'stroke-width': 3 })
  add('line', { x1: px, y1: y(t), x2: x0 + t * sx, y2: y(t), stroke: 'var(--muted-foreground)', 'stroke-dasharray': '3 3' })
  add('circle', { cx: px, cy: y(t), r: 5, fill: 'var(--viz-1)', 'data-tooltip': `P = (${Math.cos(t).toFixed(2)}, ${Math.sin(t).toFixed(2)})` })
  add('circle', { cx: x0 + t * sx, cy: y(t), r: 5, fill: 'var(--viz-1)' })
  document.getElementById('theta-out').textContent = t.toFixed(2)
  document.getElementById('readout').textContent = `sin θ = ${Math.sin(t).toFixed(3)}`
}
let frame = 0, last = 0
function tick(now) {
  if (last) theta.value = t = (t + (now - last) / 1000) % (2 * Math.PI) // 1 rad/s
  last = now
  update()
  frame = requestAnimationFrame(tick)
}
play.addEventListener('click', () => {
  const on = play.getAttribute('aria-pressed') !== 'true'
  play.setAttribute('aria-pressed', on)
  play.textContent = on ? '暂停' : '播放'
  last = 0
  on ? (frame = requestAnimationFrame(tick)) : cancelAnimationFrame(frame)
})
theta.addEventListener('input', () => { t = +theta.value; update() })
new ResizeObserver(update).observe(fig.parentElement)
</script>
```

A 3D scene follows the same shape:

```html
<div id="scene"></div>
<script type="module">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
const box = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(devicePixelRatio)
box.append(renderer.domElement)
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
camera.position.set(4, 3, 5)
const controls = new OrbitControls(camera, renderer.domElement)
const material = new THREE.MeshStandardMaterial({ color: t3viz.color('--viz-1') })
// … meshes, lights …
addEventListener('t3viz:theme', () => material.color.set(t3viz.color('--viz-1')))
new ResizeObserver(() => {
  const w = box.clientWidth, h = Math.round(w * 0.6)
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}).observe(box)
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
</script>
```
