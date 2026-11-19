import type { IconName } from '../shared/icons'
import type { Glass, Settings, ThemeMode, Tint } from '../shared/settings'
import { saveSettings, resetSettings, toggle } from '../shared/store'
import { modKey } from '../shared/utils'
import { openPalette, openSheet, runtime, toast, ui, type SheetSection } from './state'

export type CommandGroup = '导航' | '阅读' | '外观' | '过滤' | '系统'

export interface Command {
  id: string
  title: string
  hint?: string
  group: CommandGroup
  icon: IconName
  keys?: string[]
  run: () => void
}

const go = (url: string): void => {
  window.location.assign(url)
}

const themes: Array<{ value: ThemeMode; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const glasses: Glass[] = ['off', 'soft', 'strong']
const tints: Tint[] = ['mist', 'graphite', 'sand', 'salt', 'dusk']

const nextTheme = (current: ThemeMode): ThemeMode => {
  const i = themes.findIndex((t) => t.value === current)
  return themes[(i + 1) % themes.length]?.value ?? 'auto'
}

const tintLabels: Record<Tint, string> = {
  mist: '雾',
  graphite: '石墨',
  sand: '沙',
  salt: '盐',
  dusk: '暮',
}

const clampScale = (n: number): number => Math.min(1.3, Math.max(0.85, Math.round(n * 100) / 100))

const setSection = (section: SheetSection): (() => void) => () => openSheet(section)

export function buildCommands(settings: Settings): Command[] {
  const mod = modKey()
  const themeLabel = themes.find((t) => t.value === settings.theme)?.label ?? '跟随系统'

  const commands: Command[] = [
    {
      id: 'nav.top',
      title: '回到顶部',
      group: '导航',
      icon: 'arrow-up',
      run: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
      id: 'nav.home',
      title: '首页',
      hint: 'weibo.com',
      group: '导航',
      icon: 'home',
      run: () => go('https://weibo.com/'),
    },
    {
      id: 'nav.explore',
      title: '探索',
      group: '导航',
      icon: 'compass',
      run: () => go('https://weibo.com/explore'),
    },
    {
      id: 'nav.hot',
      title: '热搜榜',
      group: '导航',
      icon: 'sparkles',
      run: () => go('https://s.weibo.com/top/summary'),
    },
    {
      id: 'nav.messages',
      title: '消息',
      group: '导航',
      icon: 'message',
      run: () => go('https://weibo.com/chat'),
    },
    {
      id: 'nav.saved',
      title: '我的收藏',
      group: '导航',
      icon: 'bookmark',
      run: () => go('https://weibo.com/mygroups?gid=3400508910060850'),
    },
    {
      id: 'nav.reload',
      title: '刷新信息流',
      group: '导航',
      icon: 'repeat',
      keys: ['R'],
      run: () => window.location.reload(),
    },
    {
      id: 'read.focus',
      title: settings.focusMode ? '关闭专注模式' : '开启专注模式',
      hint: '只把当前卡片留在焦点上',
      group: '阅读',
      icon: 'eye',
      run: () => {
        void toggle('focusMode')
        toast(settings.focusMode ? '专注模式已关闭' : '专注模式已开启', 'eye')
      },
    },
    {
      id: 'read.reader',
      title: '阅读模式',
      hint: '把当前卡片抽成一张纸',
      group: '阅读',
      icon: 'type',
      keys: ['↵'],
      run: () => {
        const post = runtime.api?.readerFromFocus() ?? null
        if (!post) {
          toast('先把鼠标移到一条微博上', 'info')
          return
        }
        ui.set({ reader: post })
      },
    },
    {
      id: 'read.next',
      title: '下一条 / 上一条',
      group: '阅读',
      icon: 'chevron-down',
      keys: ['J', 'K'],
      run: () => runtime.api?.focusRelative(1),
    },
    {
      id: 'read.bigger',
      title: '增大字号',
      group: '阅读',
      icon: 'type',
      run: () => {
        void saveSettings({ fontScale: clampScale(settings.fontScale + 0.05) })
      },
    },
    {
      id: 'read.smaller',
      title: '减小字号',
      group: '阅读',
      icon: 'type',
      run: () => {
        void saveSettings({ fontScale: clampScale(settings.fontScale - 0.05) })
      },
    },
    {
      id: 'read.loose',
      title: '行距更松',
      group: '阅读',
      icon: 'layout',
      run: () => {
        void saveSettings({ lineHeight: Math.min(2, Math.round((settings.lineHeight + 0.05) * 100) / 100) })
      },
    },
    {
      id: 'read.tight',
      title: '行距更紧',
      group: '阅读',
      icon: 'layout',
      run: () => {
        void saveSettings({ lineHeight: Math.max(1.3, Math.round((settings.lineHeight - 0.05) * 100) / 100) })
      },
    },
    {
      id: 'appearance.theme',
      title: '切换外观',
      hint: `当前：${themeLabel}`,
      group: '外观',
      icon: settings.theme === 'dark' ? 'moon' : 'sun',
      run: () => {
        const next = nextTheme(settings.theme)
        void saveSettings({ theme: next })
        const label = themes.find((t) => t.value === next)?.label ?? ''
        toast(`外观：${label}`, next === 'dark' ? 'moon' : 'sun')
      },
    },
    {
      id: 'appearance.light',
      title: '外观：浅色',
      group: '外观',
      icon: 'sun',
      run: () => void saveSettings({ theme: 'light' }),
    },
    {
      id: 'appearance.dark',
      title: '外观：深色',
      group: '外观',
      icon: 'moon',
      run: () => void saveSettings({ theme: 'dark' }),
    },
    {
      id: 'appearance.auto',
      title: '外观：跟随系统',
      group: '外观',
      icon: 'auto',
      run: () => void saveSettings({ theme: 'auto' }),
    },
    ...tints.map<Command>((tint) => ({
      id: `appearance.tint.${tint}`,
      title: `主题色：${tintLabels[tint]}`,
      group: '外观',
      icon: 'palette',
      run: () => {
        void saveSettings({ tint })
        toast(`主题色：${tintLabels[tint]}`, 'palette')
      },
    })),
    {
      id: 'appearance.glass',
      title: '切换玻璃质感',
      hint: `当前：${settings.glass}`,
      group: '外观',
      icon: 'sparkles',
      run: () => {
        const i = glasses.indexOf(settings.glass)
        const next = glasses[(i + 1) % glasses.length] ?? 'soft'
        void saveSettings({ glass: next })
        toast(`玻璃：${next === 'off' ? '关闭' : next === 'soft' ? '柔和' : '强烈'}`, 'sparkles')
      },
    },
    {
      id: 'layout.aside',
      title: settings.aside ? '隐藏右栏' : '显示右栏',
      group: '外观',
      icon: 'sidebar',
      run: () => void toggle('aside'),
    },
    {
      id: 'layout.rail',
      title: settings.railCollapsed ? '展开侧边栏' : '收起侧边栏',
      group: '外观',
      icon: 'layout',
      run: () => void toggle('railCollapsed'),
    },
    {
      id: 'layout.align',
      title: settings.layout ? '关闭原生对齐' : '开启原生对齐',
      hint: '让微博原生信息流对齐 Mist 的列宽',
      group: '外观',
      icon: 'layout',
      run: () => void toggle('layout'),
    },
    {
      id: 'filter.ads',
      title: settings.hideAds ? '显示推广内容' : '隐藏推广内容',
      group: '过滤',
      icon: 'shield',
      run: () => void toggle('hideAds'),
    },
    {
      id: 'filter.promos',
      title: settings.hidePromos ? '显示侧边推广模块' : '隐藏侧边推广模块',
      group: '过滤',
      icon: 'filter',
      run: () => void toggle('hidePromos'),
    },
    {
      id: 'filter.client',
      title: settings.hideClient ? '显示客户端下载提示' : '隐藏客户端下载提示',
      group: '过滤',
      icon: 'filter',
      run: () => void toggle('hideClient'),
    },
    {
      id: 'filter.suggested',
      title: settings.hideSuggested ? '显示推荐关注' : '隐藏推荐关注',
      group: '过滤',
      icon: 'filter',
      run: () => void toggle('hideSuggested'),
    },
    {
      id: 'filter.sheet',
      title: '内容过滤设置…',
      hint: '关键词、用户、卡片类型',
      group: '过滤',
      icon: 'settings',
      run: setSection('filters'),
    },
    {
      id: 'filter.clear',
      title: '清空过滤关键词',
      group: '过滤',
      icon: 'close',
      run: () => {
        void saveSettings({ filters: { ...settings.filters, keywords: [], users: [] } })
        toast('已清空过滤规则', 'check')
      },
    },
    {
      id: 'system.settings',
      title: '打开设置',
      group: '系统',
      icon: 'settings',
      keys: [mod, ','],
      run: () => openSheet('appearance'),
    },
    {
      id: 'system.appearance',
      title: '设置：外观',
      group: '系统',
      icon: 'palette',
      run: setSection('appearance'),
    },
    {
      id: 'system.keys',
      title: '键盘快捷键',
      group: '系统',
      icon: 'keyboard',
      run: setSection('keys'),
    },
    {
      id: 'system.about',
      title: '关于 Mist',
      group: '系统',
      icon: 'info',
      run: setSection('about'),
    },
    {
      id: 'system.reset',
      title: '重置所有设置',
      group: '系统',
      icon: 'repeat',
      run: () => {
        void resetSettings()
        toast('已恢复默认设置', 'check')
      },
    },
  ]

  return commands
}

/** Subsequence scoring: prefix hits rank first, gaps cost a little. */
export function fuzzyScore(query: string, haystack: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const h = haystack.toLowerCase()
  const idx = h.indexOf(q)
  if (idx >= 0) return 120 - idx
  let qi = 0
  let score = 0
  let last = -2
  for (let i = 0; i < h.length && qi < q.length; i += 1) {
    const qc = q[qi] ?? ''
    if (h[i] === qc) {
      score += last === i - 1 ? 4 : 1
      last = i
      qi += 1
    }
  }
  return qi === q.length ? score : -1
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands
  const scored: Array<{ command: Command; score: number }> = []
  for (const command of commands) {
    const score = Math.max(
      fuzzyScore(query, command.title),
      command.hint ? fuzzyScore(query, `${command.title} ${command.hint}`) - 10 : -1,
      fuzzyScore(query, command.group) - 30,
    )
    if (score >= 0) scored.push({ command, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.command)
}

/** A synthetic "search the web on weibo" row when the query is not a command. */
export function searchCommand(query: string): Command {
  const q = query.trim()
  return {
    id: 'web.search',
    title: `搜索微博：${q}`,
    hint: '在 s.weibo.com 打开',
    group: '导航',
    icon: 'search',
    run: () => {
      go(`https://s.weibo.com/weibo?q=${encodeURIComponent(q)}`)
    },
  }
}

export { openPalette }
