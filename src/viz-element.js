// <t3latex-viz>: one visualization in T3's chat. rehypeVisualize (visualize.js)
// puts it where a ```visualize block was, with the block's HTML in
// data-source, or data-pending while the block is still streaming; or where a
// Codex-style visualize{"path":…} line was, with the path in data-file (the
// loader reads the file for it, mod/serve.cjs).
//
// The HTML runs in a sandboxed iframe (frame/frame.html): an opaque origin with
// its own Content-Security-Policy, so it can reach neither T3's page nor
// Electron, and loads scripts only from t3-latex's bundled libraries and a few
// CDNs. The frame gets the HTML, T3's theme and the remembered control values
// through its window.name, which it reads while its document is still being
// parsed, so the HTML runs as if it had been in the page all along.
//
// The frame reports back over postMessage: its content height (the iframe is
// sized to fit), the values of its inputs (restored when T3 re-creates the
// message, e.g. after scrolling it out of view), a question the user asks
// from inside it (put into T3's composer, not sent), a web link they
// clicked (opened in the browser) and, when the user clicks "Quote current
// state" under it, a line saying what is set and shown (put into the composer
// too). Everything it says is treated as untrusted.
//
// T3 renders the element with React, which leaves the element's shadow root
// alone; the frame lives there.

import { VIZ_TAG } from './visualize.js'

const FRAME_URL = '/__t3latex/frame/frame.html'
const FILE_URL = '/__t3latex/file'
const MIN_HEIGHT = 24
const MAX_HEIGHT = 2400
const DEFAULT_HEIGHT = 240
const STATE_KEY = 't3latex:viz:'
const STATE_INDEX = 't3latex:viz-index'
const MAX_STATES = 300
const MAX_STATE_BYTES = 16 * 1024

// The loader's <meta name="t3latex-lang">: Chinese where the regional format
// is Chinese, as its dialogs (T3's page follows the display language).
const zh = /^zh\b/i.test(document.querySelector('meta[name="t3latex-lang"]')?.content ?? navigator.language)
const TEXT = zh
  ? {
      title: '交互式可视化',
      streaming: '正在生成可视化…',
      stalled: '可视化不完整：回复在代码结束前中断了',
      loading: '正在读取可视化…',
      missing: '找不到可视化文件',
      unreadable: '无法读取可视化文件',
      expand: '放大',
      collapse: '还原',
      reset: '重置',
      quote: '引用当前状态',
    }
  : {
      title: 'Interactive visualization',
      streaming: 'Building the visualization…',
      stalled: 'Incomplete visualization: the reply stopped before its code ended',
      loading: 'Reading the visualization…',
      missing: 'Visualization file not found',
      unreadable: 'Could not read the visualization file',
      expand: 'Expand',
      collapse: 'Restore size',
      reset: 'Reset',
      quote: 'Quote current state',
    }

// T3's theme, as the variables its own components use.
const THEME_VARS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
  'info', 'success', 'warning',
]

function colorScheme() {
  const root = document.documentElement
  if (root.classList.contains('dark')) return 'dark'
  const scheme = getComputedStyle(root).colorScheme
  if (!scheme.includes('dark')) return 'light'
  if (!scheme.includes('light')) return 'dark'
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readTheme(element) {
  const style = getComputedStyle(element)
  const vars = {}
  for (const name of THEME_VARS) {
    const value = style.getPropertyValue(`--${name}`).trim()
    if (value) vars[name] = value
  }
  return {
    vars,
    scheme: colorScheme(),
    font: style.fontFamily,
    mono: style.getPropertyValue('--font-mono').trim(),
    size: style.fontSize,
    text: style.color, // the chat's own (slightly muted) text colour
  }
}

// ---- remembered state: the frame's height and control values, per source ----
// (and for a Codex visualization, the state it saves through
// window.openai.setWidgetState)

// cyrb53: a quick 53-bit string hash, as a key for a visualization's source.
function hash(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const states = {
  memory: new Map(),
  get(key) {
    if (this.memory.has(key)) return this.memory.get(key)
    let record = null
    try {
      record = JSON.parse(localStorage.getItem(STATE_KEY + key))
    } catch {}
    this.memory.set(key, record)
    return record
  },
  set(key, patch) {
    const record = { ...this.get(key), ...patch }
    this.memory.set(key, record)
    try {
      localStorage.setItem(STATE_KEY + key, JSON.stringify(record))
      // Most recently saved last; forget the oldest past MAX_STATES.
      let index = JSON.parse(localStorage.getItem(STATE_INDEX) || '[]').filter(k => k !== key)
      index.push(key)
      for (const old of index.splice(0, Math.max(0, index.length - MAX_STATES))) localStorage.removeItem(STATE_KEY + old)
      localStorage.setItem(STATE_INDEX, JSON.stringify(index))
    } catch {}
  },
  delete(key) {
    this.memory.delete(key)
    try {
      localStorage.removeItem(STATE_KEY + key)
    } catch {}
  },
}

// ---- what a visualization may ask the page to do ----------------------------

// Puts the text into T3's composer for the user to read and send.
function askInComposer(text) {
  const editors = [
    ...document.querySelectorAll('[contenteditable="true"]:is([data-testid="composer-editor"], [data-composer-rich-text])'),
  ]
  const editor = editors.find(e => e.offsetParent !== null) ?? editors[0]
  if (!editor) return
  editor.focus()
  const selection = getSelection()
  selection.selectAllChildren(editor)
  selection.collapseToEnd()
  const prefix = editor.textContent.trim() ? '\n' : ''
  document.execCommand('insertText', false, prefix + text)
}

// ---- the element ------------------------------------------------------------

const ICONS = {
  expand:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/></svg>',
  collapse:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14"/></svg>',
  reset:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3v3.5H6"/><path d="M2.9 6.5A5.5 5.5 0 1 1 2.6 9"/></svg>',
  // Lucide's message-square-quote (ISC), its stroke matched to the others.
  quote:
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14a2 2 0 0 0 2-2V8h-2"/><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M8 14a2 2 0 0 0 2-2V8H8"/></svg>',
}

// The text of each file read so far, by path: a message T3 re-creates shows it
// at once, and it is read again in case it changed.
const files = new Map()

const STYLE = `
:host { display: block; margin: 0.75em 0 0.25em; }
.box {
  position: relative; inset: auto; width: auto; height: auto; margin: 0; padding: 0;
  border: 0; overflow: visible; color: inherit; background: none; display: block;
}
iframe { display: block; width: 100%; border: 0; background: transparent; color-scheme: inherit; }
/* The buttons get a strip of their own under the frame, shown on hover: laid
   over the frame they would cover whatever the visualization put there. */
.bar {
  display: flex; justify-content: flex-end; gap: 2px; height: 24px; margin-top: 2px;
  opacity: 0; transition: opacity 0.15s;
}
:host(:hover) .bar, .bar:focus-within, .box:popover-open .bar { opacity: 1; }
.box:popover-open .bar { position: absolute; top: 6px; right: 8px; margin: 0; }
.bar button {
  all: unset; box-sizing: border-box; width: 24px; height: 24px; display: grid; place-items: center;
  border-radius: 6px; color: var(--muted-foreground); cursor: pointer;
}
.bar button:hover { background: var(--accent); color: var(--accent-foreground); }
.bar button:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.bar button[hidden] { display: none; }
.box:popover-open {
  position: fixed; inset: 4vh 4vw; margin: 0; padding: 36px 16px 16px; display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: 12px; background: var(--background);
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.35); overflow: hidden;
}
.box:popover-open iframe { flex: 1 1 auto; min-height: 0; height: auto !important; }
.box:popover-open::backdrop { background: rgb(0 0 0 / 0.5); }
.pending {
  display: flex; align-items: center; gap: 0.6em; padding: 0.75em 1em;
  border: 1px dashed var(--border); border-radius: 10px; color: var(--muted-foreground);
}
.spinner {
  flex: none; width: 0.85em; height: 0.85em; border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
.size { margin-left: auto; font-variant-numeric: tabular-nums; opacity: 0.7; }
.path { font-family: var(--font-mono, monospace); font-size: 0.85em; overflow-wrap: anywhere; min-width: 0; }
.note { flex-wrap: wrap; row-gap: 0.25em; }
.note .path { margin-left: 0; flex-basis: 100%; }
.note .spinner { display: none; }
.stalled { display: none; }
:host-context(.chat-markdown:not([data-streaming])) .pending:not(.loading, .note) .streaming,
:host-context(.chat-markdown:not([data-streaming])) .pending:not(.loading, .note) .spinner { display: none; }
:host-context(.chat-markdown:not([data-streaming])) .pending:not(.loading, .note) .stalled { display: inline; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`

const live = new Set() // elements showing a frame

// A visualization's first heading, if any: its name for screen readers and in
// a quote of its state.
function headingOf(source) {
  const m = /<h[1-3]\b[^>]*>([^<]{1,120})</i.exec(source)
  return m ? m[1].trim() : ''
}

class VizElement extends HTMLElement {
  static observedAttributes = ['data-source', 'data-pending', 'data-file']

  #shadow = this.attachShadow({ mode: 'open' })
  #frame = null
  #box = null
  #source = null
  #file = null
  #key = null
  #saveHeight = 0
  #quoting = null // the quote asked for: { id, until }

  connectedCallback() {
    this.#update()
  }

  disconnectedCallback() {
    live.delete(this)
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#update()
  }

  get frameWindow() {
    return this.#frame?.contentWindow ?? null
  }

  #update() {
    const file = this.getAttribute('data-file')
    if (file !== null) {
      this.#load(file)
      return
    }
    this.#file = null
    const source = this.getAttribute('data-source')
    if (source === null) {
      this.#showNote('pending', Number(this.getAttribute('data-pending')) || 0)
      return
    }
    this.#show(source)
  }

  #show(source) {
    if (source === this.#source && this.#frame) {
      live.add(this)
      return
    }
    this.#source = source
    this.#key = hash(source)
    this.#mount()
  }

  // A Codex visualization: the HTML file the line points at, read through the
  // loader. Shown from the last read at once if there is one, and again if
  // the file has changed since (Codex rewrites a file to update it).
  async #load(path) {
    if (path === this.#file) {
      if (this.#frame) live.add(this)
      return
    }
    this.#file = path
    const cached = files.get(path)
    if (cached !== undefined) this.#show(cached)
    else this.#showNote('loading')
    let text = null
    let status = 0
    try {
      const res = await fetch(`${FILE_URL}?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
      status = res.status
      if (res.ok) text = await res.text()
    } catch {}
    if (this.#file !== path) return
    if (text === null) {
      if (cached === undefined) this.#showNote(status === 404 ? 'missing' : 'unreadable', path)
      return
    }
    files.set(path, text)
    this.#show(text)
  }

  // A placeholder: 'pending' (a block still streaming, `detail` its size so
  // far), 'loading', or 'missing' / 'unreadable' (`detail` the file's path).
  #showNote(kind, detail) {
    this.#source = this.#frame = this.#box = null
    live.delete(this)
    let note = this.#shadow.querySelector('.pending')
    if (!note) {
      this.#shadow.innerHTML = `<style>${STYLE}</style><div class="pending" role="status"><span class="spinner"></span><span class="streaming"></span><span class="stalled"></span><span class="size"></span></div>`
      note = this.#shadow.querySelector('.pending')
    }
    const pending = kind === 'pending'
    note.classList.toggle('loading', kind === 'loading')
    note.classList.toggle('note', kind === 'missing' || kind === 'unreadable')
    note.querySelector('.streaming').textContent = pending ? TEXT.streaming : TEXT[kind]
    note.querySelector('.stalled').textContent = pending ? TEXT.stalled : ''
    const size = note.querySelector('.size')
    size.className = pending ? 'size' : 'size path'
    if (pending) size.textContent = detail ? `${(detail / 1024).toFixed(1)} KB` : ''
    else size.textContent = detail ?? ''
  }

  #mount() {
    const record = states.get(this.#key)
    const theme = readTheme(this)
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    frame.title = this.#name() || TEXT.title
    // Read by frame/runtime.js; set before src so the frame starts with it.
    frame.name = JSON.stringify({
      t3viz: 1,
      source: this.#source,
      theme,
      state: record?.controls ?? null,
      widget: record?.widget ?? null,
      lang: zh ? 'zh' : 'en',
    })
    frame.style.height = `${record?.height || DEFAULT_HEIGHT}px`
    frame.style.colorScheme = theme.scheme
    frame.src = FRAME_URL
    // A frame reset while expanded starts out not knowing it.
    frame.addEventListener('load', () => {
      if (this.#box?.matches(':popover-open')) this.#post({ t3viz: 'mode', expanded: true })
    })

    if (!this.#box) {
      this.#shadow.innerHTML = `<style>${STYLE}</style><div class="box" popover="auto"><div class="bar"><button type="button" data-act="quote" hidden></button><button type="button" data-act="expand"></button><button type="button" data-act="reset"></button></div></div>`
      this.#box = this.#shadow.querySelector('.box')
      this.#box.addEventListener('toggle', event => this.#onToggle(event.newState === 'open'))
      this.#shadow.querySelector('.bar').addEventListener('click', event => {
        const act = event.target.closest('button')?.dataset.act
        if (act === 'expand') this.#box.matches(':popover-open') ? this.#box.hidePopover() : this.#box.showPopover()
        else if (act === 'reset') this.#reset()
        else if (act === 'quote') this.#quote()
      })
      this.#onToggle(false)
    }
    // Shown once the new frame says it has something to quote.
    this.#shadow.querySelector('[data-act="quote"]').hidden = true
    this.#quoting = null
    this.#frame?.remove()
    this.#box.prepend(frame)
    this.#frame = frame
    live.add(this)
  }

  #reset() {
    states.delete(this.#key)
    this.#mount()
  }

  // The title a Codex line gives, or the first heading.
  #name() {
    return this.getAttribute('data-title') || headingOf(this.#source)
  }

  // The user clicked the button, so the frame's answer to this request (and
  // only it, for a moment) goes into the composer.
  #quote() {
    const id = Math.random().toString(36).slice(2)
    this.#quoting = { id, until: Date.now() + 2000 }
    this.#post({ t3viz: 'quote', id, title: this.#name() })
  }

  // Expanded, the box would hide the composer the text goes into.
  #toComposer(text) {
    if (this.#box?.matches(':popover-open')) this.#box.hidePopover()
    askInComposer(text.slice(0, 4000))
  }

  // Expanded, the box sits in the top layer (it is not moved, so the frame
  // keeps running) and the frame fills it instead of fitting its content.
  #onToggle(open) {
    const button = this.#shadow.querySelector('[data-act="expand"]')
    button.innerHTML = open ? ICONS.collapse : ICONS.expand
    button.setAttribute('aria-label', open ? TEXT.collapse : TEXT.expand)
    button.title = open ? TEXT.collapse : TEXT.expand
    const reset = this.#shadow.querySelector('[data-act="reset"]')
    reset.innerHTML = ICONS.reset
    reset.setAttribute('aria-label', TEXT.reset)
    reset.title = TEXT.reset
    const quote = this.#shadow.querySelector('[data-act="quote"]')
    quote.innerHTML = ICONS.quote
    quote.setAttribute('aria-label', TEXT.quote)
    quote.title = TEXT.quote
    this.#post({ t3viz: 'mode', expanded: open })
    if (!open) {
      const height = states.get(this.#key)?.height
      if (height && this.#frame) this.#frame.style.height = `${height}px`
    }
  }

  #post(message) {
    try {
      this.frameWindow?.postMessage(message, '*')
    } catch {}
  }

  postTheme() {
    if (!this.#frame) return
    const theme = readTheme(this)
    this.#frame.style.colorScheme = theme.scheme
    this.#post({ t3viz: 'theme', theme })
  }

  // Did the user just click or type in this frame? Filling the composer and
  // opening the browser need that, so a visualization cannot do either by
  // itself. A click in the frame gives the page a few seconds of user
  // activation (as anything else the user does in T3 would) and moves focus
  // into the frame.
  #userActedHere() {
    return navigator.userActivation?.isActive === true && this.#shadow.activeElement === this.#frame
  }

  // A message from this element's frame. Untrusted: the visualization's own
  // code runs there too.
  onFrameMessage(data) {
    if (data.t3viz === 'size' && Number.isFinite(data.height)) {
      const height = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, data.height)))
      if (!this.#box?.matches(':popover-open')) this.#frame.style.height = `${height}px`
      clearTimeout(this.#saveHeight)
      this.#saveHeight = setTimeout(() => states.set(this.#key, { height }), 500)
    } else if ((data.t3viz === 'state' || data.t3viz === 'widget') && data.state && typeof data.state === 'object') {
      try {
        if (JSON.stringify(data.state).length <= MAX_STATE_BYTES) {
          states.set(this.#key, data.t3viz === 'state' ? { controls: data.state } : { widget: data.state })
        }
      } catch {}
    } else if (data.t3viz === 'ask' && typeof data.text === 'string' && data.text.trim()) {
      if (this.#userActedHere()) this.#toComposer(data.text)
    } else if (data.t3viz === 'quotable') {
      this.#shadow.querySelector('[data-act="quote"]').hidden = data.value !== true
    } else if (data.t3viz === 'quote' && typeof data.text === 'string' && data.text.trim()) {
      const asked = this.#quoting
      if (asked && data.id === asked.id && Date.now() < asked.until) {
        this.#quoting = null
        this.#toComposer(data.text)
      }
    } else if (data.t3viz === 'open' && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
      // T3 opens a new window's web URL in the browser.
      if (this.#userActedHere()) window.open(data.url, '_blank', 'noopener')
    } else if (data.t3viz === 'escape') {
      if (this.#box?.matches(':popover-open')) this.#box.hidePopover()
    }
  }
}

export function defineVizElement(window) {
  if (window.customElements.get(VIZ_TAG)) return
  window.customElements.define(VIZ_TAG, VizElement)

  window.addEventListener('message', event => {
    const data = event.data
    if (!data || typeof data !== 'object' || typeof data.t3viz !== 'string') return
    for (const element of live) {
      if (element.frameWindow === event.source) {
        element.onFrameMessage(data)
        return
      }
    }
  })

  // Follow T3's theme: light/dark and custom themes change attributes on <html>.
  let pending = 0
  const retheme = () => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      for (const element of live) element.postTheme()
    })
  }
  new MutationObserver(retheme).observe(window.document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme-id', 'data-theme'],
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme)
}
