/**
 * The timeline, drawn by us.
 *
 * Data comes from `feed.ts` (weibo's own JSON endpoints, through the MAIN-world
 * bridge); markup comes from here. Nothing in this file queries the page's DOM
 * or reuses its class names, which is what makes the result look like one
 * product instead of a skin: spacing, type and colour are all Mist tokens.
 */

import { render } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

import { Icon } from '../shared/icons'
import { formatCount } from '../shared/utils'
import { loadFeed, loadLongText, setLike, statusUrl, type FeedSource, type Post } from './feed'
import { createStore, runtime, toast, ui, useStore, type EnhancerApi, type ReaderPost, type View } from './state'
import { useSettings } from './use-settings'

/* ------------------------------------------------------------------ store */

interface FeedState {
  items: Post[]
  cursor: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  exhausted: boolean
  focus: string | null
  source: FeedSource
}

const feed = createStore<FeedState>({
  items: [],
  cursor: null,
  status: 'idle',
  exhausted: false,
  focus: null,
  source: 'following',
})

let inflight = false

function strip(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function dedupe(items: Post[]): Post[] {
  const seen = new Set<string>()
  const out: Post[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function matchesView(post: Post, view: View): boolean {
  switch (view) {
    case 'text':
      return post.images.length > 0 || !post.video
    case 'long':
      return post.isLong || strip(post.html).length > 240
    case 'video':
      return Boolean(post.video)
    default:
      return true
  }
}

function sync(): void {
  const state = feed.get()
  const view = ui.get().view
  const visible = state.items.filter((post) => matchesView(post, view))
  ui.set({
    stats: {
      total: state.items.length,
      visible: visible.length,
      filtered: state.items.length - visible.length,
      duplicates: 0,
    },
  })
}

export async function loadMore(): Promise<void> {
  const state = feed.get()
  if (inflight || state.exhausted) return
  inflight = true
  if (state.items.length === 0) feed.set({ status: 'loading' })
  let page: Awaited<ReturnType<typeof loadFeed>> | null = null
  try {
    page = await loadFeed(state.source, state.cursor)
  } catch {
    page = null
  }
  inflight = false

  if (!page || page.items.length === 0) {
    feed.set((prev) =>
      prev.items.length > 0 ? { exhausted: true, status: 'ready' } : { status: 'error' },
    )
    sync()
    return
  }

  feed.set((prev) => ({
    items: dedupe([...prev.items, ...(page?.items ?? [])]),
    cursor: page?.cursor ?? null,
    status: 'ready',
    exhausted: page?.cursor === null,
  }))
  sync()
}

export function reloadFeed(source?: FeedSource): void {
  feed.set((prev) => ({
    items: [],
    cursor: null,
    status: 'loading',
    exhausted: false,
    focus: null,
    source: source ?? prev.source,
  }))
  inflight = false
  sync()
  void loadMore()
}

/* --------------------------------------------------------------- actions */

async function toggleLike(post: Post): Promise<void> {
  const next = !post.liked
  feed.set((prev) => ({
    items: prev.items.map((item) =>
      item.id === post.id
        ? { ...item, liked: next, stats: { ...item.stats, likes: Math.max(0, item.stats.likes + (next ? 1 : -1)) } }
        : item,
    ),
  }))
  const ok = await setLike(post.id, next)
  if (!ok) {
    feed.set((prev) => ({
      items: prev.items.map((item) =>
        item.id === post.id
          ? { ...item, liked: !next, stats: { ...item.stats, likes: Math.max(0, item.stats.likes + (next ? -1 : 1)) } }
          : item,
      ),
    }))
    toast('点赞没有生效，可能登录已过期')
  }
}

async function expandLong(post: Post): Promise<void> {
  const html = await loadLongText(post.mblogId)
  if (!html) {
    toast('长文读取失败')
    return
  }
  feed.set((prev) => ({
    items: prev.items.map((item) => (item.id === post.id ? { ...item, html, isLong: false } : item)),
  }))
}

function openPost(post: Post): void {
  window.open(statusUrl(post), '_blank', 'noopener,noreferrer')
}

/* ------------------------------------------------------------------ view */

function Timeline(): preact.JSX.Element {
  const state = useStore(feed)
  const shell = useStore(ui)
  const settings = useSettings()
  const sentinel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (state.status === 'idle') void loadMore()
  }, [state.status])

  useEffect(() => {
    sync()
  }, [shell.view])

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [state.status, state.exhausted])

  const visible = state.items.filter((post) => matchesView(post, shell.view))

  return (
    <div class="mf-list">
      {state.status === 'loading' && state.items.length === 0 ? <Skeletons /> : null}

      {state.status === 'error' ? (
        <div class="mf-empty">
          <div class="mf-empty-title">没读到时间线</div>
          <div>可能未登录，或者微博的接口换了。</div>
          <button type="button" class="mf-retry" onClick={() => reloadFeed()}>
            重新读取
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && visible.length === 0 ? (
        <div class="mf-empty">
          <div class="mf-empty-title">这一栏是空的</div>
          <div>{shell.view === 'video' ? '当前加载的微博里没有视频。' : '换个视图看看，或者继续往下滚。'}</div>
        </div>
      ) : null}

      {visible.map((post) => (
        <PostCard key={post.id} post={post} focused={state.focus === post.id} settings={settings} />
      ))}

      {state.status === 'ready' && state.exhausted && visible.length > 0 ? (
        <div class="mf-end">到底了 · 再往下就是刷新的事情了</div>
      ) : null}

      <div ref={sentinel} class="mf-sentinel" aria-hidden="true" />
    </div>
  )
}

function Skeletons(): preact.JSX.Element {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div class="mf-skeleton" key={index}>
          <div class="mf-bone" data-round="true" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div class="mf-bone" data-line="true" style={{ width: '38%' }} />
            <div class="mf-bone" data-line="true" style={{ width: '100%' }} />
            <div class="mf-bone" data-line="true" style={{ width: '86%' }} />
            <div class="mf-bone" data-line="true" style={{ width: '62%' }} />
          </div>
        </div>
      ))}
    </>
  )
}

interface CardProps {
  post: Post
  focused: boolean
  settings: ReturnType<typeof useSettings>
}

function PostCard({ post, focused, settings }: CardProps): preact.JSX.Element {
  const setFocus = (): void => {
    feed.set({ focus: post.id })
  }

  return (
    <article
      class="mf-card"
      data-focus={focused ? 'true' : 'false'}
      data-post={post.id}
      tabIndex={-1}
      onClick={setFocus}
    >
      <div class="mf-face">
        {post.author.avatar ? (
          <img class="mf-avatar" src={post.author.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />
        ) : (
          <div class="mf-avatar" data-empty="true">
            {post.author.name.slice(0, 1)}
          </div>
        )}
      </div>

      <div class="mf-main">
        <div class="mf-head">
          <a
            class="mf-name"
            href={`https://weibo.com/u/${post.author.name}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {post.author.name}
          </a>
          {post.author.verified ? (
            <span class="mf-badge" title="认证用户" aria-label="认证用户">
              ✓
            </span>
          ) : null}
          <span class="mf-meta">
            <span>{post.timeLabel}</span>
            {post.source ? <span>{post.source}</span> : null}
            {post.region ? <span>{post.region}</span> : null}
          </span>
        </div>

        {post.title ? <div class="mf-title">{post.title}</div> : null}

        <div class="mf-text" dangerouslySetInnerHTML={{ __html: post.html }} />

        {post.isLong ? (
          <button
            type="button"
            class="mf-expand"
            onClick={(event) => {
              event.stopPropagation()
              void expandLong(post)
            }}
          >
            展开全文
          </button>
        ) : null}

        {post.video ? (
          <div class="mf-video" data-poster={post.video.poster ? 'true' : 'false'}>
            <video
              src={post.video.src}
              poster={post.video.poster}
              controls
              preload="none"
              playsinline
              autoplay={settings.autoplay}
            />
          </div>
        ) : null}

        {post.images.length > 0 ? (
          <div class="mf-media" data-count={Math.min(post.images.length, 9)}>
            {post.images.slice(0, 9).map((image) => (
              <a
                class="mf-photo"
                key={image.large}
                href={image.large}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <img src={image.src} alt="" loading="lazy" referrerpolicy="no-referrer" />
              </a>
            ))}
          </div>
        ) : null}

        {post.retweeted ? <Quote post={post.retweeted} /> : null}

        <div class="mf-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" class="mf-action" data-kind="repost" onClick={() => openPost(post)}>
            <Icon name="repeat" size={16} />
            {post.stats.reposts > 0 ? formatCount(post.stats.reposts) : '转发'}
          </button>
          <button type="button" class="mf-action" data-kind="comment" onClick={() => openPost(post)}>
            <Icon name="message" size={16} />
            {post.stats.comments > 0 ? formatCount(post.stats.comments) : '评论'}
          </button>
          <button
            type="button"
            class="mf-action"
            data-kind="like"
            aria-pressed={post.liked ? 'true' : 'false'}
            onClick={() => void toggleLike(post)}
          >
            <Icon name="heart" size={16} />
            {post.stats.likes > 0 ? formatCount(post.stats.likes) : '赞'}
          </button>
          <button type="button" class="mf-action" data-kind="open" onClick={() => openPost(post)}>
            <Icon name="external" size={16} />
          </button>
        </div>
      </div>
    </article>
  )
}

function Quote({ post }: { post: Post }): preact.JSX.Element {
  return (
    <div class="mf-quote">
      <div class="mf-head">
        <a
          class="mf-name"
          href={`https://weibo.com/u/${post.author.name}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {post.author.name}
        </a>
        <span class="mf-meta">
          <span>{post.timeLabel}</span>
        </span>
      </div>
      <div class="mf-text" dangerouslySetInnerHTML={{ __html: post.html }} />
      {post.images.length > 0 ? (
        <div class="mf-media" data-count={Math.min(post.images.length, 9)}>
          {post.images.slice(0, 9).map((image) => (
            <a
              class="mf-photo"
              key={image.large}
              href={image.large}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              <img src={image.src} alt="" loading="lazy" referrerpolicy="no-referrer" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------- api */

function focusedPost(): Post | null {
  const state = feed.get()
  return state.items.find((post) => post.id === state.focus) ?? null
}

/** What the shell's keyboard shortcuts and command palette talk to. */
export function createFeedApi(): EnhancerApi {
  return {
    setView: () => {
      sync()
    },
    readerFromFocus: (): ReaderPost | null => {
      const post = focusedPost()
      if (!post) return null
      return {
        name: post.author.name,
        text: strip(post.html),
        meta: [post.timeLabel, post.source, post.region].filter(Boolean).join(' · '),
        url: statusUrl(post),
      }
    },
    focusRelative: (delta: number) => {
      const state = feed.get()
      const visible = state.items.filter((post) => matchesView(post, ui.get().view))
      if (visible.length === 0) return
      const index = visible.findIndex((post) => post.id === state.focus)
      const next = index < 0 ? (delta > 0 ? 0 : visible.length - 1) : index + delta
      const clamped = Math.max(0, Math.min(visible.length - 1, next))
      const target = visible[clamped]
      if (!target) return
      feed.set({ focus: target.id })
      document
        .querySelector(`.mf-card[data-post="${CSS.escape(target.id)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    clearFocus: () => feed.set({ focus: null }),
    openFocused: (): boolean => {
      const post = focusedPost()
      if (!post) return false
      openPost(post)
      return true
    },
    saveFocused: (): boolean => {
      const post = focusedPost()
      if (!post) return false
      void navigator.clipboard?.writeText(statusUrl(post)).then(
        () => toast('链接已复制'),
        () => toast('复制失败'),
      )
      return true
    },
    compose: (): boolean => {
      ui.set({ composer: true })
      return true
    },
    rescan: () => reloadFeed(),
  }
}

/* ----------------------------------------------------------------- mount */

let root: HTMLElement | null = null

export function mountFeed(container: HTMLElement): void {
  root = container
  feed.set({ items: [], cursor: null, status: 'idle', exhausted: false, focus: null })
  render(<Timeline />, container)
  void loadMore()
}

export function unmountFeed(): void {
  if (!root) return
  render(null, root)
  root.innerHTML = ''
  root = null
  feed.set({ items: [], cursor: null, status: 'idle', exhausted: false, focus: null })
}

export { feed as feedStore, runtime }
