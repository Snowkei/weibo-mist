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
  id?: string
}

function reply(id: string | undefined, data: unknown): void {
  window.postMessage({ __mist: true, kind: 'reply', id, data }, ORIGIN)
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`${response.status} ${path}`)
  return response.json()
}

async function hotSearch(id?: string): Promise<void> {
  try {
    const json = (await getJson('/ajax/side/hotSearch')) as { data?: { realtime?: unknown[] } }
    reply(id, { realtime: json.data?.realtime ?? [] })
  } catch (error) {
    console.warn('[mist] hot search unavailable', error)
    reply(id, null)
  }
}

async function profile(id?: string): Promise<void> {
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
