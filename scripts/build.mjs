#!/usr/bin/env node
/**
 * Mist build pipeline.
 *
 * Four independent builds keep the bundles honest:
 *   1. UI entries  — Preact bundles; CSS imported from TSX is inlined as text
 *                    so the shadow root can adopt it without a network hop.
 *   2. weibo.css   — document-level skin, emitted as a real stylesheet and
 *                    registered in the manifest so it lands before first paint.
 *   3. demo        — a static design prototype that imports the same tokens
 *                    and shell components as the extension.
 *   4. manifest    — generated from package.json so version drift is impossible.
 */
import { build, context } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const args = new Set(process.argv.slice(2))
const watch = args.has('--watch')
const demoOnly = args.has('--demo')
const outDir = path.join(root, 'dist')
const demoDir = path.join(root, 'dist-demo')

const shared = {
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  target: ['chrome111', 'edge111'],
  logLevel: 'info',
  define: {
    __MIST_VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  },
}

/** @type {import('esbuild').BuildOptions} */
const ui = {
  ...shared,
  entryPoints: {
    content: path.join(root, 'src/content/index.ts'),
    background: path.join(root, 'src/background/index.ts'),
    'main-world': path.join(root, 'src/main-world/index.ts'),
  },
  outdir: outDir,
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text', '.svg': 'text' },
}

/** @type {import('esbuild').BuildOptions} */
const skin = {
  ...shared,
  entryPoints: [path.join(root, 'src/styles/weibo.css')],
  outfile: path.join(outDir, 'weibo.css'),
  loader: { '.woff2': 'file' },
  assetNames: 'assets/[name]-[hash]',
}

/** @type {import('esbuild').BuildOptions} */
const demo = {
  ...shared,
  // Array form so the CSS keeps its own name (demo.css, not demo.css.css).
  entryPoints: [path.join(root, 'src/demo/main.tsx'), path.join(root, 'src/demo/demo.css')],
  outdir: demoDir,
  format: 'esm',
  splitting: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
}

const manifest = {
  manifest_version: 3,
  name: '__MSG_appName__',
  short_name: 'Mist',
  description: '__MSG_appDesc__',
  version: pkg.version,
  version_name: `${pkg.version} glass`,
  minimum_chrome_version: '111',
  default_locale: 'zh_CN',
  icons: {
    16: 'icon/16.png',
    32: 'icon/32.png',
    48: 'icon/48.png',
    128: 'icon/128.png',
  },
  action: {
    default_title: '__MSG_actionTitle__',
    default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
  permissions: ['storage', 'activeTab'],
  host_permissions: ['https://weibo.com/*', 'https://*.weibo.com/*', 'https://*.sinaimg.cn/*'],
  content_scripts: [
    {
      matches: ['https://weibo.com/*', 'https://*.weibo.com/*'],
      js: ['content.js'],
      css: ['weibo.css'],
      run_at: 'document_start',
      all_frames: false,
    },
    {
      matches: ['https://weibo.com/*', 'https://*.weibo.com/*'],
      js: ['main-world.js'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: false,
    },
  ],
  commands: {
    'toggle-palette': {
      suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
      description: '__MSG_commandPalette__',
    },
  },
}

async function copyStatic() {
  await mkdir(path.join(outDir, 'icon'), { recursive: true })
  for (const size of [16, 32, 48, 128]) {
    const from = path.join(root, `public/icon/${size}.png`)
    if (existsSync(from)) await cp(from, path.join(outDir, `icon/${size}.png`))
  }
  if (existsSync(path.join(root, 'public/_locales'))) {
    await cp(path.join(root, 'public/_locales'), path.join(outDir, '_locales'), { recursive: true })
  }
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function copyDemoHtml() {
  await mkdir(demoDir, { recursive: true })
  await cp(path.join(root, 'src/demo/index.html'), path.join(demoDir, 'index.html'))
  await cp(path.join(root, 'public/icon'), path.join(demoDir, 'icon'), { recursive: true })
}

async function run() {
  await rm(outDir, { recursive: true, force: true })
  await rm(demoDir, { recursive: true, force: true })

  if (!demoOnly) {
    await build(ui)
    await build(skin)
    await copyStatic()
  }
  await build(demo)
  await copyDemoHtml()
  console.log(`\n  Mist ${pkg.version} → ${demoOnly ? 'dist-demo' : 'dist + dist-demo'}\n`)
}

if (watch) {
  const ctxA = await context(ui)
  const ctxB = await context(skin)
  const ctxC = await context(demo)
  await Promise.all([ctxA.watch(), ctxB.watch(), ctxC.watch()])
  await copyDemoHtml()
  console.log('  watching… (reload the extension after content.js changes)')
} else {
  await run()
}
