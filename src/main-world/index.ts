/**
 * MAIN-world API bridge.
 *
 * Content scripts cannot read weibo's session cookies, so every data call goes
 * through here: same-origin `fetch`, `credentials: 'include'`, and the
 * `X-XSRF-TOKEN` header weibo's own front end sends on POSTs.
 *
 * This file renders nothing and owns no UI — it is transport, plus the one bit
 * of page behaviour the isolated world cannot reach (refusing autoplay).
 */

const ORIGIN = location.origin

interface ApiRequest {
  __mist?: boolean
  kind?: string
  id?: number
  method?: 'get' | 'post'
  path?: string
  params?: Record<string, string | number | null | undefined>
  body?: Record<string, string>
}

function reply(id: number | undefined, payload: unknown): void {
  window.postMessage({ __mist: true, kind: 'reply', id, ok: payload !== null, payload }, ORIGIN)
}

function xsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function buildUrl(path: string, params: ApiRequest['params']): string {
  const url = new URL(path, ORIGIN)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function request(req: ApiRequest): Promise<unknown> {
  const path = req.path ?? ''
  if (!path) return null
  const url = buildUrl(path, req.params)
  const method = (req.method ?? 'get').toUpperCase()
  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'x-requested-with': 'XMLHttpRequest',
  }
  let body: string | undefined
  if (method === 'POST') {
    const token = xsrfToken()
    if (token) headers['x-xsrf-token'] = token
    headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    body = new URLSearchParams(req.body ?? {}).toString()
  }
  const response = await fetch(url, { method, headers, body, credentials: 'include' })
  if (!response.ok) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== ORIGIN) return
  const data = event.data as ApiRequest | null
  if (!data || data.__mist !== true || data.kind !== 'api') return
  void request(data)
    .then((payload) => reply(data.id, payload ?? null))
    .catch(() => reply(data.id, null))
})

/** Profile of the logged-in account: the rail shows it. */
async function profile(id: number | undefined): Promise<void> {
  reply(id, await request({ path: '/ajax/profile/info' }).catch(() => null))
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== ORIGIN) return
  const data = event.data as ApiRequest | null
  if (!data || data.__mist !== true || data.kind !== 'profile') return
  void profile(data.id)
})

/** Autoplay: the only control that has to live in the page context. */
function guardAutoplay(): void {
  if (document.documentElement.dataset.mistAutoplay !== 'off') return
  for (const video of document.querySelectorAll<HTMLVideoElement>('video')) {
    if (!video.autoplay && video.paused) continue
    video.autoplay = false
    video.removeAttribute('autoplay')
    if (!video.paused) video.pause()
  }
}

function watchAutoplay(): void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        guardAutoplay()
        return
      }
      for (const node of record.addedNodes) {
        if (node instanceof HTMLVideoElement) guardAutoplay()
        else if (node instanceof HTMLElement && node.querySelector('video')) guardAutoplay()
      }
    }
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributeFilter: ['data-mist-autoplay'],
  })
  guardAutoplay()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchAutoplay, { once: true })
} else {
  watchAutoplay()
}

;(window as unknown as { __MIST_MAIN__?: string }).__MIST_MAIN__ = __MIST_VERSION__
