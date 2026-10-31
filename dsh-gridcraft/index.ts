/**
 * dsh-gridcraft — embed the official GridCraft web spreadsheet in a DSH main
 * panel, with workspace file open/save through the host.
 *
 * GridCraft (github.com/storytold/gridcraft) is a Rust spreadsheet app whose
 * web build supports a same-origin postMessage host bridge (`?host=parent`):
 * the parent page opens workbooks with `gridcraft:open {name, bytes}` and
 * receives `gridcraft:save {name, bytes}` / `gridcraft:dirty` / `ready` /
 * `failed`. This plugin:
 *
 * - Host half: serves the unmodified upstream web build at
 *   /api/dsh-gridcraft/app/* (same-origin requirement of the bridge) and
 *   exposes /api/dsh-gridcraft/save, which writes bridge bytes into the
 *   owning Session's workspace (containment-checked, atomic), plus
 *   /api/dsh-gridcraft/resolve, which turns deliverables file-card
 *   coordinates into the declared file's path.
 * - Client half (src/client): registers the `gridcraft` right-sidebar tab
 *   type (guide card + spreadsheet file-address patterns), hosting the
 *   iframe; lists spreadsheet files from the selected Session's workspace
 *   via remote.workspaceFiles, and bridges open/save/dirty messages.
 *
 * Static assets are NOT in git: run `npm run fetch-gridcraft` (downloads the
 * official release zip into static/).
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGridcraftRoutes, createResolveRoute } from './routes.js'
import type { GridcraftConfig } from './types.js'

/** Stable cordis plugin id (matches the bundle patch `id: gridcraft`). */
export const name = 'gridcraft'

/** Services required before the surfaces can mount. */
export const inject = ['webServer', 'sessions']

/**
 * Plugin config schema — the plugins settings page auto-generates the form
 * from this (SettingsForms reads the entry fiber's static `Config`). Only
 * `.volatile()` fields accept live edits (`settings/rejected` otherwise), so
 * the switch writes through without restarting this plugin fiber; the client
 * reads the live value through `ctx.configForms.get('gridcraft')` for its
 * routing decisions.
 */
export const Config = z.object({
  defaultOpener: z.boolean().default(true).volatile()
    .description('点击表格文件（xlsx / csv 等）时默认在 GridCraft 中打开；关闭后使用内建预览 (Open spreadsheet files with GridCraft by default; off = built-in preview)'),
})

/** Single-active guard: blocks a concurrent double-activation, and resets when
 * the fiber disposes — a config edit restarts the plugin, and the restart must
 * re-run apply (the same module instance is reused). */
let active = false

function mountOnce(apply: (ctx: Context, config?: GridcraftConfig) => void) {
  return (ctx: Context, config?: GridcraftConfig) => {
    if (active) return
    active = true
    ctx.effect(() => () => { active = false }, 'dsh-gridcraft: mount guard')
    apply(ctx, config)
  }
}

/** Host-half apply: mount static + save routes. */
function applyImpl(ctx: Context, config?: GridcraftConfig): void {
  if (config?.enabled === false) {
    console.log('[dsh-gridcraft] Plugin disabled by config')
    return
  }

  // lib/index.js → lib/../static (repo layout: static/ beside package.json).
  const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'static')
  if (!existsSync(resolve(staticDir, 'index.html'))) {
    console.warn('[dsh-gridcraft] static/index.html missing — run `npm run fetch-gridcraft` in the plugin directory; the panel will show a setup hint until then')
  }

  const disposers: (() => void)[] = []
  for (const route of createGridcraftRoutes({ staticDir, sessions: ctx.sessions })) {
    disposers.push(ctx.webServer.register(route))
  }

  // The resolve route needs the host sessionQuery service; guard it so a host
  // without the service still mounts the static + save surfaces. cordis runs
  // the inject callback as its own plugin — the services are reachable only
  // through the callback's derived context, not the outer closure (the outer
  // ctx trips the "cannot get property … without inject" guard).
  ctx.inject(['sessionQuery'], (serviceCtx) => {
    try {
      disposers.push(ctx.webServer.register(createResolveRoute({
        sessionQuery: (serviceCtx as Context & { sessionQuery: NonNullable<Context['sessionQuery']> }).sessionQuery,
      })))
      console.log('[dsh-gridcraft] resolve route registered at /api/dsh-gridcraft/resolve')
    } catch (error) {
      console.warn('[dsh-gridcraft] Failed to register resolve route:', error)
    }
  })

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'dsh-gridcraft: routes')

  console.log(`[dsh-gridcraft] Plugin initialized — app at /api/dsh-gridcraft/app/, save at /api/dsh-gridcraft/save`)
}

export const apply = mountOnce(applyImpl)
