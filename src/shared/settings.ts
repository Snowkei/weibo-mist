/**
 * Settings: one typed schema, one normaliser, one storage contract.
 *
 * Everything the UI can change lives here. Content script, popup-less action,
 * palette and settings sheet all read from the same snapshot, so a toggle in
 * one place is instantly true everywhere.
 */

export type ThemeMode = 'auto' | 'light' | 'dark'
export type Tint = 'mist' | 'graphite' | 'sand' | 'salt' | 'dusk'
export type Glass = 'off' | 'soft' | 'strong'
export type FontChoice = 'system' | 'serif' | 'rounded'

export type FilterKind = 'promoted' | 'recommend' | 'superTopic' | 'vote' | 'lottery' | 'live' | 'task'

export interface ContentFilters {
  enabled: boolean
  kinds: FilterKind[]
  keywords: string[]
  users: string[]
}

export interface Settings {
  version: number
  theme: ThemeMode
  tint: Tint
  glass: Glass
  font: FontChoice
  fontScale: number
  lineHeight: number
  railCollapsed: boolean
  aside: boolean
  layout: boolean
  hidePromos: boolean
  hideClient: boolean
  hideAds: boolean
  hideSuggested: boolean
  autoplay: boolean
  autoExpand: boolean
  focusMode: boolean
  progressBar: boolean
  rememberScroll: boolean
  shortcuts: boolean
  filters: ContentFilters
}

export const SETTINGS_VERSION = 2

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  theme: 'auto',
  tint: 'mist',
  glass: 'soft',
  font: 'system',
  fontScale: 1,
  lineHeight: 1.6,
  railCollapsed: false,
  aside: true,
  layout: true,
  hidePromos: true,
  hideClient: true,
  hideAds: true,
  hideSuggested: true,
  autoplay: false,
  autoExpand: true,
  focusMode: false,
  progressBar: true,
  rememberScroll: true,
  shortcuts: true,
  filters: {
    enabled: true,
    kinds: ['promoted', 'recommend'],
    keywords: [],
    users: [],
  },
}

const THEMES: ThemeMode[] = ['auto', 'light', 'dark']
const TINTS: Tint[] = ['mist', 'graphite', 'sand', 'salt', 'dusk']
const GLASSES: Glass[] = ['off', 'soft', 'strong']
const FONTS: FontChoice[] = ['system', 'serif', 'rounded']
const KINDS: FilterKind[] = ['promoted', 'recommend', 'superTopic', 'vote', 'lottery', 'live', 'task']

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, list: T[], fallback: T): T =>
  typeof v === 'string' && (list as string[]).includes(v) ? (v as T) : fallback

function stringList(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || trimmed.length > 120) continue
    if (!out.includes(trimmed)) out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}

export function normalizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings> & {
    filters?: Partial<ContentFilters>
  }
  const filters = (input.filters ?? {}) as Partial<ContentFilters>
  return {
    version: SETTINGS_VERSION,
    theme: oneOf(input.theme, THEMES, DEFAULT_SETTINGS.theme),
    tint: oneOf(input.tint, TINTS, DEFAULT_SETTINGS.tint),
    glass: oneOf(input.glass, GLASSES, DEFAULT_SETTINGS.glass),
    font: oneOf(input.font, FONTS, DEFAULT_SETTINGS.font),
    fontScale: clamp(typeof input.fontScale === 'number' && Number.isFinite(input.fontScale) ? input.fontScale : 1, 0.85, 1.3),
    lineHeight: clamp(typeof input.lineHeight === 'number' && Number.isFinite(input.lineHeight) ? input.lineHeight : 1.6, 1.3, 2),
    railCollapsed: bool(input.railCollapsed, DEFAULT_SETTINGS.railCollapsed),
    aside: bool(input.aside, DEFAULT_SETTINGS.aside),
    layout: bool(input.layout, DEFAULT_SETTINGS.layout),
    hidePromos: bool(input.hidePromos, DEFAULT_SETTINGS.hidePromos),
    hideClient: bool(input.hideClient, DEFAULT_SETTINGS.hideClient),
    hideAds: bool(input.hideAds, DEFAULT_SETTINGS.hideAds),
    hideSuggested: bool(input.hideSuggested, DEFAULT_SETTINGS.hideSuggested),
    autoplay: bool(input.autoplay, DEFAULT_SETTINGS.autoplay),
    autoExpand: bool(input.autoExpand, DEFAULT_SETTINGS.autoExpand),
    focusMode: bool(input.focusMode, DEFAULT_SETTINGS.focusMode),
    progressBar: bool(input.progressBar, DEFAULT_SETTINGS.progressBar),
    rememberScroll: bool(input.rememberScroll, DEFAULT_SETTINGS.rememberScroll),
    shortcuts: bool(input.shortcuts, DEFAULT_SETTINGS.shortcuts),
    filters: {
      enabled: bool(filters.enabled, DEFAULT_SETTINGS.filters.enabled),
      kinds: Array.isArray(filters.kinds)
        ? KINDS.filter((k) => (filters.kinds as string[]).includes(k))
        : [...DEFAULT_SETTINGS.filters.kinds],
      keywords: stringList(filters.keywords, 200),
      users: stringList(filters.users, 200),
    },
  }
}

/** The attribute contract between settings and CSS. */
export function settingsToAttributes(s: Settings): Record<string, string> {
  return {
    'data-mist-theme': resolveTheme(s.theme),
    'data-mist-tint': s.tint,
    'data-mist-glass': s.glass,
    'data-mist-font': s.font,
    'data-mist-hide-promos': String(s.hidePromos),
    'data-mist-hide-client': String(s.hideClient),
    'data-mist-hide-ads': String(s.hideAds),
    'data-mist-hide-suggested': String(s.hideSuggested),
    'data-mist-autoplay': s.autoplay ? 'on' : 'off',
    'data-mist-focus': String(s.focusMode),
    'data-mist-clamp': String(!s.autoExpand),
    'data-mist-filters': String(s.filters.enabled),
    'data-mist-layout': String(s.layout),
    'data-mist-rail': s.railCollapsed ? 'collapsed' : 'expanded',
    'data-mist-aside': String(s.aside),
  }
}

export function settingsToVariables(s: Settings): Record<string, string> {
  const size = (15 * s.fontScale).toFixed(2)
  return {
    '--mist-reading-size': `${size}px`,
    '--mist-reading-leading': String(s.lineHeight),
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'auto') return mode
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applySettings(s: Settings, target: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(settingsToAttributes(s))) target.setAttribute(key, value)
  for (const [key, value] of Object.entries(settingsToVariables(s))) target.style.setProperty(key, value)
}
