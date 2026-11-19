/**
 * Content script entry.
 *
 * Boot order matters: settings first (so the first paint is already themed),
 * then the skin attributes, then the shadow shell, then the enhancer. If the
 * page is not weibo, or we are inside an iframe, we do nothing at all.
 */
import { h, render } from 'preact'
import shellCss from '../styles/shell.css'
import tokensCss from '../styles/tokens.css'
import { applySettings, type Settings } from '../shared/settings'
import { loadSettings, onSettingsChange, saveSettings } from '../shared/store'
import { createEnhancer, type Enhancer } from './enhance'
import { Shell } from './shell'
import { createStage } from './stage'
import { closePalette, closeSheet, openPalette, openSheet, runtime, toast, ui } from './state'

const HOST_ID = 'mist-root'
const SCROLL_PREFIX = 'mist.scroll:'

let enhancer: Enhancer | null = null
let stageHandle: ReturnType<typeof createStage> | null = null
let settings: Settings

/**
 * The enhancer is meant for weibo.com only. `?mist-dev` on a loopback host is
 * the one exception: it lets `scripts/smoke.mjs` drive the real bundle against
 * a locally mirrored timeline, without ever touching the production site.
 */
function isWeibo(): boolean {
  const host = location.hostname
  if (host === 'weibo.com' || host.endsWith('.weibo.com')) return true
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && location.search.includes('mist-dev')
}

function whenBody(): Promise<HTMLElement> {
  if (document.body) return Promise.resolve(document.body)
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(document.body), { once: true })
  })
}

/** `:root[data-x='y']` → `:host([data-x='y'])`; `:root` → `:host`. */
function toHostSelectors(css: string): string {
  return css.replace(/:root((?:\[[^\]]+\])*)/g, (_match, attrs: string) => (attrs ? `:host(${attrs})` : ':host'))
}

function mountShadow(initial: Settings): HTMLElement {
  const host = document.createElement('div')
  host.id = HOST_ID
  host.setAttribute('data-mist-host', '')
  // `all: initial` keeps weibo's own stylesheets from reaching the shell; the
  // shadow root keeps ours from leaking back out.
  host.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; contain: layout style;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  // Inside a shadow root there is no `:root`, so the token layer is rewritten
  // to `:host(...)` — the host carries a mirrored copy of every settings
  // attribute. `:host[x]` is not a legal selector, hence the parentheses.
  style.textContent = `${toHostSelectors(tokensCss)}\n${shellCss}`
  const app = document.createElement('div')
  app.className = 'm-app'
  shadow.append(style, app)
  applySettings(initial, host)
  document.body.append(host)
  render(h(Shell, {}), app)
  return host
}

/** Scroll position per path, restored once the native feed has settled. */
function restoreScroll(): void {
  if (!settings.rememberScroll) return
  const key = `${SCROLL_PREFIX}${location.pathname}`
  let saved = 0
  try {
    saved = Number(sessionStorage.getItem(key) ?? 0)
  } catch {
    return
  }
  if (!saved || saved < 200) return
  window.setTimeout(() => {
    if (window.scrollY > 40) return
    window.scrollTo({ top: saved })
  }, 900)
}

function rememberScroll(): void {
  let last = 0
  window.addEventListener(
    'scroll',
    () => {
      if (!settings.rememberScroll) return
      const now = Date.now()
      if (now - last < 1200) return
      last = now
      try {
        sessionStorage.setItem(`${SCROLL_PREFIX}${location.pathname}`, String(Math.round(window.scrollY)))
      } catch {
        /* storage may be full or blocked; losing one scroll offset is fine */
      }
    },
    { passive: true },
  )
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION'
}

function togglePalette(): void {
  if (ui.get().palette) closePalette()
  else openPalette()
}

function openReader(): void {
  const post = enhancer?.readerFromFocus()
  if (!post) {
    toast('先把光标停在一张卡片上', 'info')
    return
  }
  ui.set({ reader: post })
}

/** Timestamp of the last plain `g`, for the `gg` jump. */
let lastG = 0

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  const mod = event.metaKey || event.ctrlKey
  const key = event.key

  if (key === 'Escape') {
    if (ui.get().palette) {
      closePalette()
      event.preventDefault()
      return
    }
    if (ui.get().sheet) {
      closeSheet()
      event.preventDefault()
      return
    }
    if (ui.get().reader) {
      ui.set({ reader: null })
      event.preventDefault()
      return
    }
    enhancer?.clearFocus()
    return
  }

  if (mod && key.toLowerCase() === 'k') {
    togglePalette()
    event.preventDefault()
    return
  }

  if (mod && key === ',') {
    openSheet('appearance')
    event.preventDefault()
    return
  }

  if (isTyping(event.target) || mod || event.altKey) return
  if (!settings.shortcuts) return
  if (ui.get().palette || ui.get().sheet) return

  switch (key) {
    case '/':
      openPalette()
      event.preventDefault()
      break
    case 'j':
      enhancer?.focusRelative(1)
      event.preventDefault()
      break
    case 'k':
      enhancer?.focusRelative(-1)
      event.preventDefault()
      break
    case 'Enter':
      if (document.querySelector('[data-mist-focus]')) {
        openReader()
        event.preventDefault()
      }
      break
    case 's':
      enhancer?.saveFocused()
      event.preventDefault()
      break
    case 'c':
      if (!enhancer?.compose()) toast('这页没有发博输入框', 'info')
      event.preventDefault()
      break
    case 'f':
      void saveSettings({ focusMode: !settings.focusMode })
      event.preventDefault()
      break
    case 't':
      void saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
      event.preventDefault()
      break
    case 'o':
      if (!enhancer?.openFocused()) toast('先把光标停在一张卡片上', 'info')
      event.preventDefault()
      break
    case 'g':
      // Vim's `gg`: two presses inside 700ms jump back to the top.
      if (Date.now() - lastG < 700) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        lastG = 0
      } else {
        lastG = Date.now()
      }
      break
    case '?':
      openSheet('keys')
      event.preventDefault()
      break
    default:
      break
  }
}

/** One gentle note when the timeline markup is not what we know. */
function watchCompatibility(): void {
  window.setTimeout(() => {
    if (!settings.layout) return
    if (document.querySelector('.card-wrap, [action-type="feed_list_item"]')) return
    if (document.querySelector('.mist-compat-note')) return
    const note = document.createElement('div')
    note.className = 'mist-compat-note'
    note.textContent = 'Mist 尚未识别当前时间线结构 · 页面皮肤与侧栏仍然生效'
    document.body.append(note)
    window.setTimeout(() => note.remove(), 6000)
  }, 9000)
}

async function main(): Promise<void> {
  if (!isWeibo()) return
  if (window.top !== window.self) return
  if (document.getElementById(HOST_ID)) return

  settings = await loadSettings()
  await whenBody()

  applySettings(settings)
  const host = mountShadow(settings)
  document.documentElement.setAttribute('data-mist-booted', 'true')

  runtime.host = 'weibo'
  // Order matters: the stage moves the timeline into our column *before* the
  // enhancer annotates it, so the cards are already where they will live.
  enhancer = createEnhancer(() => settings)
  runtime.api = enhancer

  if (settings.layout) {
    const stage = createStage()
    if (stage.organize()) {
      stageHandle = stage
    }
  }

  onSettingsChange((next) => {
    const layoutChanged = next.layout !== settings.layout
    settings = next
    applySettings(next)
    applySettings(next, host)
    if (layoutChanged) {
      if (next.layout && !stageHandle) {
        const stage = createStage()
        if (stage.organize()) stageHandle = stage
      } else if (!next.layout && stageHandle) {
        stageHandle.destroy()
        stageHandle = null
      }
    }
    enhancer?.refresh(next)
  })

  // Overlays own the page while they are open.
  ui.subscribe((state) => {
    const locked = state.palette || state.sheet || Boolean(state.reader)
    document.body?.classList.toggle('mist-scroll-lock', locked)
  })

  document.addEventListener('keydown', onKeydown, true)
  rememberScroll()
  restoreScroll()
  watchCompatibility()

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message?.type === 'mist:toggle-palette') togglePalette()
      if (message?.type === 'mist:open-settings') openSheet('appearance')
    })
  }

  window.addEventListener(
    'pagehide',
    () => {
      enhancer?.destroy()
      stageHandle?.destroy()
    },
    { once: true },
  )
  console.info(`[mist] shell ready · ${__MIST_VERSION__}`)
}

void main()
