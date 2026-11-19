#!/usr/bin/env node
/**
 * Package dist/ into release/mist-<version>.zip — the exact folder Chrome
 * expects when you drag-and-drop or upload to the Web Store.
 *
 * Zero dependencies: if a `zip` binary is missing we fall back to tar.gz and
 * say so, so the script never silently produces half a release.
 */
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const dist = path.join(root, 'dist')
const outDir = path.join(root, 'release')

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const name = `mist-${pkg.version}`

try {
  await stat(dist)
} catch {
  console.error('dist/ is missing — run `npm run build` first.')
  process.exit(1)
}

await mkdir(outDir, { recursive: true })
const zipFile = path.join(outDir, `${name}.zip`)
await rm(zipFile, { force: true })

try {
  await run('zip', ['-r', '-q', '-X', zipFile, '.', '-x', '.*'], { cwd: dist })
  const { size } = await stat(zipFile)
  console.log(`✓ release/${name}.zip  ${kb(size)}`)
} catch (error) {
  const tgz = path.join(outDir, `${name}.tar.gz`)
  await run('tar', ['-czf', tgz, '-C', dist, '.'], { cwd: root })
  const { size } = await stat(tgz)
  console.log(`✓ release/${name}.tar.gz  ${kb(size)}  (no zip binary found: ${error.code ?? 'error'})`)
}
