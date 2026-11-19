import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Icon, type IconName } from '../shared/icons'
import { saveSettings, resetSettings } from '../shared/store'
import type { FilterKind, Glass, Settings, ThemeMode, Tint } from '../shared/settings'
import { modKey } from '../shared/utils'
import { closeSheet, toast, ui, useStore, type SheetSection } from './state'
import { useSettings } from './use-settings'

const SECTIONS: Array<{ id: SheetSection; label: string; icon: IconName }> = [
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'layout', label: '布局', icon: 'sidebar' },
  { id: 'reading', label: '阅读', icon: 'type' },
  { id: 'filters', label: '过滤', icon: 'filter' },
  { id: 'keys', label: '快捷键', icon: 'keyboard' },
  { id: 'about', label: '关于', icon: 'info' },
]

const TINTS: Array<{ id: Tint; label: string; swatch: string }> = [
  { id: 'mist', label: '雾', swatch: 'oklch(0.56 0.09 255)' },
  { id: 'graphite', label: '石墨', swatch: 'oklch(0.52 0.008 265)' },
  { id: 'sand', label: '沙', swatch: 'oklch(0.62 0.08 68)' },
  { id: 'salt', label: '盐', swatch: 'oklch(0.6 0.08 195)' },
  { id: 'dusk', label: '暮', swatch: 'oklch(0.58 0.11 300)' },
]

const KINDS: Array<{ id: FilterKind; label: string }> = [
  { id: 'promoted', label: '推广' },
  { id: 'recommend', label: '推荐流' },
  { id: 'superTopic', label: '超话' },
  { id: 'vote', label: '投票' },
  { id: 'lottery', label: '抽奖' },
  { id: 'live', label: '直播' },
  { id: 'task', label: '任务卡' },
]

function Field({ title, desc, children }: { title: string; desc?: string; children?: ComponentChildren }) {
  return (
    <div class="m-field">
      <div class="m-field-copy">
        <div class="m-field-title">{title}</div>
        {desc ? <div class="m-field-desc">{desc}</div> : null}
      </div>
      <div class="m-field-control">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      class="m-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div class="m-segment" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          class="m-segment-item"
          role="radio"
          aria-checked={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  format: (value: number) => string
  label: string
}) {
  return (
    <>
      <input
        type="range"
        class="m-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onInput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="m-slider-value m-numeric">{format(value)}</span>
    </>
  )
}

export function Sheet() {
  const shell = useStore(ui)
  const settings = useSettings()
  const section = shell.sheetSection

  const patch = (next: Partial<Settings>): void => {
    void saveSettings(next)
  }

  return (
    <>
      <div class="m-scrim" onMouseDown={closeSheet} />
      <div class="m-sheet" role="dialog" aria-modal="true" aria-label="Mist 设置">
        <aside class="m-sheet-side">
          <div class="m-sheet-title">Mist</div>
          <nav class="m-sheet-nav">
            {SECTIONS.map((item) => (
              <button
                type="button"
                key={item.id}
                class="m-sheet-nav-item"
                aria-current={item.id === section}
                onClick={() => ui.set({ sheetSection: item.id })}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </nav>
          <div class="m-sheet-side-foot">
            设置会自动同步到你的浏览器账户。
            <br />
            v{__MIST_VERSION__}
          </div>
        </aside>

        <div class="m-sheet-body">
          <div class="m-sheet-body-head">
            <div>
              <h2 class="m-sheet-heading">{SECTIONS.find((s) => s.id === section)?.label}</h2>
              <p class="m-sheet-sub">{SUBTITLES[section]}</p>
            </div>
            <button type="button" class="m-icon-btn" aria-label="关闭设置" onClick={closeSheet}>
              <Icon name="close" size={18} />
            </button>
          </div>

          {section === 'appearance' ? <Appearance settings={settings} patch={patch} /> : null}
          {section === 'layout' ? <Layout settings={settings} patch={patch} /> : null}
          {section === 'reading' ? <Reading settings={settings} patch={patch} /> : null}
          {section === 'filters' ? <Filters settings={settings} patch={patch} /> : null}
          {section === 'keys' ? <Keys /> : null}
          {section === 'about' ? <About /> : null}
        </div>
      </div>
    </>
  )
}

const SUBTITLES: Record<SheetSection, string> = {
  appearance: '明暗、主题色与玻璃。变化会立刻作用到整页。',
  layout: '三栏的比例与开关。关掉原生对齐时，微博会回到它自己的宽度。',
  reading: '字号、行距和长文行为，只影响正文。',
  filters: '规则只在本机匹配，不读取你的账号内容。',
  keys: '所有快捷键都在页面有焦点时生效。',
  about: 'Mist 是一层皮，不是另一个微博。',
}

function Appearance({ settings, patch }: { settings: Settings; patch: (next: Partial<Settings>) => void }) {
  return (
    <>
      <div class="m-group">
        <div class="m-group-label">外观</div>
        <Field title="明暗" desc="跟随系统会随 macOS / Windows 的日夜切换。">
          <Segmented<ThemeMode>
            label="明暗"
            value={settings.theme}
            options={[
              { id: 'auto', label: '自动' },
              { id: 'light', label: '浅色' },
              { id: 'dark', label: '深色' },
            ]}
            onChange={(theme) => patch({ theme })}
          />
        </Field>
        <Field title="玻璃质感" desc="毛玻璃会读背景；性能敏感的机器可以关掉。">
          <Segmented<Glass>
            label="玻璃质感"
            value={settings.glass}
            options={[
              { id: 'off', label: '关闭' },
              { id: 'soft', label: '柔和' },
              { id: 'strong', label: '强烈' },
            ]}
            onChange={(glass) => patch({ glass })}
          />
        </Field>
        <Field title="字体" desc="系统字体最稳；衬线适合长文。">
          <Segmented<'system' | 'serif' | 'rounded'>
            label="字体"
            value={settings.font}
            options={[
              { id: 'system', label: '系统' },
              { id: 'serif', label: '衬线' },
              { id: 'rounded', label: '圆体' },
            ]}
            onChange={(font) => patch({ font })}
          />
        </Field>
      </div>

      <div class="m-group">
        <div class="m-group-label">主题色</div>
        <div class="m-choice-row">
          {TINTS.map((tint) => (
            <button
              type="button"
              key={tint.id}
              class="m-choice"
              aria-checked={settings.tint === tint.id}
              onClick={() => patch({ tint: tint.id })}
            >
              <span class="m-swatch" style={{ background: tint.swatch }} />
              {tint.label}
            </button>
          ))}
        </div>
        <div class="m-note">
          <Icon name="info" size={16} />
          主题色只用于交互状态和链接，不会给大面积背景上色——安静是这套设计的默认值。
        </div>
      </div>
    </>
  )
}

function Layout({ settings, patch }: { settings: Settings; patch: (next: Partial<Settings>) => void }) {
  return (
    <div class="m-group">
      <div class="m-group-label">栏位</div>
      <Field title="右栏" desc="热搜、过滤统计与阅读入口。窄屏会自动隐藏。">
        <Switch label="右栏" checked={settings.aside} onChange={(aside) => patch({ aside })} />
      </Field>
      <Field title="收起侧边栏" desc="只留图标，把宽度还给正文。">
        <Switch
          label="收起侧边栏"
          checked={settings.railCollapsed}
          onChange={(railCollapsed) => patch({ railCollapsed })}
        />
      </Field>
      <Field title="对齐原生信息流" desc="把微博自己的时间线收进 Mist 的列宽里。">
        <Switch label="对齐原生信息流" checked={settings.layout} onChange={(layout) => patch({ layout })} />
      </Field>

      <div class="m-group-label">页面</div>
      <Field title="阅读进度条" desc="顶部 2px，随滚动增长。">
        <Switch
          label="阅读进度条"
          checked={settings.progressBar}
          onChange={(progressBar) => patch({ progressBar })}
        />
      </Field>
      <Field title="记住滚动位置" desc="刷新或返回时回到刚才读到的地方。">
        <Switch
          label="记住滚动位置"
          checked={settings.rememberScroll}
          onChange={(rememberScroll) => patch({ rememberScroll })}
        />
      </Field>
      <Field title="键盘快捷键" desc="J / K 移动光标，↵ 进入阅读模式，⌘K 打开命令面板。">
        <Switch label="键盘快捷键" checked={settings.shortcuts} onChange={(shortcuts) => patch({ shortcuts })} />
      </Field>
    </div>
  )
}

function Reading({ settings, patch }: { settings: Settings; patch: (next: Partial<Settings>) => void }) {
  return (
    <div class="m-group">
      <div class="m-group-label">正文</div>
      <Field title="字号" desc="只缩放正文，不动界面元素。">
        <Slider
          label="字号"
          value={settings.fontScale}
          min={0.85}
          max={1.3}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(fontScale) => patch({ fontScale })}
        />
      </Field>
      <Field title="行距" desc="1.6 是默认值；长文可以更松。">
        <Slider
          label="行距"
          value={settings.lineHeight}
          min={1.3}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(lineHeight) => patch({ lineHeight })}
        />
      </Field>

      <div class="m-group-label">行为</div>
      <Field title="自动展开长文" desc="遇到「展开全文」直接点开，不打断阅读。">
        <Switch
          label="自动展开长文"
          checked={settings.autoExpand}
          onChange={(autoExpand) => patch({ autoExpand })}
        />
      </Field>
      <Field title="视频自动播放" desc="关掉后只在点击时播放。">
        <Switch label="视频自动播放" checked={settings.autoplay} onChange={(autoplay) => patch({ autoplay })} />
      </Field>
      <Field title="专注模式" desc="悬停的那条微博保持清晰，其余退到背景里。">
        <Switch label="专注模式" checked={settings.focusMode} onChange={(focusMode) => patch({ focusMode })} />
      </Field>
    </div>
  )
}

function Filters({ settings, patch }: { settings: Settings; patch: (next: Partial<Settings>) => void }) {
  const [keywords, setKeywords] = useState(settings.filters.keywords.join('\n'))
  const [users, setUsers] = useState(settings.filters.users.join('\n'))

  useEffect(() => {
    setKeywords(settings.filters.keywords.join('\n'))
    setUsers(settings.filters.users.join('\n'))
  }, [settings.filters.keywords, settings.filters.users])

  const commit = (nextKeywords: string, nextUsers: string): void => {
    void saveSettings({
      filters: {
        ...settings.filters,
        keywords: nextKeywords
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        users: nextUsers
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      },
    })
    toast('过滤规则已更新', 'check')
  }

  const toggleKind = (kind: FilterKind): void => {
    const kinds = settings.filters.kinds.includes(kind)
      ? settings.filters.kinds.filter((k) => k !== kind)
      : [...settings.filters.kinds, kind]
    patch({ filters: { ...settings.filters, kinds } })
  }

  return (
    <>
      <div class="m-group">
        <Field title="启用内容过滤" desc="关闭后所有规则暂停，卡片原样显示。">
          <Switch
            label="启用内容过滤"
            checked={settings.filters.enabled}
            onChange={(enabled) => patch({ filters: { ...settings.filters, enabled } })}
          />
        </Field>
        <div class="m-field">
          <div class="m-field-copy">
            <div class="m-field-title">卡片类型</div>
            <div class="m-field-desc">按微博自己标记的卡片种类过滤。</div>
          </div>
        </div>
        <div class="m-choice-row">
          {KINDS.map((kind) => (
            <button
              type="button"
              key={kind.id}
              class="m-choice"
              aria-checked={settings.filters.kinds.includes(kind.id)}
              onClick={() => toggleKind(kind.id)}
            >
              {kind.label}
            </button>
          ))}
        </div>
      </div>

      <div class="m-group">
        <div class="m-group-label">关键词</div>
        <div class="m-field">
          <div class="m-field-copy">
            <div class="m-field-title">每行一个，命中正文即隐藏整条</div>
            <div class="m-field-desc">匹配时不区分大小写；规则只留在本机。</div>
          </div>
        </div>
        <textarea
          class="m-textarea"
          spellcheck={false}
          placeholder={'抽奖\n代购\n加微信'}
          value={keywords}
          onInput={(event) => setKeywords((event.currentTarget as HTMLTextAreaElement).value)}
          onBlur={() => commit(keywords, users)}
        />
      </div>

      <div class="m-group">
        <div class="m-group-label">用户</div>
        <div class="m-field">
          <div class="m-field-copy">
            <div class="m-field-title">每行一个昵称或 @handle</div>
            <div class="m-field-desc">命中作者就隐藏，用来静音不想看的账号。</div>
          </div>
        </div>
        <textarea
          class="m-textarea"
          spellcheck={false}
          placeholder={'某某营销号'}
          value={users}
          onInput={(event) => setUsers((event.currentTarget as HTMLTextAreaElement).value)}
          onBlur={() => commit(keywords, users)}
        />
      </div>
    </>
  )
}

function Keys() {
  const mod = modKey()
  const rows: Array<[string, string[]]> = [
    ['命令面板', [mod, 'K']],
    ['设置', [mod, ',']],
    ['关闭浮层', ['esc']],
    ['下一条 / 上一条', ['J', 'K']],
    ['在新标签打开', ['O']],
    ['阅读模式', ['↵']],
    ['收藏当前条', ['S']],
    ['发微博', ['C']],
    ['回到顶部', ['G', 'G']],
    ['切换明暗', ['T']],
    ['专注模式', ['F']],
  ]
  return (
    <div class="m-group">
      <div class="m-group-label">键盘</div>
      <div class="m-shortcuts">
        {rows.map(([label, keys]) => (
          <div class="m-shortcut" key={label}>
            <span>{label}</span>
            <span class="m-shortcut-keys">
              {keys.map((key) => (
                <span class="m-kbd" key={key}>
                  {key}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div class="m-note" style={{ marginBlockStart: '16px' }}>
        <Icon name="info" size={16} />
        输入框获得焦点时，除 <span class="m-kbd">esc</span> 外所有快捷键都会让位给打字。
      </div>
    </div>
  )
}

function About() {
  return (
    <div class="m-group">
      <div class="m-field">
        <div class="m-field-copy">
          <div class="m-field-title">Mist · 雾微博 {__MIST_VERSION__}</div>
          <div class="m-field-desc">
            一层重画的皮肤：X 式的三栏、苹果式的排版与液态玻璃，加上对微博原生页面的清理。数据只走微博自己的接口，不经过任何第三方。
          </div>
        </div>
      </div>
      <div class="m-field">
        <div class="m-field-copy">
          <div class="m-field-title">重置</div>
          <div class="m-field-desc">恢复默认外观、布局、阅读与过滤设置。</div>
        </div>
        <div class="m-field-control">
          <button
            type="button"
            class="m-btn"
            data-variant="danger"
            onClick={() => {
              void resetSettings()
              toast('已恢复默认设置', 'check')
            }}
          >
            重置
          </button>
        </div>
      </div>
      <div class="m-note">
        <Icon name="shield" size={16} />
        没有统计、没有远程配置、没有账号上传。设置存在 chrome.storage.sync。
      </div>
    </div>
  )
}
