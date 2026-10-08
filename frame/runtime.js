// Runs first in the sandboxed frame of a ```visualize block (frame.html), as a
// classic script, so everything here exists before the block's own code.
//
// The host element (src/viz-element.js) put the block's HTML, T3's theme and
// any remembered control values into window.name. This script applies the
// theme, then writes the HTML into the body with document.write while the
// frame is still being parsed: the block's scripts run in order, see the
// markup above them, and get DOMContentLoaded and load like any page.
//
// It also gives the block what a chat message needs from it: the frame's
// height reported to the host, input values remembered and restored, the
// current state described for the host's "Quote current state" button, errors
// shown in the frame (with a button to ask for a fix), [data-tooltip]
// tooltips, web links opened in the browser, animation frames capped at about
// 60 a second, and window.t3viz:
//
//   t3viz.ask(text)    put a question into T3's composer for the user to send
//   t3viz.color(css)   a CSS colour or --variable as '#rrggbb' (canvas, WebGL)
//   t3viz.theme        'light' or 'dark'; a 't3viz:theme' event on window
//                      when it (or any theme colour) changes
//
// and what Codex's visualizations expect of their host (the HTML files of
// visualize{"path":…} lines): window.openai with widgetState, setWidgetState,
// sendFollowUpMessage and openExternal, Lucide icons for [data-lucide], tabs
// (.nav-link[role="tab"]) and variant carousels (.viz-carousel).

;(() => {
  const root = document.documentElement
  let params = null
  try {
    params = JSON.parse(window.name)
  } catch {}
  if (!params || params.t3viz !== 1) params = { source: '', theme: null, state: null, lang: 'en' }

  const zh = params.lang === 'zh'
  root.lang = zh ? 'zh-CN' : 'en'
  const T = zh
    ? {
        error: '可视化出错了',
        fix: '让模型修复',
        load: url => `无法加载 ${url}`,
        blocked: url => `已拦截 ${url}（只能加载内置的库和几个 CDN）`,
        prompt: text => `上面的可视化在运行时出错了：\n\n\`\`\`\n${text}\n\`\`\`\n\n请修复它。`,
        previous: '上一个',
        next: '下一个',
        quote: (name, items) => `（可视化${name ? `「${name}」` : ''}的当前状态：${items.join('；')}）`,
        colon: '：',
        and: '、',
        on: '开',
        off: '关',
        selected: '已选',
        tab: '标签页',
        variant: '方案',
      }
    : {
        error: 'The visualization hit an error',
        fix: 'Ask for a fix',
        load: url => `Could not load ${url}`,
        blocked: url => `Blocked ${url} (only the bundled libraries and a few CDNs can load)`,
        prompt: text => `The visualization above failed when it ran:\n\n\`\`\`\n${text}\n\`\`\`\n\nPlease fix it.`,
        previous: 'Previous',
        next: 'Next',
        quote: (name, items) => `(Current state of the visualization${name ? ` "${name}"` : ''}: ${items.join('; ')})`,
        colon: ': ',
        and: ', ',
        on: 'on',
        off: 'off',
        selected: 'Selected',
        tab: 'Tab',
        variant: 'Variant',
      }

  const post = (type, data) => {
    try {
      parent.postMessage({ t3viz: type, ...data }, '*')
    } catch {}
  }

  // ---- theme -----------------------------------------------------------------

  const colors = new Map()
  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return
    const style = root.style
    for (const [name, value] of Object.entries(theme.vars || {})) {
      if (/^[a-z-]+$/.test(name) && typeof value === 'string') style.setProperty(`--${name}`, value)
    }
    if (theme.font) style.setProperty('--font-sans', theme.font)
    if (theme.mono) style.setProperty('--font-mono', theme.mono)
    if (theme.size) style.setProperty('--font-size', theme.size)
    if (theme.text) style.setProperty('--text', theme.text)
    const scheme = theme.scheme === 'dark' ? 'dark' : 'light'
    style.colorScheme = scheme
    root.dataset.theme = scheme
    colors.clear()
  }
  applyTheme(params.theme)

  let probe = null
  let ink = null
  function color(value) {
    let css = String(value).trim()
    if (css.startsWith('--')) css = `var(${css})`
    if (colors.has(css)) return colors.get(css)
    if (!probe) {
      probe = document.createElement('span')
      probe.hidden = true
      root.append(probe)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      ink = canvas.getContext('2d', { willReadFrequently: true })
    }
    probe.style.color = ''
    probe.style.color = css
    ink.clearRect(0, 0, 1, 1)
    ink.fillStyle = '#000'
    ink.fillStyle = getComputedStyle(probe).color
    ink.fillRect(0, 0, 1, 1)
    const [r, g, b] = ink.getImageData(0, 0, 1, 1).data
    const hex = `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`
    colors.set(css, hex)
    return hex
  }

  // ---- animation frames ----------------------------------------------------

  // At most about 60 a second. Plenty for a chat visualization, and a fraction
  // of the work on a fast display, where rAF can fire hundreds of times a
  // second. Also keeps code that adds a frame's time to a range input's value
  // moving: steps smaller than the input's step would round away.
  const nativeFrame = window.requestAnimationFrame.bind(window)
  const callbacks = new Map()
  let nextId = 1
  let scheduled = false
  let lastFrame = -Infinity
  function runFrame(now) {
    if (now - lastFrame < 1000 / 64) return nativeFrame(runFrame)
    scheduled = false
    lastFrame = now
    const due = [...callbacks.values()]
    callbacks.clear()
    for (const callback of due) {
      try {
        callback(now)
      } catch (error) {
        // As an uncaught error in a native frame callback would be.
        if (window.reportError) window.reportError(error)
        else setTimeout(() => { throw error })
      }
    }
  }
  window.requestAnimationFrame = callback => {
    const id = nextId++
    callbacks.set(id, callback)
    if (!scheduled) {
      scheduled = true
      nativeFrame(runFrame)
    }
    return id
  }
  window.cancelAnimationFrame = id => {
    callbacks.delete(id)
  }

  // ---- writing the block -----------------------------------------------------

  // d3 and KaTeX are there as globals when the code uses them, three.js as a
  // global THREE for code written for its old script build; with an ES module
  // import (see the import map in frame.html) nothing is added. Lucide too, as
  // Codex's host provides it: [data-lucide] placeholders become icons once the
  // HTML is in.
  function libraries(source) {
    const tags = []
    const loads = name => new RegExp(`<script[^>]*\\bsrc=[^>]*${name}|from\\s*["']${name}["']`).test(source)
    if (/\bdata-tex\b|\bkatex\s*\./.test(source) && !loads('katex')) tags.push('lib/katex.js')
    if (/\bd3\s*\./.test(source) && !loads('d3')) tags.push('lib/d3.min.js')
    if (/\bTHREE\s*\./.test(source) && !loads('three')) tags.push('lib/three.min.js')
    if (/\bdata-lucide\b|\blucide\s*\./.test(source) && !loads('lucide')) tags.push('lib/lucide.js')
    return tags.map(src => `<script src="${src}"></script>`).join('')
  }

  let written = false
  function write() {
    if (written) return
    written = true
    const source = String(params.source || '')
    new ResizeObserver(reportSize).observe(document.body)
    document.write(libraries(source) + source)
  }
  // Before the HTML's own DOMContentLoaded handlers, which are added later.
  document.addEventListener('DOMContentLoaded', () => {
    try {
      window.lucide?.createIcons?.({ attrs: { width: 16, height: 16 } })
    } catch {}
    try {
      carousels()
    } catch {}
  })

  // ---- size --------------------------------------------------------------

  let expanded = false
  let lastHeight = -1
  function reportSize() {
    if (expanded || !document.body) return
    const height = Math.ceil(document.body.getBoundingClientRect().height)
    if (height === lastHeight) return
    lastHeight = height
    post('size', { height })
  }

  // ---- messages from the host --------------------------------------------

  window.addEventListener('message', event => {
    if (event.source !== parent) return
    const data = event.data
    if (data?.t3viz === 'theme') {
      applyTheme(data.theme)
      window.dispatchEvent(new CustomEvent('t3viz:theme', { detail: { theme: root.dataset.theme } }))
      setGlobals({ theme: openai.theme })
    } else if (data?.t3viz === 'mode') {
      expanded = data.expanded === true
      root.classList.toggle('t3viz-expanded', expanded)
      if (!expanded) {
        lastHeight = -1
        reportSize()
      }
    } else if (data?.t3viz === 'quote') {
      let text = null
      try {
        text = quote(data.title)
      } catch {}
      post('quote', { id: data.id, text })
    }
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) post('escape')
  })

  // ---- remembered input values -------------------------------------------

  // Every input, select and textarea, keyed by id or else by position, so the
  // values come back when T3 re-creates the message (scrolled out of view and
  // back, thread reopened). Not for HTML that saves its own state through
  // window.openai.setWidgetState (Codex's way), which restores it itself.
  const selfSaving = /\bsetWidgetState\b/.test(String(params.source || ''))
  const SKIP_TYPES = new Set(['button', 'submit', 'reset', 'file', 'password', 'hidden', 'image'])
  const controls = () =>
    [...document.querySelectorAll('input, select, textarea')].filter(
      el => !SKIP_TYPES.has(el.type) && !el.closest('.t3viz-chrome'),
    )
  const keyOf = (el, i) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:${i}`)
  const checkable = el => el.type === 'checkbox' || el.type === 'radio'

  // Saved a moment after anything the user does, not only an input of their
  // own: a preset button or a drag sets inputs from code. Only what changed
  // is sent.
  let saveTimer = 0
  let saved = JSON.stringify(params.state ?? null)
  function scheduleSave(event) {
    if (!event.isTrusted) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      reportQuotable()
      if (selfSaving) return
      const state = {}
      controls().forEach((el, i) => {
        state[keyOf(el, i)] = checkable(el) ? el.checked : el.value
      })
      const json = JSON.stringify(state)
      if (json === saved) return
      saved = json
      post('state', { state })
    }, 400)
  }
  for (const type of ['input', 'change', 'click', 'keyup', 'pointerup']) document.addEventListener(type, scheduleSave, true)

  // After the block's own start-up code, set each remembered value and fire
  // the events a user's change would, so the visualization follows.
  function restore(saved) {
    if (!saved || typeof saved !== 'object' || selfSaving) return
    controls().forEach((el, i) => {
      const key = keyOf(el, i)
      if (!(key in saved) || el.disabled || el.readOnly) return
      const value = saved[key]
      if (checkable(el)) {
        if (el.checked === Boolean(value)) return
        el.checked = Boolean(value)
        if (el.type === 'radio' && !value) return
      } else {
        if (value === null || el.value === String(value)) return
        el.value = String(value)
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        restore(params.state)
      } catch {}
      reportQuotable()
      setTimeout(reportQuotable, 1000) // controls a module adds once its imports are in
    })
  })

  // ---- the current state, quoted -------------------------------------------

  // The model wrote the visual but never sees it. The host's "Quote current
  // state" button puts what the user has set and what the visual shows into
  // T3's composer as one line: each control with its label, the readouts
  // (<output>, .viz-stat, aria-live regions), the selected tab, variant or
  // tile. Codex's HTML says what the model should know itself, in
  // widgetState.modelContent; that is quoted as it is.
  const MAX_ITEM = 200
  const shown = el => !el.closest('[hidden], [aria-hidden="true"], .t3viz-chrome') && getComputedStyle(el).display !== 'none'

  // Text as the user reads it: block boundaries become spaces, formulas their
  // TeX, controls and hidden parts are left out.
  function textOf(root) {
    let text = ''
    const walk = node => {
      if (node.nodeType === 3) text += node.data
      if (node.nodeType !== 1) return
      if (node.matches('script, style, template, input, select, textarea, button, [aria-hidden="true"], .t3viz-chrome')) return
      const display = getComputedStyle(node).display
      if (display === 'none') return
      const gap = display.startsWith('inline') ? '' : ' '
      const tex = node.classList.contains('katex') && node.querySelector('annotation[encoding="application/x-tex"]')
      text += gap
      if (tex) text += `$${tex.textContent.trim()}$`
      else node.childNodes.forEach(walk)
      text += gap
    }
    root.childNodes.forEach(walk)
    text = text.replace(/\s+/g, ' ').trim()
    return text.length > MAX_ITEM ? `${text.slice(0, MAX_ITEM - 1)}…` : text
  }

  function labelOf(el) {
    // The enclosing label too: without a for attribute, a label holding an
    // <output> before the input labels the output.
    const label = el.labels?.[0] ?? el.closest('label')
    if (label) return [textOf(label), label]
    const ids = el.getAttribute('aria-labelledby')?.split(/\s+/) ?? []
    const named = ids.map(id => document.getElementById(id)).filter(Boolean).map(textOf).join(' ')
    return [named || (el.getAttribute('aria-label') || el.title || el.placeholder || el.name || el.id || '').trim(), null]
  }

  function groupOf(radio) {
    const legend = radio.closest('fieldset')?.querySelector('legend')
    if (legend) return textOf(legend)
    return radio.closest('[role="radiogroup"]')?.getAttribute('aria-label')?.trim() ?? ''
  }

  // A number in the label's text, as it is written next to a slider.
  function showsValue(text, value) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\d.])${escaped}($|[^\\d.])`).test(text)
  }

  function controlItem(el) {
    const [name, label] = labelOf(el)
    const pair = value => (name ? `${name}${T.colon}${value}` : value)
    if (el.type === 'checkbox') return pair(el.checked ? T.on : T.off)
    if (el.type === 'radio') {
      if (!el.checked) return ''
      return `${groupOf(el) || T.selected}${T.colon}${name || el.value}`
    }
    if (el.tagName === 'SELECT') return pair([...el.selectedOptions].map(o => o.text.trim()).join(T.and))
    const value = el.value.trim()
    if (!value) return ''
    // A label that shows the value, in an <output> or in its text, says it
    // already, with its unit.
    if (label && (label.querySelector('output')?.textContent.trim() || showsValue(name, value))) return name
    return pair(value.length > MAX_ITEM ? `${value.slice(0, MAX_ITEM - 1)}…` : value)
  }

  function stateItems() {
    const items = []
    const add = item => item && !items.includes(item) && items.push(item)
    const addNamed = (what, text) => text && add(`${what}${T.colon}${text}`)
    for (const tab of document.querySelectorAll('[role="tab"][aria-selected="true"]')) {
      if (shown(tab)) addNamed(T.tab, textOf(tab))
    }
    for (const panel of document.querySelectorAll('.viz-carousel > [data-variant]:not([hidden])')) {
      addNamed(T.variant, panel.dataset.variant.trim())
    }
    for (const tile of document.querySelectorAll('.viz-tile:is([aria-pressed="true"], [aria-selected="true"], .is-selected)')) {
      if (shown(tile)) addNamed(T.selected, textOf(tile))
    }
    for (const el of controls()) if (shown(el)) add(controlItem(el))
    const readouts = [...document.querySelectorAll('output, .viz-stat, [aria-live]')].filter(el => !el.closest('label') && shown(el))
    for (const el of readouts) {
      if (!readouts.some(other => other !== el && other.contains(el))) add(textOf(el))
    }
    return items.slice(0, 40)
  }

  // The line for the composer, or null when there is nothing to quote.
  function quote(title) {
    const content = widgetState?.modelContent
    const items =
      content != null && content !== '' ? [typeof content === 'string' ? content.trim() : JSON.stringify(content)] : stateItems()
    if (!items.length) return null
    const name = String(title || '').trim() || document.querySelector('[role="img"][aria-label]')?.getAttribute('aria-label').trim()
    return T.quote(name, items).slice(0, 4000)
  }

  // The host shows its button only while there is something to quote.
  let quotable = false
  function reportQuotable() {
    let value = false
    try {
      value = quote() !== null
    } catch {}
    if (value === quotable) return
    quotable = value
    post('quotable', { value })
  }

  // ---- errors --------------------------------------------------------------

  const errors = []
  let errorBox = null
  function showError(text) {
    text = String(text).trim().slice(0, 600)
    if (!text || errors.includes(text) || errors.length >= 4) return
    errors.push(text)
    if (!document.body) return
    if (!errorBox) {
      errorBox = document.createElement('div')
      errorBox.className = 't3viz-error t3viz-chrome'
      errorBox.setAttribute('role', 'alert')
      const title = document.createElement('strong')
      title.textContent = T.error
      const pre = document.createElement('pre')
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = T.fix
      button.addEventListener('click', () => post('ask', { text: T.prompt(errors.join('\n')) }))
      errorBox.append(title, pre, button)
    }
    errorBox.querySelector('pre').textContent = errors.join('\n')
    document.body.append(errorBox)
  }

  function describe(error, fallback) {
    if (error && typeof error === 'object' && error.message) return `${error.name || 'Error'}: ${error.message}`
    return String(error ?? fallback)
  }

  // A URL the CSP blocked also fails to load; say only that it was blocked.
  // (The violation event can come after the load error.)
  const blocked = new Set()
  window.addEventListener(
    'error',
    event => {
      const el = event.target
      if (el && el !== window && el.tagName) {
        // A script or stylesheet that failed to load (resource errors do
        // not bubble, hence the capture phase).
        const url = el.src || el.href
        if (el.tagName === 'SCRIPT' || el.tagName === 'LINK') setTimeout(() => blocked.has(url) || showError(T.load(url)), 100)
        return
      }
      // Chromium's notice that a ResizeObserver callback changed the size
      // again; harmless, and common in code that redraws on resize.
      if (/^ResizeObserver loop/.test(event.message)) return
      const where = event.lineno ? ` (${zh ? `第 ${event.lineno} 行` : `line ${event.lineno}`})` : ''
      showError(describe(event.error, event.message) + where)
    },
    true,
  )
  window.addEventListener('unhandledrejection', event => showError(describe(event.reason, 'Promise rejected')))
  document.addEventListener('securitypolicyviolation', event => {
    if (event.disposition !== 'enforce') return
    blocked.add(event.blockedURI)
    showError(T.blocked(event.blockedURI || event.effectiveDirective))
  })

  // ---- tooltips ------------------------------------------------------------

  let tip = null
  function showTip(target) {
    const text = target.getAttribute('data-tooltip')
    if (!text) return hideTip()
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 't3viz-tooltip t3viz-chrome'
      tip.setAttribute('role', 'tooltip')
    }
    if (!tip.isConnected) document.body.append(tip)
    tip.textContent = text
    tip.hidden = false
    const r = target.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const x = Math.min(Math.max(4, r.left + r.width / 2 - t.width / 2), Math.max(4, innerWidth - t.width - 4))
    let y = r.top - t.height - 6
    if (y < 4) y = Math.min(r.bottom + 6, Math.max(4, innerHeight - t.height - 4))
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }
  function hideTip() {
    if (tip) tip.hidden = true
  }
  const tooltipTarget = node => (node instanceof Element ? node.closest('[data-tooltip]') : null)
  document.addEventListener('pointerover', event => {
    const target = tooltipTarget(event.target)
    target ? showTip(target) : hideTip()
  })
  document.addEventListener('focusin', event => {
    const target = tooltipTarget(event.target)
    target ? showTip(target) : hideTip()
  })
  document.addEventListener('focusout', hideTip)
  document.documentElement.addEventListener('pointerleave', hideTip)
  document.addEventListener('scroll', hideTip, true)

  // ---- links -----------------------------------------------------------------

  // A web link would otherwise load the page inside the frame. The frame may
  // not open windows; the host opens the link in the browser, if the user
  // just clicked.
  window.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0) return
    const link = event.target instanceof Element ? event.target.closest('a') : null
    const href = link?.getAttribute('href') ?? link?.getAttribute('xlink:href')
    if (!href || href.startsWith('#')) return
    let url
    try {
      url = new URL(href, 'https://invalid/')
    } catch {
      return
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return
    event.preventDefault()
    if (url.host !== 'invalid') post('open', { url: url.href })
  })

  // ---- tabs ------------------------------------------------------------------

  // Codex's tabs: .nav-link[role="tab"] buttons in a [role="tablist"], each
  // showing the [role="tabpanel"] its aria-controls names. Several tabs may
  // share one panel.
  const tabsOf = list => [...list.querySelectorAll('[role="tab"]')].filter(tab => tab.closest('[role="tablist"]') === list)
  function selectTab(tab) {
    const list = tab.closest('[role="tablist"]')
    if (!list || tab.disabled || tab.getAttribute('aria-disabled') === 'true') return
    const shown = tab.getAttribute('aria-controls')
    for (const other of tabsOf(list)) {
      const selected = other === tab
      other.classList.toggle('active', selected)
      other.setAttribute('aria-selected', String(selected))
      const id = other.getAttribute('aria-controls')
      const panel = id && id !== shown ? document.getElementById(id) : null
      if (panel) panel.hidden = true
    }
    const panel = shown ? document.getElementById(shown) : null
    if (panel) {
      panel.hidden = false
      if (tab.id) panel.setAttribute('aria-labelledby', tab.id)
    }
  }
  document.addEventListener('click', event => {
    const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null
    if (tab && !event.defaultPrevented) selectTab(tab)
  })
  document.addEventListener('keydown', event => {
    const tab = event.target instanceof Element ? event.target.closest('[role="tab"]') : null
    const list = tab?.closest('[role="tablist"]')
    if (!list || event.defaultPrevented) return
    const tabs = tabsOf(list).filter(t => !t.disabled && t.getAttribute('aria-disabled') !== 'true')
    const i = tabs.indexOf(tab)
    const next = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: tabs.length - 1,
    }[event.key]
    if (next === undefined || !tabs.length) return
    event.preventDefault()
    const target = tabs[(next + tabs.length) % tabs.length]
    target.focus()
    selectTab(target)
  })

  // ---- variant carousels -------------------------------------------------

  // Codex's .viz-carousel: one [data-variant] child shown at a time, with
  // previous / next buttons and a picker of the variants' names under them.
  function carousels() {
    for (const root of document.querySelectorAll('.viz-carousel')) {
      const panels = [...root.children].filter(child => child.hasAttribute('data-variant'))
      if (!panels.length || root.querySelector(':scope > .viz-carousel-controls')) continue
      const bar = document.createElement('div')
      bar.className = 'viz-carousel-controls t3viz-chrome'
      const button = (label, text) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'btn btn-ghost'
        b.setAttribute('aria-label', label)
        b.textContent = text
        return b
      }
      const previous = button(root.dataset.previousLabel || T.previous, '‹')
      const next = button(root.dataset.nextLabel || T.next, '›')
      const picker = document.createElement('select')
      picker.className = 'form-select'
      picker.setAttribute('aria-label', root.getAttribute('aria-label') || 'Variant')
      panels.forEach((panel, i) => picker.add(new Option(`${panel.dataset.variant} · ${i + 1}/${panels.length}`, String(i))))
      let index = Math.max(0, panels.findIndex(panel => !panel.hidden))
      const show = i => {
        index = (i + panels.length) % panels.length
        panels.forEach((panel, j) => {
          panel.hidden = j !== index
        })
        picker.value = String(index)
      }
      previous.addEventListener('click', () => show(index - 1))
      next.addEventListener('click', () => show(index + 1))
      picker.addEventListener('change', () => show(Number(picker.value)))
      bar.append(previous, picker, next)
      root.append(bar)
      show(index)
    }
  }

  // ---- Codex's window.openai -------------------------------------------------

  const setGlobals = globals => window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals } }))
  const MAX_WIDGET_BYTES = 16 * 1024
  let widgetState = params.widget && typeof params.widget === 'object' && !Array.isArray(params.widget) ? params.widget : null
  const openai = {
    get theme() {
      return root.dataset.theme || 'light'
    },
    locale: zh ? 'zh-CN' : 'en',
    displayMode: 'inline',
    get widgetState() {
      return widgetState
    },
    // Remembered with the visualization (T3 re-creates a message when it is
    // scrolled back into view or the thread is reopened). It reaches the
    // model only when the user quotes it (see quote above): T3 has no way to
    // pass modelContent on by itself.
    async setWidgetState(next) {
      const value = typeof next === 'function' ? next(widgetState) : next
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Widget state must be a JSON object')
      const state = { modelContent: null, privateContent: null, ...JSON.parse(JSON.stringify(value)) }
      if (new TextEncoder().encode(JSON.stringify(state)).length > MAX_WIDGET_BYTES) {
        throw new TypeError('Widget state must be a JSON object of at most 16 KiB')
      }
      widgetState = state
      setGlobals({ widgetState })
      post('widget', { state })
      reportQuotable()
    },
    async sendFollowUpMessage({ prompt } = {}) {
      window.t3viz.ask(prompt)
    },
    async openExternal({ href } = {}) {
      try {
        const url = new URL(String(href))
        if (url.protocol === 'https:' || url.protocol === 'http:') post('open', { url: url.href })
      } catch {}
    },
  }
  window.openai = openai

  // ---- the API -----------------------------------------------------------

  window.t3viz = Object.freeze({
    ask(text) {
      const message = String(text ?? '').trim()
      if (message) post('ask', { text: message.slice(0, 4000) })
    },
    color,
    get theme() {
      return root.dataset.theme || 'light'
    },
    __write: write,
  })
})()
