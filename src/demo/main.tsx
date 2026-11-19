/**
 * Design prototype.
 *
 * The demo renders the *same* Shell component and the *same* weibo.css skin
 * against a hand-built feed that mimics weibo.com's markup. That is the whole
 * point: what you see here is what the extension does to the real page, with
 * no network, no account and no DOM guessing.
 */
import { render } from 'preact'
import { Shell } from '../content/shell'
import { runtime, ui, type SheetSection } from '../content/state'
import { DEFAULT_SETTINGS, applySettings } from '../shared/settings'

interface Post {
  name: string
  handle: string
  time: string
  text: string
  kind: 'text' | 'image' | 'video' | 'long'
  badge?: string
  media?: string[]
  quote?: { name: string; text: string }
  comments?: string
  reposts?: string
  likes?: string
  ad?: boolean
  suggested?: boolean
}

const AVATARS = ['%23d8e2ec', '%23e8d9cf', '%23d5e3d8', '%23e3dcec', '%23ece0d5', '%23d9e6ea']

function avatar(index: number, glyph: string): string {
  const fill = AVATARS[index % AVATARS.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="${fill}"/><text x="48" y="62" font-family="system-ui,-apple-system" font-size="40" fill="%23343b45" text-anchor="middle">${glyph}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${svg}`
}

const PHOTOS: Array<[string, string]> = [
  ['%23cdd9e6', '%23e7eef5'],
  ['%23e6d8cd', '%23f5ece4'],
  ['%23d3e2d8', '%23eef6f1'],
  ['%23dcd7ea', '%23f0edf7'],
]

function photo(index: number): string {
  const [from, to] = PHOTOS[index % PHOTOS.length] as [string, string]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="420" fill="url(%23g)"/>` +
    `<circle cx="520" cy="90" r="54" fill="%23ffffff" opacity="0.35"/>` +
    `<path d="M0 340 L200 220 L360 320 L520 240 L640 330 L640 420 L0 420 Z" fill="%23ffffff" opacity="0.28"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${svg}`
}

const POSTS: Post[] = [
  {
    name: '海边的量子力学',
    handle: 'quantum_seaside',
    time: '3 分钟前',
    kind: 'long',
    text: '把这一周读的东西拢一拢：信息过载从来不是「信息太多」，而是「筛子太粗」。做产品的人总想再加一个功能，做阅读的人总想再多刷一条，其实真正稀缺的是主动决定不要什么的能力。\n\n所以我给自己定了一条：每天只看三次首页，每次十五分钟，剩下的时间留给长文和书。三天之后，焦虑感明显下降，倒不是世界安静了，而是我终于不再假装自己能跟上所有事。',
    comments: '42',
    reposts: '18',
    likes: '316',
  },
  {
    name: '雾港咖啡',
    handle: 'foggy_harbor',
    time: '12 分钟前',
    kind: 'image',
    badge: '热门',
    text: '今天的浅烘有点意思，柑橘的酸在第三口之后才出来。窗外在下雨，店里放着 Bill Evans，一切都刚刚好。',
    media: [photo(0), photo(1)],
    comments: '8',
    reposts: '3',
    likes: '96',
  },
  {
    name: '微博广告',
    handle: 'ad_slot',
    time: '推广',
    kind: 'image',
    ad: true,
    text: '限时福利｜点击领取你的专属旅行基金，最高 800 元，先到先得。',
    media: [photo(2)],
  },
  {
    name: '林间笔记',
    handle: 'forest_notes',
    time: '28 分钟前',
    kind: 'video',
    text: '把手机架在树上拍了四十分钟，剪出十七秒。风吹过杉树的声音，比任何白噪音 App 都好用。',
    media: [photo(3)],
    comments: '51',
    reposts: '120',
    likes: '802',
  },
  {
    name: '夜航西飞',
    handle: 'night_flight',
    time: '1 小时前',
    kind: 'text',
    quote: {
      name: '旧书摊的猫',
      text: '「一个人只有远离人群，才能真正理解人群。」——忘了在哪本书里读到的，但每次挤地铁都会想起来。',
    },
    text: '这段话我抄在笔记本第一页，已经七年了。',
    comments: '6',
    reposts: '2',
    likes: '44',
  },
  {
    name: '你可能感兴趣',
    handle: 'recommend',
    time: '推荐',
    kind: 'text',
    suggested: true,
    text: '根据你的兴趣推荐：三个让你效率翻倍的笔记方法，第 2 个我用了五年。',
  },
  {
    name: '山与海之间',
    handle: 'between_hills',
    time: '2 小时前',
    kind: 'image',
    text: '徒步第九公里，云突然散开，整片山谷亮了一下。同行的人都在拍照，我站着没动，觉得记住比拍到重要。',
    media: [photo(1), photo(2), photo(0)],
    comments: '23',
    reposts: '9',
    likes: '271',
  },
  {
    name: '排版练习生',
    handle: 'type_study',
    time: '3 小时前',
    kind: 'text',
    text: '一个观察：中文界面里最容易被忽略的是行高。1.5 是安全值，1.65 是舒服值，1.8 只适合长文。把行高从 1.4 调到 1.65，同一段文字的可读性提升比换字体大得多。',
    comments: '37',
    reposts: '64',
    likes: '519',
  },
]

function Card({ post, index }: { post: Post; index: number }) {
  const attributes: Record<string, string> = {
    'data-mist-item': 'true',
    'data-mist-kind': post.kind,
  }
  if (post.ad) attributes['data-mist-ad'] = 'true'
  if (post.suggested) attributes['data-mist-suggested'] = 'true'

  return (
    <article class="card-wrap" {...attributes}>
      <div class="WB_feed_detail">
        <div class="WB_face">
          <img src={avatar(index, post.name.slice(0, 1))} alt="" width="48" height="48" />
        </div>
        <div class="WB_detail">
          <div class="WB_info">
            <a class="WB_name" href="#">
              {post.name}
            </a>
            {post.badge ? <span class="demo-badge">{post.badge}</span> : null}
          </div>
          <div class="WB_from">{post.time}</div>

          {post.text.split('\n\n').map((paragraph) => (
            <div class="WB_text" key={paragraph.slice(0, 12)}>
              {paragraph}
            </div>
          ))}

          {post.media?.length ? (
            <div class="WB_media_wrap">
              <ul class="WB_media_a" data-count={post.media.length}>
                {post.media.map((src, mediaIndex) => (
                  <li key={mediaIndex}>
                    <img src={src} alt="" loading="lazy" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {post.quote ? (
            <div class="WB_feed_expand">
              <div class="WB_info">
                <a class="WB_name" href="#">
                  {post.quote.name}
                </a>
              </div>
              <div class="WB_text">{post.quote.text}</div>
            </div>
          ) : null}

          <div class="WB_feed_handle">
            <ul class="WB_handle">
              <li>
                <a href="#">转发 {post.reposts ?? ''}</a>
              </li>
              <li>
                <a href="#">评论 {post.comments ?? ''}</a>
              </li>
              <li>
                <a href="#">赞 {post.likes ?? ''}</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </article>
  )
}

function Feed() {
  return (
    <div class="demo-stage">
      <div class="demo-feed" id="mist-demo-feed">
        <div class="demo-head">
          <h1>首页</h1>
          <p>这是一份本地原型：同样的组件、同一份皮肤，喂给一份仿真的微博结构。</p>
        </div>
        {POSTS.map((post, index) => (
          <Card key={`${post.handle}-${index}`} post={post} index={index} />
        ))}
        <div class="demo-foot">Mist · 雾微博 · 设计原型</div>
      </div>
    </div>
  )
}

runtime.host = 'demo'
runtime.api = null

/**
 * Screenshot + review hooks. The demo is the only place where "state at load"
 * is a useful URL parameter, and it keeps scripts/screenshots.mjs honest: every
 * marketing still is a real render of the real components.
 */
const params = new URLSearchParams(location.search)
const themeParam = params.get('theme')
const tintParam = params.get('tint')
const viewParam = params.get('view')
const sheetParam = params.get('sheet')

applySettings({
  ...DEFAULT_SETTINGS,
  theme: themeParam === 'dark' || themeParam === 'light' ? themeParam : DEFAULT_SETTINGS.theme,
  tint: (tintParam as typeof DEFAULT_SETTINGS.tint) ?? DEFAULT_SETTINGS.tint,
  glass: (params.get('glass') as typeof DEFAULT_SETTINGS.glass) ?? DEFAULT_SETTINGS.glass,
  railCollapsed: params.get('rail') === 'collapsed',
  aside: params.get('aside') !== '0',
})
document.documentElement.setAttribute('data-mist-booted', 'true')

const visible = POSTS.filter((post) => !post.ad && !post.suggested).length
ui.set({
  stats: { total: POSTS.length, visible, filtered: POSTS.length - visible, duplicates: 0 },
})

if (params.has('palette')) ui.set({ palette: true, paletteQuery: params.get('q') ?? '' })
if (sheetParam) ui.set({ sheet: true, sheetSection: sheetParam as SheetSection })
if (viewParam) ui.set({ view: viewParam as 'all' | 'text' | 'long' | 'video' })

const app = document.getElementById('app')
const stage = document.getElementById('stage')
if (app) render(<Shell />, app)
if (stage) render(<Feed />, stage)
