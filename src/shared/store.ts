import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
} from './settings'

const KEY = 'mist.settings'

type Listener = (s: Settings) => void

const listeners = new Set<Listener>()
let snapshot: Settings = DEFAULT_SETTINGS
let loaded = false

const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.storage?.sync?.get

function readLocal(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* quota or privacy mode: settings stay in memory for this session */
  }
}

function emit(next: Settings): void {
  snapshot = next
  for (const listener of listeners) {
    try {
      listener(next)
    } catch (error) {
      console.error('[mist] settings listener failed', error)
    }
  }
}

/** Load once, then keep every consumer in sync. */
export async function loadSettings(): Promise<Settings> {
  if (loaded) return snapshot
  loaded = true

  if (hasChromeStorage()) {
    try {
      const stored = await chrome.storage.sync.get(KEY)
      snapshot = normalizeSettings(stored?.[KEY] ?? readLocal() ?? DEFAULT_SETTINGS)
    } catch {
      snapshot = normalizeSettings(readLocal() ?? DEFAULT_SETTINGS)
    }
  } else {
    snapshot = normalizeSettings(readLocal() ?? DEFAULT_SETTINGS)
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[KEY]) return
      emit(normalizeSettings(changes[KEY].newValue))
    })
  }

  return snapshot
}

export function getSettings(): Settings {
  return snapshot
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({
    ...snapshot,
    ...patch,
    filters: { ...snapshot.filters, ...(patch.filters ?? {}) },
  })
  emit(next)
  if (hasChromeStorage()) {
    try {
      await chrome.storage.sync.set({ [KEY]: next })
      return next
    } catch {
      /* fall through to local */
    }
  }
  writeLocal(next)
  return next
}

export function resetSettings(): Promise<Settings> {
  return saveSettings(DEFAULT_SETTINGS)
}

export function onSettingsChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Palette + settings sheet both toggle single values; keep the helper here. */
export type ToggleKey =
  | 'aside'
  | 'railCollapsed'
  | 'layout'
  | 'focusMode'
  | 'hideAds'
  | 'hidePromos'
  | 'hideClient'
  | 'hideSuggested'
  | 'autoExpand'
  | 'autoplay'
  | 'progressBar'
  | 'shortcuts'

export function toggle(key: ToggleKey): Promise<Settings> {
  return saveSettings({ [key]: !snapshot[key] } as Partial<Settings>)
}
