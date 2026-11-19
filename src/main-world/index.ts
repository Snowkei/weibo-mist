/**
 * MAIN-world companion.
 *
 * Content scripts are isolated: they cannot read weibo's own session APIs.
 * This file runs in the page's JS context, so it can fetch the same-origin
 * endpoints weibo's own front-end uses and hand the result back over a
 * postMessage channel (see src/content/bridge.ts).
 *
 * It also owns one piece of page behaviour the isolated world cannot reach:
 * refusing autoplay when the user turned it off.
 */

const ORIGIN = location.origin

interface BridgeRequest {
  __mist?: boolean
  kind?: string
  id?: number
}

/**
 * The reply shape is the contract in src/content/bridge.ts: `ok` decides
 * whether the payload is trusted, `payload` carries it. Getting this wrong
 * fails silently — the panel just says "读取失败".
 */
function reply(id: number | undefined, payload: unknown): void {
  window.postMessage({ __mist: true, kind: 'reply', id, ok: payload !== null, payload }, ORIGIN)
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${response.status} ${path}`)
  return response.json()
}

const HOT_ENDPOINTS = [
  '/ajax/side/hotSearch',
  '/ajax/statuses/hot_band',
  '/ajax/side/search/hot_band',
]

async function hotSearch(id?: number): Promise<void> {
  for (const path of HOT_ENDPOINTS) {
    try {
      const json = (await getJson(path)) as {
        data?: { realtime?: unknown[]; band_list?: unknown[]; hotgov?: unknown }
      }
      const list = json.data?.realtime ?? json.data?.band_list ?? []
      if (Array.isArray(list) && list.length > 0) {
        reply(id, { realtime: list })
        return
      }
    } catch (error) {
      console.warn('[mist] hot search endpoint failed', path, error)
    }
  }
  reply(id, null)
}

async function profile(id?: number): Promise<void> {
  try {
    const json = (await getJson('/ajax/profile/info')) as { data?: { user?: unknown } }
    reply(id, { user: json.data?.user ?? null })
  } catch (error) {
    console.warn('[mist] profile unavailable', error)
    reply(id, null)
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== ORIGIN) return
  const data = event.data as BridgeRequest | null
  if (!data || data.__mist !== true || data.kind === 'reply') return
  switch (data.kind) {
    case 'hot':
      void hotSearch(data.id)
      break
    case 'profile':
      void profile(data.id)
      break
    default:
      break
  }
})

/** Autoplay: the only control that has to live in the page context. */
function guardAutoplay(): void {
  const off = document.documentElement.dataset.mistAutoplay === 'off'
  if (!off) return
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
