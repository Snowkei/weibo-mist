/**
 * The timeline as data.
 *
 * This is the xb idea, taken as far as Mist needs: weibo's own JSON endpoints
 * are the source, our own components are the renderer. Nothing here touches the
 * page's DOM — the native shell is hidden by `stage.ts` and the feed is drawn
 * from these objects, which is why the result looks like one designed product
 * instead of a skin on top of someone else's markup.
 */

import { wbGet, wbPost } from './api'

/* ------------------------------------------------------------------ types */

export interface RawUser {
  id?: number
  idstr?: string
  screen_name?: string
  avatar_large?: string
  profile_image_url?: string
  verified?: boolean
  verified_type?: number
}

interface RawSize {
  url?: string
}

interface RawPicInfo {
  largest?: RawSize
  bmiddle?: RawSize
  thumbnail?: RawSize
}

interface RawMediaInfo {
  stream_url?: string
  stream_url_hd?: string
  mp4_720p_mp4?: string
  format?: string
  duration?: number
}

export interface RawStatus {
  id?: number
  idstr?: string
  mid?: string
  mblogid?: string
  created_at?: string
  text?: string
  text_raw?: string
  isLongText?: boolean
  user?: RawUser
  attitudes_count?: number
  comments_count?: number
  reposts_count?: number
  attitudes_status?: number
  favorited?: boolean
  isAd?: number
  source?: string
  region_name?: string
  title?: { text?: string }
  pic_ids?: string[]
  pic_infos?: Record<string, RawPicInfo>
  page_info?: {
    type?: string
    object_type?: string
    page_pic?: RawSize
    page_url?: string
    media_info?: RawMediaInfo
  }
  retweeted_status?: RawStatus
}

interface TimelinePayload {
  statuses?: RawStatus[]
  max_id?: number | string
  data?:
    | RawStatus[]
    | {
        list?: RawStatus[]
        statuses?: RawStatus[]
        status?: RawStatus[]
        since_id?: number | string
        max_id?: number | string
      }
}

export interface PostImage {
  src: string
  large: string
}

export interface PostVideo {
  src: string
  poster?: string
  duration?: number
}

export interface PostAuthor {
  name: string
  avatar?: string
  verified: boolean
}

export interface Post {
  id: string
  mblogId: string
  author: PostAuthor
  timeLabel: string
  source?: string
  region?: string
  html: string
  title?: string
  images: PostImage[]
  video?: PostVideo
  stats: { likes: number; comments: number; reposts: number }
  liked: boolean
  isLong: boolean
  retweeted?: Post
}

export type FeedSource = 'following' | 'for-you'

export interface FeedPage {
  items: Post[]
  cursor: string | null
}

/* ---------------------------------------------------------------- helpers */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** weibo sends `Thu Nov 14 18:08:17 +0800 2024`; we want `11-14 18:08`. */
export function formatTime(raw: string | undefined, now = Date.now()): string {
  if (!raw) return ''
  const match = raw.match(
    /^[A-Za-z]{3} ([A-Za-z]{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})$/,
  )
  if (!match) return raw
  // Groups: weekday, month, day, hour, minute, second, tz, year.
  const [, monthName, day, hh, mm, , tz, year] = match
  const monthIndex = Math.max(0, MONTHS.indexOf(monthName ?? ''))
  const month = String(monthIndex + 1).padStart(2, '0')
  const offset = tz ?? '+0800'
  const stamp = Date.parse(`${year}-${month}-${day}T${hh}:${mm}:00${offset.slice(0, 3)}:${offset.slice(3)}`)
  if (!Number.isFinite(stamp)) return raw
  const diff = now - stamp
  if (diff >= 0 && diff < 60_000) return '刚刚'
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff >= 0 && diff < 24 * 3_600_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const sameYear = new Date(stamp).getFullYear() === new Date(now).getFullYear()
  return sameYear ? `${month}-${day} ${hh}:${mm}` : `${year}-${month}-${day}`
}

const ALLOWED_TAGS = new Set(['A', 'IMG', 'BR', 'SPAN', 'B', 'STRONG', 'EM', 'I', 'U', 'S', 'DEL', 'SUB', 'SUP'])

/**
 * weibo's text is HTML. We keep only what a feed card can safely show: links,
 * emoji images and line breaks; every other tag is unwrapped to its text.
 */
/** Node (tests) has no DOM; the text is still worth keeping, so degrade. */
function sanitizeWithoutDom(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()
}

export function sanitize(html: string | undefined): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return sanitizeWithoutDom(html)
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return ''

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    const tag = el.tagName
    const inner = Array.from(el.childNodes).map(walk).join('')
    if (!ALLOWED_TAGS.has(tag)) return inner
    if (tag === 'BR') return '<br>'
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? ''
      if (!/^https?:/i.test(src)) return ''
      const alt = escapeText(el.getAttribute('alt') ?? '')
      return `<img class="x-emoji" src="${escapeAttr(src)}" alt="${alt}" loading="lazy">`
    }
    if (tag === 'A') {
      const href = el.getAttribute('href') ?? ''
      const usable = /^https?:/i.test(href) || href.startsWith('/')
      const url = usable ? absoluteUrl(href) : ''
      const text = inner || escapeText(el.textContent ?? '')
      if (!url) return text
      // Topic and mention links keep their text; they are not navigation noise.
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    }
    return inner
  }

  return Array.from(root.childNodes).map(walk).join('').trim()
}

function absoluteUrl(href: string): string {
  if (/^https?:/i.test(href)) return href
  // weibo serves protocol-relative and root-relative links
  return `https://weibo.com${href.startsWith('/') ? '' : '/'}${href}`
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/* --------------------------------------------------------------- adapters */

function pickImage(info: RawPicInfo | undefined): PostImage | null {
  const large = info?.largest?.url ?? info?.bmiddle?.url ?? info?.thumbnail?.url
  if (!large) return null
  const src = info?.bmiddle?.url ?? info?.thumbnail?.url ?? large
  return { src: src.replace(/^http:/, 'https:'), large: large.replace(/^http:/, 'https:') }
}

function collectImages(status: RawStatus): PostImage[] {
  const out: PostImage[] = []
  const infos = status.pic_infos ?? {}
  for (const id of status.pic_ids ?? []) {
    const image = pickImage(infos[id])
    if (image) out.push(image)
  }
  if (out.length === 0) {
    for (const info of Object.values(infos)) {
      const image = pickImage(info)
      if (image) out.push(image)
    }
  }
  return out
}

function collectVideo(status: RawStatus): PostVideo | undefined {
  const info = status.page_info
  if (!info) return undefined
  const isVideo =
    info.object_type === 'video' ||
    info.type === 'Video' ||
    info.type === 'video' ||
    Boolean(info.media_info?.stream_url || info.media_info?.stream_url_hd)
  if (!isVideo) return undefined
  const src = info.media_info?.mp4_720p_mp4 ?? info.media_info?.stream_url_hd ?? info.media_info?.stream_url
  if (!src) return undefined
  return {
    src: src.replace(/^http:/, 'https:'),
    poster: info.page_pic?.url?.replace(/^http:/, 'https:'),
    duration: info.media_info?.duration,
  }
}

export function adaptStatus(status: RawStatus): Post | null {
  const id = String(status.idstr ?? status.id ?? status.mid ?? '')
  if (!id) return null
  const text = status.text_raw && status.text_raw.length > 0 ? status.text_raw : status.text
  const html = sanitize(text)
  const retweeted = status.retweeted_status ? adaptStatus(status.retweeted_status) : null
  return {
    id,
    mblogId: String(status.mblogid ?? status.mid ?? id),
    author: {
      name: status.user?.screen_name ?? '微博用户',
      avatar: (status.user?.avatar_large ?? status.user?.profile_image_url ?? '').replace(/^http:/, 'https:'),
      verified: Boolean(status.user?.verified) || (status.user?.verified_type ?? -1) >= 0,
    },
    timeLabel: formatTime(status.created_at),
    source: status.source?.replace(/<[^>]+>/g, '').trim() || undefined,
    region: status.region_name || undefined,
    html: html || '（无正文）',
    title: status.title?.text?.trim() || undefined,
    images: collectImages(status),
    video: collectVideo(status),
    stats: {
      likes: Number(status.attitudes_count ?? 0),
      comments: Number(status.comments_count ?? 0),
      reposts: Number(status.reposts_count ?? 0),
    },
    liked: Number(status.attitudes_status ?? 0) === 1,
    isLong: Boolean(status.isLongText) && html.replace(/<[^>]+>/g, '').length < 260,
    retweeted: retweeted ?? undefined,
  }
}

function statusesOf(payload: TimelinePayload | null): RawStatus[] {
  if (!payload) return []
  const data = payload.data
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data?.statuses)
        ? data.statuses
        : Array.isArray(data?.status)
          ? data.status
          : Array.isArray(payload.statuses)
            ? payload.statuses
            : []
  return list.filter((item): item is RawStatus => Boolean(item) && typeof item === 'object')
}

function cursorOf(payload: TimelinePayload | null, items: RawStatus[]): string | null {
  if (!payload || items.length === 0) return null
  const data = payload.data
  const raw = payload.max_id ?? (Array.isArray(data) ? undefined : data?.max_id) ?? (Array.isArray(data) ? undefined : data?.since_id)
  if (raw === undefined || raw === null || String(raw) === '0') return null
  return String(raw)
}

/* ----------------------------------------------------------------- loaders */

const ENDPOINTS = {
  following: '/ajax/feed/friendstimeline',
  forYou: '/ajax/feed/unreadfriendstimeline',
  longText: '/ajax/statuses/longtext',
  setLike: '/ajax/statuses/setLike',
  cancelLike: '/ajax/statuses/cancelLike',
  update: '/ajax/statuses/update',
  profile: '/ajax/profile/info',
} as const

export async function loadFeed(source: FeedSource, cursor?: string | null): Promise<FeedPage> {
  const paths =
    source === 'following'
      ? [ENDPOINTS.following, ENDPOINTS.forYou]
      : [ENDPOINTS.forYou, ENDPOINTS.following]

  for (const path of paths) {
    const params: Record<string, string | number> =
      path === ENDPOINTS.following
        ? { refresh: 4, count: 20, ...(cursor ? { max_id: cursor } : { since_id: '0' }) }
        : cursor
          ? { max_id: cursor }
          : { since_id: '0' }
    const payload = await wbGet<TimelinePayload>(path, params)
    const raw = statusesOf(payload).filter((status) => Number(status.isAd ?? 0) !== 1)
    if (raw.length === 0) continue
    const items = raw.map(adaptStatus).filter((post): post is Post => post !== null)
    if (items.length === 0) continue
    return { items, cursor: cursorOf(payload, raw) }
  }
  return { items: [], cursor: null }
}

/** Long posts arrive truncated; one more call fills them in. */
export async function loadLongText(mblogId: string): Promise<string | null> {
  const payload = await wbGet<{ data?: { longTextContent?: string; longTextContent_raw?: string } }>(
    ENDPOINTS.longText,
    { id: mblogId },
  )
  const data = payload?.data
  const text = data?.longTextContent_raw ?? data?.longTextContent
  return text ? sanitize(text) : null
}

export async function setLike(id: string, liked: boolean): Promise<boolean> {
  const payload = await wbPost<{ ok?: number }>(liked ? ENDPOINTS.setLike : ENDPOINTS.cancelLike, { id })
  return Number(payload?.ok ?? 0) === 1
}

export async function publish(text: string): Promise<boolean> {
  const payload = await wbPost<{ ok?: number }>(ENDPOINTS.update, {
    content: text,
    visible: '0',
    share_id: '',
    vote: '',
    media: '',
    fp: '',
  })
  return Number(payload?.ok ?? 0) === 1
}

export interface Account {
  name: string
  handle: string
  avatar?: string
}

export async function loadAccount(): Promise<Account | null> {
  const payload = await wbGet<{ data?: { user?: RawUser } }>(ENDPOINTS.profile)
  const user = payload?.data?.user
  if (!user?.screen_name) return null
  return {
    name: user.screen_name,
    handle: user.screen_name,
    avatar: (user.avatar_large ?? user.profile_image_url ?? '').replace(/^http:/, 'https:'),
  }
}

export function statusUrl(post: Post): string {
  return `https://weibo.com/${post.mblogId}`
}
