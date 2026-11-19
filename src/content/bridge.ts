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

/**
 * Ask the MAIN world something. Both scripts are injected at document_start and
 * their order is not guaranteed, so a first request can land before the page
 * world installed its listener — hence one silent retry.
 */
export function ask<T>(kind: BridgeKind, timeout = 4000): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  ensureListener()

  return new Promise<T | null>((resolve) => {
    const send = (delayBefore: number): void => {
      const id = ++seq
      window.setTimeout(() => {
        pending.set(id, (payload) => resolve(payload as T | null))
        const request: BridgeRequest = { __mist: true, kind, id }
        window.postMessage(request, window.location.origin)
      }, delayBefore)
      window.setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        if (delayBefore === 0) send(700)
        else resolve(null)
      }, delayBefore === 0 ? Math.min(1200, timeout / 2) : timeout)
    }
    send(0)
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
