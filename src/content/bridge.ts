/**
 * Talking to the page world.
 *
 * The content script is isolated, so anything that needs weibo.com's cookies
 * (hot search, profile) has to be asked of the MAIN-world script over
 * postMessage. Requests carry a numeric id and time out quietly — a missing
 * bridge must never block the UI.
 */

export type BridgeKind = 'hot' | 'profile'

interface BridgeRequest {
  __mist: true
  kind: BridgeKind
  id: number
  payload?: unknown
}

interface BridgeReply {
  __mist: true
  kind: 'reply'
  id: number
  ok: boolean
  payload?: unknown
}

const pending = new Map<number, (payload: unknown) => void>()
let listening = false
let seq = 0

function ensureListener(): void {
  if (listening) return
  listening = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as BridgeReply | null
    if (!data || data.__mist !== true || data.kind !== 'reply') return
    const resolve = pending.get(data.id)
    if (!resolve) return
    pending.delete(data.id)
    resolve(data.ok ? data.payload : null)
  })
}

export function ask<T>(kind: BridgeKind, timeout = 4000): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  ensureListener()
  const id = ++seq
  return new Promise<T | null>((resolve) => {
    pending.set(id, (payload) => resolve(payload as T | null))
    const request: BridgeRequest = { __mist: true, kind, id }
    window.postMessage(request, window.location.origin)
    window.setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      resolve(null)
    }, timeout)
  })
}

export interface RawHot {
  word?: string
  note?: string
  num?: number
  label_name?: string
  word_scheme?: string
}

export interface RawProfile {
  screen_name?: string
  avatar_large?: string
  profile_url?: string
  idstr?: string
}
