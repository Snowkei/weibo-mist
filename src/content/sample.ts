import type { Account, HotItem } from './state'

/** Demo content: the only place Mist ships sample text. */
export const SAMPLE_HOT: HotItem[] = [
  { rank: 1, title: '把微博重画成一张安静的纸', heat: '412万', url: 'https://s.weibo.com/weibo?q=mist', tag: '热' },
  { rank: 2, title: '液态玻璃与 0.5px 发丝线', heat: '287万', url: 'https://s.weibo.com/weibo?q=glass', tag: '新' },
  { rank: 3, title: '为什么信息流需要宽度上限', heat: '193万', url: 'https://s.weibo.com/weibo?q=layout' },
  { rank: 4, title: '命令面板正在吃掉菜单栏', heat: '156万', url: 'https://s.weibo.com/weibo?q=palette', tag: '沸' },
  { rank: 5, title: '苹果式排版里的留白比例', heat: '98万', url: 'https://s.weibo.com/weibo?q=typography' },
  { rank: 6, title: '阅读模式应该藏起什么', heat: '74万', url: 'https://s.weibo.com/weibo?q=reading' },
  { rank: 7, title: '用 OKLCH 做一套设计令牌', heat: '61万', url: 'https://s.weibo.com/weibo?q=oklch' },
  { rank: 8, title: '深色模式不是把颜色反过来', heat: '44万', url: 'https://s.weibo.com/weibo?q=dark' },
  { rank: 9, title: '键盘导航的十个约定', heat: '31万', url: 'https://s.weibo.com/weibo?q=keyboard' },
  { rank: 10, title: '把广告当作排版问题来处理', heat: '22万', url: 'https://s.weibo.com/weibo?q=ads' },
]

export const SAMPLE_ACCOUNT: Account = {
  name: '雾里看花',
  handle: '@mist_demo',
  avatar: '',
}

export interface DemoPost {
  name: string
  handle: string
  time: string
  text: string
  meta?: string
  images?: number
  repost?: { name: string; text: string }
}

export const SAMPLE_POSTS: DemoPost[] = [
  {
    name: 'Mist 设计组',
    handle: '@mist_design',
    time: '12 分钟前',
    text:
      '我们把微博的信息流重新排了一遍：宽度停在 624px，行高 1.6，正文 15px。\n' +
      '不是为了更好看，是为了让眼睛在一屏里少走几步路。',
    images: 2,
  },
  {
    name: '林一',
    handle: '@lin_yi',
    time: '38 分钟前',
    text: '以前刷十分钟就烦，现在能安静看完一整屏。差别只在——没有东西在旁边喊我。',
    meta: '转发 1,204 · 评论 366 · 赞 8,912',
  },
  {
    name: '阿岚',
    handle: '@alan',
    time: '1 小时前',
    text: '长文自动展开这个功能，看起来很小，但它把「再点一下」从阅读里拿掉了。',
    repost: { name: 'Mist 设计组', text: '阅读模式：把当前这条抽成一张纸，衬线、1.72 行高、没有工具栏。' },
  },
  {
    name: '周末放映',
    handle: '@weekend',
    time: '2 小时前',
    text: '这一期的封面用了很轻的灰，印在纸上大概就是这个感觉。',
    images: 3,
  },
]
