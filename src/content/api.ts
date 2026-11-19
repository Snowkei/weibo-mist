/**
 * Talking to weibo's own JSON API from the content script.
 *
 * The content script is isolated: it has no cookies for XHR. Every call is
 * forwarded to the MAIN-world bridge (`src/main-world/index.ts`), which runs in
 * the page context, so the requests are exactly what weibo's own front end
 * would make — same origin, same session, same XSRF token.
 */

export interface ApiRequest {
  path: string
  params?: Record<string, string | number | null | undefined>
  body?: Record<string, string>
}

interface Reply {
  __mist?: true
  kind?: 'reply'
  id?: number
  ok?: boolean
  payload?: unknown
}

const pending = new Map<number, (payload: unknown) => void>()
let seq = 0
let listening = false

function ensureListener(): void {
  if (listening) return
  listening = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as Reply | null
    if (!data || data.__mist !== true || data.kind !== 'reply') return
    if (typeof data.id !== 'number') return
    const resolve = pending.get(data.id)
    if (!resolve) return
    pending.delete(data.id)
    resolve(data.ok ? data.payload : null)
  })
}

function call(method: 'get' | 'post', request: ApiRequest, timeout = 12000): Promise<unknown> {
  ensureListener()
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    window.postMessage(
      { __mist: true, kind: 'api', id, method, path: request.path, params: request.params, body: request.body },
      window.location.origin,
    )
    window.setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      resolve(null)
    }, timeout)
  })
}

export async function wbGet<T>(path: string, params?: ApiRequest['params']): Promise<T | null> {
  return (await call('get', { path, params })) as T | null
}

export async function wbPost<T>(path: string, body: Record<string, string>): Promise<T | null> {
  return (await call('post', { path, body })) as T | null
}
