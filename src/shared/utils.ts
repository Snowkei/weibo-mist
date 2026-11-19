/** Small utilities shared by the shell, the skin and the tests. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let frame = 0
  let lastArgs: A
  return (...args: A) => {
    lastArgs = args
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      fn(...lastArgs)
    })
  }
}

/** 12345 → 1.2万, 1234 → 1,234, 999999999 → 10亿 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 100_000_000) return `${trim(n / 100_000_000)}亿`
  if (n >= 10_000) return `${trim(n / 10_000)}万`
  return n.toLocaleString('zh-CN')
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '')
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/** Minimal HTML-escape for anything we hand to innerHTML (never for user text). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const isMacPlatform = isMac()
