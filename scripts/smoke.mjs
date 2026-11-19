#!/usr/bin/env node
/**
 * Functional smoke test for the built extension.
 *
 * The demo page only proves the shell renders with demo data. This script
 * proves the *built* content script boots on a page that mimics weibo's real
 * DOM (nested `.WB_frame > #pl_feedlist_index > .card-wrap`), that the page
 * skin gate is on, and that the enhancer actually hides ads and recommended
 * cards. It runs the real `dist/content.js`, not the sources.
 *
 *   npm run build && npm run smoke
 */
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const FIXTURE = join(ROOT, 'tests', 'fixture', 'timeline.html')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
}

async function locateChrome() {
  const { access } = await import('node:fs/promises')
  for (const path of CHROME_CANDIDATES) {
    try {
      await access(path)
      return path
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

async function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const file = join(dir, url.pathname === '/' ? 'timeline.html' : url.pathname)
    const stream = createReadStream(file)
    stream.on('error', () => {
      res.writeHead(404).end('not found')
    })
    stream.on('open', () => {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      stream.pipe(res)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() }
}

function dump(chrome, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--virtual-time-budget=3500',
        '--window-size=1512,982',
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('error', reject)
    child.on('close', () => resolve(out))
  })
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

const work = await mkdtemp(join(tmpdir(), 'mist-smoke-'))
const chrome = await locateChrome()
const server = chrome ? await serve(work) : null

try {
  if (!chrome) {
    console.log('! no Chrome/Chromium/Edge found — set CHROME_PATH to run the smoke test')
    process.exit(0)
  }

  const content = await readFile(join(DIST, 'content.js'), 'utf8').catch(() => null)
  if (!content) {
    console.log('! dist/content.js is missing — run `npm run build` first')
    process.exit(1)
  }

  await cp(FIXTURE, join(work, 'timeline.html'))
  await cp(join(DIST, 'content.js'), join(work, 'content.js'))
  await cp(join(DIST, 'weibo.css'), join(work, 'weibo.css'))

  const html = await dump(chrome, `${server.origin}/?mist-dev=1`)

  check('content script booted', /data-mist-booted="true"/.test(html))
  check('page skin gate on (<html data-mist>)', /<html[^>]*\sdata-mist[\s=>]/.test(html))
  check('shell mounted', html.includes('id="mist-root"'))
  check('stage took the page over', /data-mist-staged="true"/.test(html))
  check('timeline moved into #mist-feed', (() => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
    return /moved=yes/.test(title)
  })())
  check('column is 624px wide', /feed=400\+624/.test(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''), html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'no probe')

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const isHidden = (sel) => new RegExp(`${sel.replace(/[.#]/g, '\\$&')}:no`).test(title)
  const isVisible = (sel) => new RegExp(`${sel.replace(/[.#]/g, '\\$&')}:yes`).test(title)

  check('native top nav hidden', isHidden('.gn_header'), title)
  check('native side column hidden', isHidden('#side'), title)
  check('native right rail hidden', isHidden('#right'), title)
  check('native composer hidden', isHidden('.compose-box'), title)
  check('native tabs hidden', isHidden('.feed-tabs'), title)
  check('floating widgets hidden', isHidden('#rocket'), title)
  check('dialog stays visible', isVisible('#wbox'), title)

  const cards = [...html.matchAll(/<div class="card-wrap"[^>]*>/g)].map((m) => m[0])
  check('fixture exposes 4 cards', cards.length === 4, `saw ${cards.length}`)

  const hidden = (needle) =>
    cards.some((tag) => tag.includes(needle) && tag.includes('data-mist-hidden="true"'))
  check('ad card hidden', hidden('adid='))
  check('recommended card hidden', hidden('mid="1003"'))
  check('normal card kept', cards.some((tag) => tag.includes('mid="1001"') && !tag.includes('data-mist-hidden')))
  check('tags recorded for filtering', cards.some((tag) => tag.includes('data-mist-tags="promoted"')))

  check('enhancer counted the feed', /data-mist-view="all"/.test(html))
} finally {
  server?.close()
  await rm(work, { recursive: true, force: true })
}

let failed = 0
for (const { name, ok, detail } of results) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1
