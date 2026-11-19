import type { FilterKind, Settings } from '../shared/settings'
import { toast, ui, type EnhancerApi, type ReaderPost, type View } from './state'

/**
 * The enhancer never re-renders the feed — it annotates the DOM weibo already
 * produced, then lets CSS carry the visual weight. Every annotation is a data
 * attribute, so it is reversible and debuggable from devtools.
 *
 *   data-mist-id            stable mblog id (dedupe + jump targets)
 *   data-mist-item          "this is a feed card" marker
 *   data-mist-ad            ad / sponsored card
 *   data-mist-suggested     algorithmic recommendation card
 *   data-mist-kind          text | image | video | long
 *   data-mist-hidden        filtered out right now
 *   data-mist-long          body copy over the clamp threshold
 *   data-mist-focus         the card currently being read
 */

export interface Enhancer extends EnhancerApi {
  destroy(): void
  refresh(settings: Settings): void
}

const ITEM_SELECTOR = ['#pl_feedlist_index .card-wrap', '.card-wrap[action-type="feed_list_item"]', 'article.WB_cardwrap'].join(',')

const AD_LABELS = new Set(['广告', '推广', '赞助', '广告推广', 'Sponsored'])
const SUGGEST_LABELS = new Set(['推荐', '热门', '猜你喜欢', '为你推荐', '可能感兴趣', '兴趣推荐', '热门推荐', '大家都在看'])

const EXPAND_SELECTOR = 'a[action-type="feed_list_expand"], .WB_text_opt, .txt a'
const FAVOURITE_SELECTOR = 'a[action-type="feed_list_favorite"], [title*="收藏"], .woo-like-handle [action-type="favorite"]'
const COMPOSE_SELECTOR = '#homeWrap .W_input, .W_input, textarea[placeholder*="新鲜"], textarea.W_input'
const COMPOSE_ENTRY_SELECTOR = [
  'a[action-type="post"]',
  '.W_btn_a[title*="发微博"]',
  'a[href$="/share"]',
  '[class*="compose" i] button',
  '[class*="Compose"] button',
  '[title="写微博"]',
].join(',')

export function createEnhancer(getSettings: () => Settings): Enhancer {
  let settings = getSettings()
  let observer: MutationObserver | null = null
  let pending = 0
  let seenOnLoad = 0

  function scan(): void {
    const cards = collectCards()
    const ids = new Set<string>()
    let visible = 0
    let filtered = 0
    let duplicates = 0

    for (const card of cards) {
      annotate(card, settings)
      const text = bodyText(card)
      const author = authorOf(card)
      const id = card.dataset.mistId ?? ''

      let hide = false
      if (settings.hideAds && card.dataset.mistAd === 'true') hide = true
      if (settings.hideSuggested && card.dataset.mistSuggested === 'true') hide = true
      if (settings.filters.enabled) {
        if (id && ids.has(id)) {
          duplicates += 1
          hide = true
        }
        const tags = (card.dataset.mistTags ?? '').split(' ').filter(Boolean) as FilterKind[]
        if (settings.filters.kinds.some((kind) => tags.includes(kind))) hide = true
        if (!hide && matchesKeywords(text, settings.filters.keywords)) hide = true
        if (!hide && matchesUser(author, settings.filters.users)) hide = true
      }
      if (id) ids.add(id)

      if (hide) {
        filtered += 1
        card.dataset.mistHidden = 'true'
      } else {
        delete card.dataset.mistHidden
        visible += 1
      }
    }

    if (cards.length !== seenOnLoad || ui.get().stats.total !== cards.length) seenOnLoad = cards.length
    ui.set({ stats: { total: cards.length, visible, filtered, duplicates } })
    document.documentElement.dataset.mistView = ui.get().view
  }

  function schedule(): void {
    if (pending) return
    pending = window.setTimeout(() => {
      pending = 0
      scan()
    }, 180)
  }

  function annotate(card: HTMLElement, s: Settings): void {
    card.dataset.mistItem = 'true'
    const id = midOf(card)
    if (id) card.dataset.mistId = id

    const textEl = textElement(card)
    const text = (textEl?.textContent ?? '').trim()
    const kind = kindOf(card, text)
    card.dataset.mistKind = kind

    if (textEl) {
      const long = text.length > 380 || kind === 'long'
      if (long) textEl.dataset.mistLong = 'true'
      else delete textEl.dataset.mistLong
    }

    const ad = isAd(card)
    const suggested = !ad && isSuggested(card)
    card.dataset.mistAd = String(ad)
    card.dataset.mistSuggested = String(suggested)
    card.dataset.mistTags = tagsOf(card, ad, suggested).join(' ')

    if (s.autoExpand) expand(card)
  }

  function expand(card: HTMLElement): void {
    const link = card.querySelector<HTMLElement>(EXPAND_SELECTOR)
    if (!link) return
    const label = (link.textContent ?? '').trim()
    if (!label.includes('展开') && !label.includes('全文')) return
    if (card.dataset.mistExpanded === 'true') return
    card.dataset.mistExpanded = 'true'
    link.click()
  }

  function collectCards(): HTMLElement[] {
    const out: HTMLElement[] = []
    for (const node of document.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
      // Quoted posts nest inside a card; only take the outermost one.
      const outer = node.parentElement?.closest(ITEM_SELECTOR)
      if (outer) continue
      out.push(node)
    }
    return out
  }

  function visibleCards(): HTMLElement[] {
    return collectCards().filter((card) => card.dataset.mistHidden !== 'true')
  }

  function focusedCard(): HTMLElement | null {
    const explicit = document.querySelector<HTMLElement>('[data-mist-focus]')
    if (explicit) return explicit
    const viewport = visibleCards().find((card) => {
      const rect = card.getBoundingClientRect()
      return rect.top >= 0 && rect.top < window.innerHeight * 0.6
    })
    return viewport ?? null
  }

  function setFocus(card: HTMLElement | null): void {
    for (const node of document.querySelectorAll<HTMLElement>('[data-mist-focus]')) {
      if (node !== card) node.removeAttribute('data-mist-focus')
    }
    if (!card) return
    card.setAttribute('data-mist-focus', 'true')
  }

  const api: Enhancer = {
    refresh(next: Settings): void {
      settings = next
      scan()
    },
    rescan(): void {
      seenOnLoad = -1
      scan()
    },
    setView(view: View): void {
      ui.set({ view })
      document.documentElement.dataset.mistView = view
    },
    focusRelative(dir: 1 | -1): void {
      const list = visibleCards()
      if (list.length === 0) return
      const current = focusedCard()
      const index = current ? list.indexOf(current) : -1
      const next = list[Math.min(list.length - 1, Math.max(0, index + dir))]
      if (!next) return
      setFocus(next)
      next.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    clearFocus(): void {
      setFocus(null)
      document.documentElement.dataset.mistFocus = 'false'
    },
    readerFromFocus(): ReaderPost | null {
      const card = focusedCard()
      if (!card) return null
      setFocus(card)
      const name = authorOf(card) || '微博'
      const meta = metaOf(card)
      const text = (textElement(card)?.textContent ?? '').trim()
      const url = permalinkOf(card)
      if (!text) return null
      return { name, meta, text, url }
    },
    compose(): boolean {
      // The inline composer is hidden by the stage sweep, so the entry point is
      // the native "写微博" trigger — it opens weibo's own dialog, which we keep.
      const entry = document.querySelector<HTMLElement>(COMPOSE_ENTRY_SELECTOR)
      if (entry) {
        entry.click()
        return true
      }
      const input = document.querySelector<HTMLElement>(COMPOSE_SELECTOR)
      if (!input) return false
      input.scrollIntoView({ block: 'center', behavior: 'smooth' })
      window.setTimeout(() => {
        input.focus()
        if (input instanceof HTMLTextAreaElement) {
          const end = input.value.length
          input.setSelectionRange(end, end)
        }
      }, 240)
      return true
    },
    saveFocused(): boolean {
      const card = focusedCard()
      if (!card) return false
      const button = card.querySelector<HTMLElement>(FAVOURITE_SELECTOR)
      if (!button) {
        toast('这条微博没有收藏入口', 'info')
        return false
      }
      button.click()
      toast('已收藏', 'bookmark')
      return true
    },
    openFocused(): boolean {
      const card = focusedCard()
      if (!card) return false
      const link = card.querySelector<HTMLAnchorElement>(POST_LINK_SELECTOR)
      const href = link?.href
      if (!href) return false
      window.open(href, '_blank', 'noopener,noreferrer')
      return true
    },
    destroy(): void {
      observer?.disconnect()
      observer = null
      document.removeEventListener('click', onTextClick, true)
      if (pending) window.clearTimeout(pending)
      pending = 0
      for (const node of document.querySelectorAll<HTMLElement>('[data-mist-item]')) {
        delete node.dataset.mistItem
        delete node.dataset.mistHidden
        delete node.dataset.mistKind
      }
    },
  }

  // Clamped text: a click anywhere in the body behaves like "展开全文".
  function onTextClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!target || !target.closest) return
    const text = target.closest<HTMLElement>('.txt, .WB_text')
    if (!text || text.dataset.mistLong !== 'true') return
    if (document.documentElement.dataset.mistClamp !== 'true') return
    const card = text.closest<HTMLElement>('[data-mist-item="true"]')
    if (!card || card.dataset.mistExpanded === 'true') return
    expand(card)
    text.dataset.mistOpen = 'true'
  }
  document.addEventListener('click', onTextClick, true)

  // First pass + one observer for the infinite feed. Weibo swaps cards in and
  // out constantly, so we debounce and only ever annotate, never rebuild.
  scan()
  observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })

  return api
}

function textElement(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>('.txt, .WB_text, .detail_wbtext')
}

function bodyText(card: HTMLElement): string {
  return (textElement(card)?.textContent ?? '').toLowerCase()
}

function authorOf(card: HTMLElement): string {
  const node = card.querySelector<HTMLElement>('.info .name, .WB_info .name, .WB_name, .name')
  return (node?.textContent ?? '').trim()
}

function metaOf(card: HTMLElement): string | undefined {
  const node = card.querySelector<HTMLElement>('.from, .WB_from')
  const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text || undefined
}

function midOf(card: HTMLElement): string {
  const direct = card.getAttribute('mid') ?? card.dataset.mid ?? ''
  if (direct) return direct
  const href = card.querySelector<HTMLAnchorElement>('a[href*="/status/"], a[href*="/detail/"]')?.getAttribute('href') ?? ''
  const match = href.match(/(?:status|detail)\/([A-Za-z0-9]+)/)
  return match?.[1] ?? ''
}

function permalinkOf(card: HTMLElement): string | undefined {
  const href = card.querySelector<HTMLAnchorElement>('.from a, .WB_from a')?.getAttribute('href')
  if (!href) return undefined
  if (href.startsWith('http')) return href
  return `https:${href.startsWith('//') ? '' : '//'}${href.replace(/^\//, '')}`
}

function kindOf(card: HTMLElement, text: string): 'text' | 'image' | 'video' | 'long' {
  if (card.querySelector('video, .media-wrap video, [action-type="fl_video"], .WB_video, .thumbnail')) return 'video'
  const hasImage = Boolean(card.querySelector('.media-wrap img, .picture img, .WB_media_wrap img, .WB_media_a img'))
  if (text.length > 380) return 'long'
  if (text.length > 240 && /展开全文|全文/.test(text)) return 'long'
  if (hasImage) return 'image'
  return 'text'
}

function isAd(card: HTMLElement): boolean {
  if (card.hasAttribute('adid') || card.querySelector('[adid], [data-ad], [class*="promotion"], [class*="Promotion"]')) return true
  return hasLabel(card, AD_LABELS)
}

/**
 * Content tags, separate from the layout `kind`: these map 1:1 onto the
 * FilterKind list the settings sheet exposes.
 */
function tagsOf(card: HTMLElement, ad: boolean, suggested: boolean): FilterKind[] {
  const tags: FilterKind[] = []
  const text = bodyText(card)
  if (ad) tags.push('promoted')
  if (suggested) tags.push('recommend')
  if (card.querySelector('.a_topic, a[href*="huati"], a[href*="/super/"], [class*="superTopic"]') || /#[^#\s]{1,20}#/.test(text)) {
    tags.push('superTopic')
  }
  if (card.querySelector('[action-type="vote"], [class*="vote"], [class*="Vote"]') || /(投票|投一票)/.test(text)) tags.push('vote')
  if (card.querySelector('[class*="lottery"], [class*="Lottery"]') || /(抽奖|转发抽|中奖)/.test(text)) tags.push('lottery')
  if (card.querySelector('[class*="live"], [class*="Live"], a[href*="/l/wblive"]') || /(正在直播|直播间)/.test(text)) tags.push('live')
  if (card.querySelector('[class*="task"], [class*="Task"], [class*="checkin"]') || /(打卡|做任务|任务中心)/.test(text)) tags.push('task')
  return tags
}

function isSuggested(card: HTMLElement): boolean {
  return hasLabel(card, SUGGEST_LABELS)
}

/** Look for a tiny leaf node whose whole text is a badge label ("广告", "推荐"). */
function hasLabel(card: HTMLElement, labels: Set<string>): boolean {
  for (const node of card.querySelectorAll<HTMLElement>('span, em, i, div, b')) {
    if (node.children.length > 0) continue
    const text = (node.textContent ?? '').trim()
    if (text.length === 0 || text.length > 8) continue
    if (labels.has(text)) return true
  }
  return false
}

const POST_LINK_SELECTOR =
  'a[action-type="feed_list_item_date"], .WB_from a[href*="/detail/"], .WB_from a[href*="/status/"], a[href*="/detail/"]'

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (text.length === 0) return false
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase()
    if (needle.length > 0 && text.includes(needle)) return true
  }
  return false
}

function matchesUser(author: string, users: string[]): boolean {
  if (!author) return false
  const name = author.toLowerCase()
  return users.some((user) => {
    const needle = user.trim().toLowerCase()
    return needle.length > 0 && name === needle
  })
}
