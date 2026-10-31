/**
 * Fetch the official GridCraft web build into static/.
 *
 * The plugin embeds the unmodified upstream web bundle (iframe + postMessage
 * host bridge, see packaging/web/README.md in the gridcraft repository), so
 * the binary wasm/js assets stay out of git: run `npm run fetch-gridcraft`
 * once after cloning. Idempotent — skips the download when static/index.html
 * already exists unless --force is passed.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(__dirname, '..')
const STATIC_DIR = resolve(PLUGIN_ROOT, 'static')
const MARKER = resolve(STATIC_DIR, 'index.html')

const VERSION = '0.13.0'
const URL = `https://github.com/storytold/gridcraft/releases/download/v${VERSION}/gridcraft-web-${VERSION}.zip`

const force = process.argv.includes('--force')

if (!force && existsSync(MARKER)) {
  console.log(`[fetch-gridcraft] static/ already populated (${statSync(MARKER).size} bytes index.html) — skipping. Use --force to re-download.`)
  process.exit(0)
}

console.log(`[fetch-gridcraft] downloading ${URL} …`)
const res = await fetch(URL, { redirect: 'follow' })
if (!res.ok || !res.body) {
  console.error(`[fetch-gridcraft] download failed: HTTP ${res.status} ${res.statusText}`)
  process.exit(1)
}

const zipPath = resolve(STATIC_DIR, `gridcraft-web-${VERSION}.zip`)
mkdirSync(STATIC_DIR, { recursive: true })
await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
console.log(`[fetch-gridcraft] downloaded ${statSync(zipPath).size} bytes`)

console.log('[fetch-gridcraft] extracting …')
const { default: extract } = await import('extract-zip')
await extract(zipPath, { dir: STATIC_DIR })
rmSync(zipPath)

if (!existsSync(MARKER)) {
  // Some zips wrap entries in a versioned subfolder — flatten one level.
  const { readdirSync, renameSync } = await import('node:fs')
  const children = readdirSync(STATIC_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
  const nested = children.find(entry => existsSync(resolve(STATIC_DIR, entry.name, 'index.html')))
  if (nested === undefined) {
    console.error('[fetch-gridcraft] extraction produced no index.html — unexpected archive layout')
    process.exit(1)
  }
  for (const entry of readdirSync(resolve(STATIC_DIR, nested.name), { withFileTypes: true })) {
    renameSync(resolve(STATIC_DIR, nested.name, entry.name), resolve(STATIC_DIR, entry.name))
  }
  rmSync(resolve(STATIC_DIR, nested.name), { recursive: true })
}

console.log('[fetch-gridcraft] done — static/ ready:')
for (const name of (await import('node:fs')).readdirSync(STATIC_DIR)) {
  console.log(`  ${name}`)
}
