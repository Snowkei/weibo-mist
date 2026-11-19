#!/usr/bin/env node
/**
 * Screenshot harness for the local prototype page.
 *
 *   npm run build:demo && npm run shots
 *
 * Serves dist-demo/ over loopback and drives a headless Chrome/Edge that is
 * already installed on the machine — no Playwright download, no puppeteer.
 * Every image lands in shots/ and is referenced by the README.
 */
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const distDir = path.join(root, 'dist-demo')
const shotDir = path.join(root, 'shots')

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

const browser = CANDIDATES.find((candidate) => candidate && existsSync(candidate))

if (!browser) {
  console.error('No Chrome/Chromium/Edge found. Set CHROME_PATH=/path/to/chrome and retry.')
  process.exit(1)
}

if (!existsSync(path.join(distDir, 'index.html'))) {
  console.error('dist-demo/ is missing — run `npm run build:demo` first.')
  process.exit(1)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const relative = url.pathname === '/' ? '/index.html' : url.pathname
  const file = path.join(distDir, path.normalize(relative).replace(/^(\.\.[/\\])+/, ''))
  try {
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const { port } = server.address()
const base = `http://127.0.0.1:${port}`

/** name → query string. Keep in sync with the README screenshots. */
const SHOTS = [
  ['home', ''],
  ['palette', '?palette=1'],
  ['sheet', '?sheet=appearance'],
  ['dark', '?theme=dark'],
  ['dusk', '?theme=dark&tint=dusk&glass=strong'],
  ['longform', '?view=long'],
]

await mkdir(shotDir, { recursive: true })

const shoot = (name, query) =>
  new Promise((resolve) => {
    const target = path.join(shotDir, `demo-${name}.png`)
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--window-size=1512,982',
      '--virtual-time-budget=2600',
      `--screenshot=${target}`,
      `${base}/${query}`,
    ]
    execFile(browser, args, { timeout: 60_000 }, (error) => {
      if (error) console.error(`  ✗ ${name}: ${error.message.split('\n')[0]}`)
      else console.log(`  ✓ shots/demo-${name}.png`)
      resolve()
    })
  })

console.log(`Serving dist-demo on ${base}`)
for (const [name, query] of SHOTS) await shoot(name, query)

server.close()
console.log(`\nDone — ${SHOTS.length} screenshots in shots/`)
