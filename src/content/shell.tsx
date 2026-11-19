import { useEffect, useState } from 'preact/hooks'
import { Icon, MistMark, type IconName } from '../shared/icons'
import { formatCount, modKey, rafThrottle } from '../shared/utils'
import { ask, type RawHot, type RawProfile } from './bridge'
import { closePalette, openPalette, openSheet, runtime, toast, ui, useStore, type View } from './state'
import { Palette } from './palette'
import { Sheet } from './sheet'
import { useSettings } from './use-settings'
import { SAMPLE_ACCOUNT, SAMPLE_HOT } from './sample'
import { publish } from './feed'
import { reloadFeed } from './timeline'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'text', label: '图文' },
  { id: 'long', label: '长文' },
  { id: 'video', label: '视频' },
]

interface NavItem {
  id: string
  label: string
  icon: IconName
  href: string
  match?: string
}

const NAV: NavItem[] = [
  { id: 'home', label: '首页', icon: 'home', href: 'https://weibo.com/', match: '/' },
  { id: 'explore', label: '探索', icon: 'compass', href: 'https://weibo.com/explore', match: '/explore' },
  { id: 'notify', label: '通知', icon: 'bell', href: 'https://weibo.com/at/weibo', match: '/at/' },
  { id: 'chat', label: '消息', icon: 'mail', href: 'https://weibo.com/chat', match: '/chat' },
  { id: 'saved', label: '收藏', icon: 'bookmark', href: 'https://weibo.com/mygroups', match: '/mygroups' },
  { id: 'me', label: '我', icon: 'user', href: 'https://weibo.com/u/', match: '/u/' },
]

function navigate(href: string): void {
  if (runtime.host === 'demo') {
    toast('演示模式：这里不跳转', 'info')
    return
  }
  window.location.assign(href)
}

export function Shell() {
  const shell = useStore(ui)
  const settings = useSettings()

  // Progress bar + floating return button, driven by one rAF-throttled read.
  useEffect(() => {
    const update = rafThrottle(() => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      const scrolled = window.scrollY > 420
      if (Math.abs(progress - ui.get().progress) > 0.002 || scrolled !== ui.get().scrolled) {
        ui.set({ progress, scrolled })
      }
    })
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (ui.get().hotState !== 'idle') return
    void loadHot()
    void loadAccount()
  }, [])

  useEffect(() => {
    runtime.api?.setView(shell.view)
  }, [shell.view])

  const selectView = (view: View): void => {
    ui.set({ view })
    runtime.api?.setView(view)
  }

  return (
    <div class="m-root" data-mist-shell="true">
      <aside class="m-rail" data-collapsed={settings.railCollapsed}>
        <div class="m-rail-inner">
          <button
            type="button"
            class="m-logo"
            aria-label="打开命令面板"
            onClick={() => openPalette()}
          >
            <span class="m-logo-mark">
              <MistMark size={22} />
            </span>
            <span>
              <span class="m-logo-word" style={{ display: 'block' }}>
                Mist
              </span>
              <span class="m-logo-sub">雾微博</span>
            </span>
          </button>

          <nav class="m-nav" aria-label="主导航">
            {NAV.map((item) => (
              <button
                type="button"
                key={item.id}
                class="m-nav-item"
                aria-current={isCurrent(item) ? 'page' : undefined}
                onClick={() => navigate(navHref(item))}
              >
                <span class="m-nav-icon">
                  <Icon name={item.icon} size={23} strokeWidth={1.55} />
                </span>
                <span class="m-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div class="m-rail-spacer" />

          <button
            type="button"
            class="m-compose"
            onClick={() => {
              if (runtime.api?.compose()) return
              toast('在首页顶部可以发布微博', 'compose')
            }}
          >
            <Icon name="compose" size={18} />
            <span class="m-compose-label">写微博</span>
          </button>

          <button
            type="button"
            class="m-account"
            onClick={() => openSheet('about')}
            aria-label="Mist 账户与设置"
          >
            {shell.account?.avatar ? (
              <img class="m-avatar m-avatar--sm" src={shell.account.avatar} alt="" data-size="sm" />
            ) : (
              <span class="m-avatar m-avatar-fallback" data-size="sm">
                {(shell.account?.name ?? '微').slice(0, 1)}
              </span>
            )}
            <span class="m-account-copy">
              <span class="m-account-name">{shell.account?.name ?? '未识别账号'}</span>
              <span class="m-account-handle">{shell.account?.handle ?? 'weibo.com'}</span>
            </span>
          </button>
        </div>
      </aside>

      <div class="m-column" data-aside={settings.aside}>
        <header class="m-feed-head">
          <div class="m-tabs" role="tablist" aria-label="信息流视图">
            {VIEWS.map((view) => (
              <button
                type="button"
                key={view.id}
                class="m-tab"
                role="tab"
                aria-selected={shell.view === view.id}
                onClick={() => selectView(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div class="m-head-actions">
            <button
              type="button"
              class="m-icon-btn"
              aria-label="搜索"
              title={`搜索（${modKey()}K）`}
              onClick={() => openPalette()}
            >
              <Icon name="search" size={18} />
            </button>
            <button
              type="button"
              class="m-icon-btn"
              aria-label="内容过滤"
              aria-pressed={settings.filters.enabled}
              onClick={() => openSheet('filters')}
            >
              <Icon name="filter" size={18} />
            </button>
            <button
              type="button"
              class="m-icon-btn"
              aria-label="专注模式"
              aria-pressed={settings.focusMode}
              onClick={() => openSheet('reading')}
            >
              <Icon name="eye" size={18} />
            </button>
            <button
              type="button"
              class="m-icon-btn"
              aria-label="设置"
              onClick={() => openSheet('appearance')}
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </header>

        {settings.aside ? <Aside /> : null}
      </div>

      {settings.progressBar ? (
        <div
          class="m-reading-progress"
          style={{ transform: `scaleX(${shell.progress})`, opacity: shell.progress > 0.01 ? 1 : 0 }}
        />
      ) : null}

      {shell.scrolled ? (
        <button
          type="button"
          class="m-top-btn"
          aria-label="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <Icon name="arrow-up" size={17} />
        </button>
      ) : null}

      <Toasts />
      {shell.reader ? <Reader /> : null}
      {shell.palette ? <Palette /> : null}
      {shell.sheet ? <Sheet /> : null}
      {shell.composer ? <Composer /> : null}
    </div>
  )
}

function isCurrent(item: NavItem): boolean {
  if (runtime.host === 'demo') return item.id === 'home'
  const path = window.location.pathname
  if (item.id === 'home') return path === '/' || path === ''
  return item.match ? path.startsWith(item.match) : false
}

function navHref(item: NavItem): string {
  return item.id === 'me' && runtime.host === 'demo' ? 'https://weibo.com/' : item.href
}

function Aside() {
  const shell = useStore(ui)
  const settings = useSettings()
  const stats = shell.stats

  return (
    <aside class="m-aside" aria-label="辅助栏">
      <button type="button" class="m-search" onClick={() => openPalette()} aria-label="搜索微博或命令">
        <Icon name="search" size={16} />
        <span style={{ flex: 1, textAlign: 'start' }}>搜索微博或命令</span>
        <span class="m-kbd">{modKey()}K</span>
      </button>

      <section class="m-panel">
        <div class="m-panel-head">
          <span class="m-panel-title">热搜</span>
          <span class="m-panel-meta">
            {shell.hotState === 'ready' ? `${shell.hot.length} 条` : ''}
            <a
              class="m-panel-link"
              href="https://s.weibo.com/top/summary"
              onClick={(event) => {
                event.preventDefault()
                navigate('https://s.weibo.com/top/summary')
              }}
            >
              全部
            </a>
          </span>
        </div>
        {shell.hotState === 'loading' ? <div class="m-panel-meta">正在读取…</div> : null}
        {shell.hotState === 'failed' ? (
          <button type="button" class="m-btn" data-variant="ghost" onClick={() => void loadHot()}>
            读取失败，重试
          </button>
        ) : null}
        <ol class="m-hot">
          {shell.hot.map((item) => (
            <li key={`${item.rank}-${item.title}`}>
              <a
                class="m-hot-item"
                href={item.url}
                data-top={item.rank <= 3}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(item.url)
                }}
              >
                <span class="m-hot-rank">{item.rank}</span>
                <span class="m-hot-body">
                  <span class="m-hot-title">{item.title}</span>
                  <span class="m-hot-meta">
                    {item.tag ? <span class="m-hot-heat">{item.tag}</span> : null}
                    {item.heat ? <span class="m-hot-heat">{item.heat}</span> : null}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section class="m-panel">
        <div class="m-panel-head">
          <span class="m-panel-title">信息流</span>
          <span class="m-panel-meta m-numeric">
            {stats.visible}/{stats.total}
          </span>
        </div>
        <div class="m-suggest">
          <span class="m-suggest-copy">
            <span class="m-suggest-name">已过滤</span>
            <span class="m-suggest-handle">推广、推荐与关键词命中</span>
          </span>
          <span class="m-numeric" style={{ color: 'var(--mist-text-secondary)' }}>
            {stats.filtered}
          </span>
        </div>
        <div class="m-suggest">
          <span class="m-suggest-copy">
            <span class="m-suggest-name">重复卡片</span>
            <span class="m-suggest-handle">同一条被多次推荐</span>
          </span>
          <span class="m-numeric" style={{ color: 'var(--mist-text-secondary)' }}>
            {stats.duplicates}
          </span>
        </div>
        <div class="m-suggest">
          <span class="m-suggest-copy">
            <span class="m-suggest-name">内容过滤</span>
            <span class="m-suggest-handle">
              {settings.filters.enabled ? `${settings.filters.kinds.length} 类 · ${settings.filters.keywords.length} 词` : '已暂停'}
            </span>
          </span>
          <button type="button" class="m-btn" data-variant="ghost" onClick={() => openSheet('filters')}>
            设置
          </button>
        </div>
      </section>

      <section class="m-panel">
        <div class="m-panel-head">
          <span class="m-panel-title">快捷</span>
          <button type="button" class="m-panel-link" onClick={() => openSheet('keys')}>
            全部
          </button>
        </div>
        {[
          ['命令面板', [modKey(), 'K']],
          ['下一条 / 上一条', ['J', 'K']],
          ['阅读模式', ['↵']],
        ].map(([label, keys]) => (
          <div class="m-suggest" key={String(label)}>
            <span class="m-suggest-copy">
              <span class="m-suggest-name">{label as string}</span>
            </span>
            <span class="m-shortcut-keys">
              {(keys as string[]).map((key) => (
                <span class="m-kbd" key={key}>
                  {key}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>
    </aside>
  )
}

function Toasts() {
  const shell = useStore(ui)
  return (
    <div class="m-toasts" role="status" aria-live="polite">
      {shell.toasts.map((item) => (
        <div class="m-toast" key={item.id}>
          <span class="m-toast-dot" />
          {item.icon ? <Icon name={item.icon} size={15} /> : null}
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Writing a post. In data mode the native composer is gone (we hid the page),
 * so publish goes straight to `/ajax/statuses/update` — the same call the site
 * makes, from the same session.
 */
function Composer() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const close = (): void => ui.set({ composer: false })

  const submit = async (): Promise<void> => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const ok = await publish(body)
    setBusy(false)
    if (!ok) {
      toast('发布没有成功，可能登录已过期')
      return
    }
    ui.set({ composer: false })
    toast('已发布', 'check')
    reloadFeed()
  }

  return (
    <>
      <div class="m-dim" onMouseDown={close} />
      <div class="m-composer" role="dialog" aria-modal="true" aria-label="写微博">
        <div class="m-composer-head">
          <span class="m-composer-title">写微博</span>
          <span style={{ flex: 1 }} />
          <button type="button" class="m-icon-btn" aria-label="关闭" onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <textarea
          class="m-composer-input"
          placeholder="有什么新鲜事想分享给大家？"
          value={text}
          maxLength={2000}
          rows={7}
          autofocus
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit()
          }}
        />
        <div class="m-composer-foot">
          <span class="m-composer-count">{text.length} / 2000</span>
          <button
            type="button"
            class="m-btn"
            data-variant="tinted"
            disabled={!text.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? '发布中…' : '发送'}
          </button>
        </div>
      </div>
    </>
  )
}

function Reader() {
  const shell = useStore(ui)
  const post = shell.reader
  if (!post) return null
  const close = (): void => ui.set({ reader: null })
  return (
    <>
      <div class="m-dim" onMouseDown={close} />
      <div class="m-reader" role="dialog" aria-modal="true" aria-label="阅读模式">
        <div class="m-reader-head">
          <Icon name="type" size={16} />
          <span class="m-reader-title">{post.name}</span>
          <span style={{ flex: 1 }} />
          {post.url ? (
            <a class="m-icon-btn" href={post.url} target="_blank" rel="noreferrer" aria-label="在原页面打开">
              <Icon name="external" size={17} />
            </a>
          ) : null}
          <button type="button" class="m-icon-btn" aria-label="关闭阅读模式" onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div class="m-reader-body">
          <div class="m-card" data-flat="true">
            <div class="m-card-main">
              <div class="m-card-head">
                <span class="m-card-name">{post.name}</span>
                {post.meta ? (
                  <>
                    <span class="m-card-dot" />
                    <span class="m-card-meta">{post.meta}</span>
                  </>
                ) : null}
              </div>
              <div class="m-reader-text">{post.text}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

async function loadHot(): Promise<void> {
  if (ui.get().hotState === 'loading') return
  if (runtime.host === 'demo') {
    ui.set({ hot: SAMPLE_HOT, hotState: 'ready' })
    return
  }
  ui.set({ hotState: 'loading' })
  const raw = await ask<{ realtime?: RawHot[] } | RawHot[]>('hot')
  const list = Array.isArray(raw) ? raw : (raw?.realtime ?? [])
  if (!list.length) {
    ui.set({ hotState: 'failed' })
    return
  }
  const hot = list.slice(0, 10).map((item, index) => ({
    rank: index + 1,
    title: item.word ?? item.note ?? '—',
    heat: typeof item.num === 'number' ? formatCount(item.num) : undefined,
    tag: item.label_name && ['热', '新', '沸', '爆', '荐'].includes(item.label_name) ? item.label_name : undefined,
    url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word ?? item.note ?? '')}`,
  }))
  ui.set({ hot, hotState: 'ready' })
}

async function loadAccount(): Promise<void> {
  if (runtime.host === 'demo') {
    ui.set({ account: SAMPLE_ACCOUNT })
    return
  }
  const raw = await ask<{ user?: RawProfile } | RawProfile>('profile')
  if (!raw) return
  const user = 'user' in raw && raw.user ? raw.user : (raw as RawProfile)
  if (!user.screen_name) return
  ui.set({
    account: {
      name: user.screen_name,
      handle: user.idstr ? `uid ${user.idstr}` : 'weibo.com',
      avatar: user.avatar_large ?? '',
    },
  })
}
