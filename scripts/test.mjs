#!/usr/bin/env node
/**
 * Unit tests: no runner, no watch mode, just assertions over the modules that
 * hold the product's contracts (settings normalisation, the attribute layer,
 * the palette's ranking). Modules are TypeScript, so each one is bundled with
 * esbuild into a temp dir first — the same compiler the build uses, so tests
 * can never drift from the shipped code.
 */
import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outdir = await mkdtemp(path.join(os.tmpdir(), 'mist-test-'))

const failures = []
let passed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    process.stdout.write(`  ✓ ${name}\n`)
  } catch (error) {
    failures.push({ name, error })
    process.stdout.write(`  ✗ ${name}\n`)
  }
}

try {
  await build({
    absWorkingDir: root,
    entryPoints: {
      settings: 'src/shared/settings.ts',
      utils: 'src/shared/utils.ts',
      commands: 'src/content/commands.ts',
      feed: 'src/content/feed.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outdir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"test"', __MIST_VERSION__: '"test"' },
  })

  const settingsMod = await import(pathToFileURL(path.join(outdir, 'settings.mjs')).href)
  const utilsMod = await import(pathToFileURL(path.join(outdir, 'utils.mjs')).href)
  const commandsMod = await import(pathToFileURL(path.join(outdir, 'commands.mjs')).href)
  const feedMod = await import(pathToFileURL(path.join(outdir, 'feed.mjs')).href)

  const { DEFAULT_SETTINGS, normalizeSettings, settingsToAttributes, settingsToVariables, resolveTheme } = settingsMod
  const { cx, formatCount, escapeHtml, debounce } = utilsMod
  const { buildCommands, filterCommands, fuzzyScore, searchCommand } = commandsMod
  const { formatTime, adaptStatus } = feedMod

  process.stdout.write('\nsettings\n')

  test('empty input falls back to defaults', () => {
    assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
    assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS)
    assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SETTINGS)
  })

  test('unknown enum values are rejected, not stored', () => {
    const s = normalizeSettings({ theme: 'neon', tint: 'lava', glass: 'wet', font: 'comic' })
    assert.equal(s.theme, DEFAULT_SETTINGS.theme)
    assert.equal(s.tint, DEFAULT_SETTINGS.tint)
    assert.equal(s.glass, DEFAULT_SETTINGS.glass)
    assert.equal(s.font, DEFAULT_SETTINGS.font)
  })

  test('numeric prefs are clamped to the readable range', () => {
    assert.equal(normalizeSettings({ fontScale: 9 }).fontScale, 1.3)
    assert.equal(normalizeSettings({ fontScale: 0.1 }).fontScale, 0.85)
    assert.equal(normalizeSettings({ lineHeight: 9 }).lineHeight, 2)
    assert.equal(normalizeSettings({ lineHeight: NaN }).lineHeight, DEFAULT_SETTINGS.lineHeight)
  })

  test('filter kinds are filtered through the known set', () => {
    const s = normalizeSettings({ filters: { kinds: ['promoted', 'wat', 'live'] } })
    assert.deepEqual(s.filters.kinds, ['promoted', 'live'])
    assert.deepEqual(normalizeSettings({ filters: { kinds: 'promoted' } }).filters.kinds, DEFAULT_SETTINGS.filters.kinds)
  })

  test('keyword lists are trimmed, de-duplicated and capped', () => {
    const s = normalizeSettings({ filters: { keywords: ['  抽奖 ', '', '抽奖', 'x'.repeat(90)] } })
    assert.deepEqual(s.filters.keywords, ['抽奖', 'x'.repeat(90)])
  })

  test('version is always stamped by the normaliser', () => {
    assert.equal(normalizeSettings({ version: 0 }).version, DEFAULT_SETTINGS.version)
  })

  process.stdout.write('\nattribute contract (settings → CSS)\n')

  test('the page skin gate and every switch has a data-mist mirror', () => {
    const attrs = settingsToAttributes(DEFAULT_SETTINGS)
    for (const key of [
      'data-mist',
      'data-mist-theme',
      'data-mist-tint',
      'data-mist-glass',
      'data-mist-font',
      'data-mist-hide-promos',
      'data-mist-hide-client',
      'data-mist-hide-ads',
      'data-mist-hide-suggested',
      'data-mist-autoplay',
      'data-mist-focus',
      'data-mist-clamp',
      'data-mist-layout',
      'data-mist-rail',
      'data-mist-aside',
    ]) {
      assert.ok(key in attrs, `${key} missing`)
    }
  })

  test('rail + aside collapse agree with the settings', () => {
    assert.equal(settingsToAttributes({ ...DEFAULT_SETTINGS, railCollapsed: true })['data-mist-rail'], 'collapsed')
    assert.equal(settingsToAttributes({ ...DEFAULT_SETTINGS, aside: false })['data-mist-aside'], 'false')
  })

  test('reading variables follow the type controls', () => {
    const vars = settingsToVariables({ ...DEFAULT_SETTINGS, fontScale: 1.1, lineHeight: 1.8 })
    assert.equal(vars['--mist-reading-size'], '16.50px')
    assert.equal(vars['--mist-reading-leading'], '1.8')
  })

  test('auto theme resolves to a real theme', () => {
    assert.equal(resolveTheme('light'), 'light')
    assert.equal(resolveTheme('dark'), 'dark')
    assert.ok(['light', 'dark'].includes(resolveTheme('auto')))
  })

  process.stdout.write('\nutils\n')

  test('cx drops falsy parts', () => {
    assert.equal(cx('m-card', false, undefined, null, 'is-open'), 'm-card is-open')
  })

  test('counts use 万 / 亿 and never leak floats', () => {
    assert.equal(formatCount(0), '0')
    assert.equal(formatCount(999), '999')
    assert.equal(formatCount(12345), '1.2万')
    assert.equal(formatCount(100000), '10万')
    assert.equal(formatCount(123456789), '1.2亿')
    assert.equal(formatCount(-4), '0')
  })

  test('escapeHtml covers the four dangerous characters', () => {
    assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  test('debounce collapses a burst into one call', async () => {
    let calls = 0
    const fn = debounce(() => {
      calls += 1
    }, 10)
    fn()
    fn()
    fn()
    await new Promise((done) => setTimeout(done, 40))
    assert.equal(calls, 1)
  })

  process.stdout.write('\npalette ranking\n')

  test('fuzzyScore rewards prefixes and rejects non-subsequences', () => {
    assert.ok(fuzzyScore('外观', '外观设置') > fuzzyScore('外观', '打开外观设置'))
    assert.equal(fuzzyScore('zzzz', '外观设置'), -1)
    assert.equal(fuzzyScore('', 'anything'), 0)
  })

  test('every command is addressable and titled', () => {
    const commands = buildCommands(DEFAULT_SETTINGS)
    assert.ok(commands.length >= 25, `only ${commands.length} commands`)
    const ids = new Set()
    for (const command of commands) {
      assert.ok(command.id && command.title && command.group, 'command is incomplete')
      assert.ok(!ids.has(command.id), `duplicate id ${command.id}`)
      ids.add(command.id)
      assert.equal(typeof command.run, 'function')
    }
  })

  test('searching narrows to the relevant group', () => {
    const commands = buildCommands(DEFAULT_SETTINGS)
    const hits = filterCommands(commands, '深色')
    assert.ok(hits.length > 0)
    assert.ok(hits[0].title.includes('深色') || hits[0].title.includes('主题'))
    assert.equal(filterCommands(commands, '').length, commands.length)
  })

  test('an unmatched query still yields a web search row', () => {
    const row = searchCommand('液态玻璃')
    assert.ok(row.title.includes('液态玻璃'))
    assert.equal(row.group, '导航')
  })
  process.stdout.write('\nfeed adapters\n')

  test('weibo time strings become relative labels', () => {
    const now = Date.parse('2026-11-19T12:00:00+08:00')
    assert.equal(formatTime('Thu Nov 19 11:59:30 +0800 2026', now), '1 分钟前')
    assert.equal(formatTime('Thu Nov 19 09:00:00 +0800 2026', now), '3 小时前')
    assert.equal(formatTime('Thu Nov 14 18:08:17 +0800 2024', now), '2024-11-14')
    assert.equal(formatTime(undefined), '')
  })

  test('a raw status flattens into a post', () => {
    const post = adaptStatus({
      id: 1,
      idstr: '1',
      mblogid: 'N1',
      created_at: 'Thu Nov 14 18:08:17 +0800 2024',
      text: '正文 <a href="/n/x">@某人</a>',
      user: { screen_name: '海边', verified: true },
      attitudes_count: 12,
      comments_count: 3,
      reposts_count: 1,
      attitudes_status: 1,
      pic_ids: ['p1'],
      pic_infos: { p1: { largest: { url: 'http://img/1.jpg' } } },
    })
    assert.equal(post.author.name, '海边')
    assert.equal(post.stats.likes, 12)
    assert.equal(post.liked, true)
    assert.equal(post.images[0].large, 'https://img/1.jpg')
    assert.ok(post.html.includes('@某人'))
  })

  test('a status without an id is dropped', () => {
    assert.equal(adaptStatus({ text: 'x' }), null)
  })
} finally {
  await rm(outdir, { recursive: true, force: true })
}

process.stdout.write(`\n  ${passed} passed, ${failures.length} failed\n\n`)
if (failures.length > 0) {
  for (const { name, error } of failures) {
    process.stdout.write(`  ✗ ${name}\n    ${error.message}\n`)
  }
  process.exitCode = 1
}
