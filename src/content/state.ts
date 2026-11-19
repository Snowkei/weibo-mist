import { useEffect, useState } from 'preact/hooks'
import type { IconName } from '../shared/icons'

/**
 * Shell state lives outside the component tree: the content script, the
 * enhancer and the demo all poke the same store, so the UI never has to know
 * who changed what.
 */

export type View = 'all' | 'text' | 'long' | 'video'
export type SheetSection = 'appearance' | 'layout' | 'reading' | 'filters' | 'keys' | 'about'

export interface HotItem {
  rank: number
  title: string
  heat?: string
  url: string
  tag?: string
}

export interface ReaderPost {
  name: string
  text: string
  meta?: string
  url?: string
}

export interface ToastItem {
  id: number
  text: string
  icon?: IconName
}

export interface Account {
  name: string
  handle: string
  avatar: string
}

export interface Stats {
  total: number
  visible: number
  filtered: number
  duplicates: number
}

export interface ShellState {
  booted: boolean
  palette: boolean
  paletteQuery: string
  sheet: boolean
  sheetSection: SheetSection
  view: View
  progress: number
  scrolled: boolean
  reader: ReaderPost | null
  toasts: ToastItem[]
  hot: HotItem[]
  hotState: 'idle' | 'loading' | 'ready' | 'failed'
  stats: Stats
  account: Account | null
}

export interface Store<T extends object> {
  get(): T
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void
  subscribe(fn: (s: T) => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<(s: T) => void>()
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      for (const listener of listeners) listener(state)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useStore<T extends object>(store: Store<T>): T {
  const [state, setState] = useState<T>(store.get())
  useEffect(() => store.subscribe(setState), [store])
  return state
}

export const ui = createStore<ShellState>({
  booted: false,
  palette: false,
  paletteQuery: '',
  sheet: false,
  sheetSection: 'appearance',
  view: 'all',
  progress: 0,
  scrolled: false,
  reader: null,
  toasts: [],
  hot: [],
  hotState: 'idle',
  stats: { total: 0, visible: 0, filtered: 0, duplicates: 0 },
  account: null,
})

let toastSeq = 0

export function toast(text: string, icon?: IconName): void {
  const id = ++toastSeq
  ui.set((s) => ({ toasts: [...s.toasts, { id, text, icon }].slice(-3) }))
  window.setTimeout(() => {
    ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }, 2400)
}

export const openPalette = (query = ''): void => ui.set({ palette: true, paletteQuery: query })
export const closePalette = (): void => ui.set({ palette: false, paletteQuery: '' })
export const openSheet = (section: SheetSection = 'appearance'): void => ui.set({ sheet: true, sheetSection: section })
export const closeSheet = (): void => ui.set({ sheet: false })

/** The shell talks to the page through this seam; the demo leaves it empty. */
export interface EnhancerApi {
  setView(view: View): void
  readerFromFocus(): ReaderPost | null
  focusRelative(dir: 1 | -1): void
  clearFocus(): void
  rescan(): void
  compose(): boolean
  saveFocused(): boolean
  /** Open the hovered post in a new tab; false when there is nothing to open. */
  openFocused(): boolean
}

export const runtime: { api: EnhancerApi | null; host: 'weibo' | 'demo' } = {
  api: null,
  host: 'demo',
}
