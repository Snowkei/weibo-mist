/**
 * Taking the page over.
 *
 * The old approach — matching weibo's class names one by one and nudging them
 * into place — loses the moment weibo ships a new shell: you end up with a
 * floating shell drawn *over* an intact weibo page, which is worse than doing
 * nothing. So instead of guessing selectors, Mist moves the one node it cares
 * about (the timeline list) into its own column and hides everything else.
 *
 * The rules are structural, not nominal:
 *
 *   1. Find the feed list: the lowest common ancestor of the timeline cards.
 *   2. Move it into `#mist-feed`, inside a plain `#mist-stage` container.
 *   3. Hide every other body-level subtree, recursively, except dialog
 *      overlays — which stay reachable and only get skin-deep styling.
 *   4. Keep watching: when weibo swaps the list out (SPA navigation, refresh,
 *      infinite scroll rebuilding the container), re-run 1–3.
 *
 * Nothing here touches the cards themselves, so weibo's own event handlers,
 * delegation and infinite scroll keep working: the list is still in normal
 * document flow, still inside the same document, still scrollable by the
 * window — which is what its scroll listeners are bound to.
 */

const FEED_SELECTORS = [
  '#pl_feedlist_index',
  '[id$="feedlist_index"]',
  '#v6_pl_content_homeFeed',
  '[id$="content_homeFeed"]',
  '.WB_feed',
  '[class*="FeedList"]',
  '[class*="feedList"]',
  '[class*="feed-list"]',
]

const ITEM_SELECTOR =
  '[action-type="feed_list_item"], .card-wrap, .WB_cardwrap, article.WB_cardwrap, [class*="FeedItem"], [class*="feed-item"]'

const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[class*="dialog" i]',
  '[class*="modal" i]',
  '[class*="wbox" i]',
  '[id*="wbox" i]',
  '[class*="W_layer"]',
  '[class*="woo-layer" i]',
  '[class*="popup" i]',
  '[class*="mask" i]',
  '[class*="Mask"]',
].join(',')

const KEEP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE'])

export interface StageOptions {
  /**
   * `data` skips the native list entirely: the containers are still built and
   * the rest of the page is still hidden, but `#mist-feed` is left empty for
   * our own renderer (`timeline.tsx`). The page's timeline is then never needed
   * — which is the whole point of drawing the feed from the API.
   */
  mode?: 'native' | 'data'
}

export interface Stage {
  organize(): boolean
  destroy(): void
  feed(): HTMLElement | null
  stage(): HTMLElement | null
}

/** The lowest common ancestor of the timeline cards. Nominal hits win ties. */
export function findFeedRoot(doc: Document = document): HTMLElement | null {
  const items = Array.from(doc.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
  if (items.length === 0) return null

  // 1. A known container that holds at least two cards, deepest wins.
  let best: { el: HTMLElement; depth: number; count: number } | null = null
  for (const selector of FEED_SELECTORS) {
    for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
      const count = el.querySelectorAll(ITEM_SELECTOR).length
      if (count < 2) continue
      const depth = ancestry(el).length
      if (!best || count > best.count || (count === best.count && depth > best.depth)) {
        best = { el, depth, count }
      }
    }
  }
  if (best) return best.el

  // 2. Structural fallback: walk up from the first card until the ancestor
  //    covers (nearly) all of them.
  const wanted = Math.max(2, Math.ceil(items.length * 0.8))
  let node: HTMLElement | null = items[0]?.parentElement ?? null
  while (node && node !== doc.body) {
    if (node.querySelectorAll(ITEM_SELECTOR).length >= wanted) return node
    node = node.parentElement
  }
  return null
}

function ancestry(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    out.push(node)
    node = node.parentElement
  }
  return out
}

function isOverlay(el: HTMLElement): boolean {
  if (!el.matches(OVERLAY_SELECTOR)) return false
  const { position } = getComputedStyle(el)
  return position === 'fixed' || position === 'absolute' || position === 'sticky'
}

function hasOverlayInside(el: HTMLElement): boolean {
  return Boolean(el.querySelector(OVERLAY_SELECTOR))
}

export function createStage(options: StageOptions = {}): Stage {
  const dataMode = options.mode === 'data'
  let stageEl: HTMLElement | null = null
  let feedEl: HTMLElement | null = null
  let moved: { parent: Node; next: Node | null } | null = null
  let observer: MutationObserver | null = null
  let pending = 0
  let organized = false

  function ensureContainers(): { stage: HTMLElement; feed: HTMLElement } {
    const existingStage = document.getElementById('mist-stage')
    const stage = existingStage ?? document.createElement('div')
    if (!existingStage) {
      stage.id = 'mist-stage'
      document.body.append(stage)
    }
    let feed = stage.querySelector<HTMLElement>(':scope > #mist-feed')
    if (!feed) {
      feed = document.createElement('div')
      feed.id = 'mist-feed'
      stage.append(feed)
    }
    stageEl = stage
    feedEl = feed
    return { stage, feed }
  }

  /** Hide every body-level subtree except ours and reachable dialogs. */
  function sweep(parent: HTMLElement, depth: number): void {
    if (depth > 7) return
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      if (child === stageEl || child.id === 'mist-root') continue
      if (KEEP_TAGS.has(child.tagName)) continue
      if (child.id === 'mist-stage') continue
      if (isOverlay(child)) {
        child.dataset.mistOverlay = 'true'
        delete child.dataset.mistSwept
        continue
      }
      if (hasOverlayInside(child)) {
        sweep(child, depth + 1)
        continue
      }
      child.dataset.mistSwept = 'true'
    }
  }

  /** A dialog can be born inside a subtree we already hid; bring it back. */
  function revive(node: Element): void {
    let current: HTMLElement | null = node as HTMLElement
    while (current && current !== document.body) {
      if (current.dataset.mistSwept === 'true') delete current.dataset.mistSwept
      current = current.parentElement
    }
  }

  function setFeedless(on: boolean): void {
    const html = document.documentElement
    if (on) html.setAttribute('data-mist-feedless', 'true')
    else html.removeAttribute('data-mist-feedless')
    const host = document.getElementById('mist-root')
    if (host) {
      if (on) host.setAttribute('data-mist-feedless', 'true')
      else host.removeAttribute('data-mist-feedless')
    }
  }

  /** Give the page back: no hiding, and the timeline returns to its owner. */
  function unstage(): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-mist-swept]')) {
      delete el.dataset.mistSwept
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-mist-overlay]')) {
      delete el.dataset.mistOverlay
    }
    document.documentElement.removeAttribute('data-mist-staged')
    document.documentElement.removeAttribute('data-mist-feedless')
    const child = feedEl?.firstElementChild
    if (child) {
      if (moved?.parent.isConnected) moved.parent.insertBefore(child, moved.next)
      else child.remove()
    }
    moved = null
    organized = false
  }

  function organize(): boolean {
    if (!document.body) return false
    if (dataMode) {
      ensureContainers()
      setFeedless(false)
      document.documentElement.setAttribute('data-mist-staged', 'true')
      sweep(document.body, 0)
      organized = true
      watch()
      return true
    }
    const root = findFeedRoot()
    if (!root) {
      // The timeline may simply not be painted yet (weibo hydrates late), or
      // this route has no timeline at all. Keep watching either way — a later
      // mutation will call organize() again — and park the center column.
      if (organized) unstage()
      setFeedless(true)
      watch()
      return false
    }
    setFeedless(false)

    const { feed } = ensureContainers()
    if (root.parentElement !== feed) {
      if (root.parentElement && root.parentElement !== feed) {
        moved = { parent: root.parentElement, next: root.nextSibling }
      }
      feed.append(root)
    }
    // Cards inside the moved list are still weibo's; keep their ids stable.
    feed.dataset.mistFeed = root.id || 'feed'
    document.documentElement.setAttribute('data-mist-staged', 'true')
    // The list is inside #mist-stage now, so sweeping the rest cannot touch it.
    if (document.body) sweep(document.body, 0)
    organized = true
    return true
  }

  let misses = 0

  function schedule(): void {
    if (pending) return
    pending = window.setTimeout(() => {
      pending = 0
      if (!document.body) return
      if (dataMode) {
        if (!document.getElementById('mist-stage')) ensureContainers()
        sweep(document.body, 0)
        return
      }
      if (!findFeedRoot()) {
        misses += 1
        // Weibo clears the list while navigating; only give up after the page
        // has stayed feed-less twice in a row.
        if (misses >= 2) unstage()
        return
      }
      misses = 0
      // SPA navigation replaces the feed: the old list either left the stage or
      // went stale, and a fresh one appeared somewhere in the page.
      const stale = !feedEl || !feedEl.contains(feedEl?.firstElementChild ?? null) || !feedEl.firstElementChild
      if (stale || !document.getElementById('mist-stage')) {
        organize()
        return
      }
      sweep(document.body, 0)
      if (organized) document.documentElement.setAttribute('data-mist-staged', 'true')
    }, 240)
  }

  function watch(): void {
    if (observer) return
    observer = new MutationObserver((records) => {
      let structural = false
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          if (node.matches?.(OVERLAY_SELECTOR) && isOverlay(node)) {
            revive(node)
            continue
          }
          if (node.querySelector?.(OVERLAY_SELECTOR)) {
            for (const inner of node.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) revive(inner)
          }
          structural = true
        }
        for (const node of record.removedNodes) {
          if (node instanceof HTMLElement && node.contains(feedEl)) structural = true
        }
      }
      if (structural) schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  return {
    organize(): boolean {
      const ok = organize()
      if (ok) watch()
      return ok
    },
    feed: () => feedEl,
    stage: () => stageEl,
    destroy(): void {
      observer?.disconnect()
      observer = null
      if (pending) window.clearTimeout(pending)
      pending = 0
      for (const el of document.querySelectorAll<HTMLElement>('[data-mist-swept]')) {
        delete el.dataset.mistSwept
      }
      for (const el of document.querySelectorAll<HTMLElement>('[data-mist-overlay]')) {
        delete el.dataset.mistOverlay
      }
      document.documentElement.removeAttribute('data-mist-staged')
      if (feedEl?.firstElementChild && moved) {
        moved.parent.insertBefore(feedEl.firstElementChild, moved.next)
      }
      stageEl?.remove()
      stageEl = null
      feedEl = null
      moved = null
      organized = false
    },
  }
}
