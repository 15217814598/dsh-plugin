/**
 * dsh-gridcraft client entry — registers the spreadsheet editor as a
 * right-sidebar tab type (the two-stage sidebar-right registration, as
 * ui-sidebar-browser does for its browser page):
 *
 * - Stage 1 (`ctx.sidebarRightTabs.register`): the tab type — kind, chip
 *   title, and the guide-page entry card that opens it as a blank page tab.
 *   Resource `patterns` additionally claim session-scope spreadsheet file
 *   addresses (`.xlsx/.xls/.csv/.tsv/.ods`), so file cards, chat mentions,
 *   @file references and Files-sidebar rows route here instead of the
 *   fallback text preview (this type's default `extension` band outranks it).
 * - Stage 2 (`sidebar.right.pane.tab` keyed slot): the tab body, dispatched
 *   under the stage-1 `id` — one instance per tab (blank page or file).
 *   `sidebar.right.pane.tab.title` adds a live chip title (file name for
 *   resource tabs; the captured-at-open default would not follow locale
 *   changes for the page tab).
 * - Also contributed: an "Open in Spreadsheets" button on conversation file
 *   cards (`deliverables.file.actions` slot) for spreadsheet files.
 *
 * `keepMounted` keeps the iframe and its WASM workbook state alive across
 * tab switches, sidebar collapse, and session changes.
 */
import { appUrl, listSpreadsheets, saveToWorkspace, unwrapRemote } from './api.ts'
import { syncAppLanguage } from './appLanguage.ts'
import { parseSessionFileAddress, sessionFileAddress } from './address.ts'
import type { SessionFileTarget } from './address.ts'
import { dictionaries, NS } from './locales.ts'
import { SpreadsheetPanel } from './SpreadsheetPanel.tsx'
import { TabTitle } from './TabTitle.tsx'
import { OpenInGridcraft } from './OpenInGridcraft.tsx'
import { BundleConfigView } from './BundleConfigView.tsx'
import { PanelIcon } from './PanelIcon.tsx'

/** Inlined by esbuild (define) from src/client/gridcraft.css. */
declare const __GC_CSS__: string

/** Inlined by esbuild (define) from package.json — the console load marker. */
declare const __GC_VERSION__: string

/** Tab implementation identity — the body/title slot key; the package name is the natural value. */
const TAB_ID = 'dsh-gridcraft-plugin'

/** This bundle's package name — the `plugins.bundle.config` key on the Plugins page. */
const BUNDLE_ID = 'dsh-gridcraft-plugin'

/** Profile entry id (cordis.patch.yml) — also the settings namespace the client reads. */
const ENTRY_ID = 'gridcraft'

/** Tab type discriminator — what `sidebarRight.openTab` names. */
const TAB_KIND = 'gridcraft'

/** Guide-card position among the shipped entries. */
const GUIDE_ORDER = 60

/** Spreadsheet extensions claimed from the fallback text preview. */
const SPREADSHEET_PATTERNS = ['*.xlsx', '*.xls', '*.csv', '*.tsv', '*.ods']

/** Required client services (remote sub-namespaces are declared individually). */
export const inject = ['slots', 'locale', 'configForms', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'remote.session', 'sessions']

/** Idempotent style injection (the factory may run again after HMR-like reloads). */
function injectStyles(): void {
  const id = 'dsh-gridcraft-styles'
  if (document.getElementById(id) !== null) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = __GC_CSS__
  document.head.appendChild(style)
}

export function apply(ctx: any): void {
  try {
    applyImpl(ctx)
  } catch (error) {
    // Boot audits render only the state name for a failed fiber — surface the
    // real error for diagnostics (also visible in the browser console).
    ;(window as any).__DSH_GRIDCRAFT_BOOT_ERROR__ = (error as Error)?.stack ?? String(error)
    console.error('[dsh-gridcraft] client apply failed:', error)
    throw error
  }
}

function applyImpl(ctx: any): void {
  console.info('[dsh-gridcraft] client bundle v' + __GC_VERSION__)
  injectStyles()
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-gridcraft: dictionaries')
  const t = ctx.locale.bind(NS)

  // The embedded app boots in the host language (same-origin Storage; a
  // running iframe picks a switch up on its next boot).
  const syncLanguage = () => { syncAppLanguage(ctx.locale.getLocale().active) }
  syncLanguage()
  ctx.effect(() => ctx.locale.subscribe(syncLanguage), 'dsh-gridcraft: app language')

  // The plugin's own config (plugins settings page → dsh-gridcraft-plugin):
  // the default-opener switch, read live for every routing decision and card.
  const openerForm = ctx.configForms.get<{ defaultOpener?: boolean }>(ENTRY_ID)
  const isDefaultOpener = (): boolean => {
    const snapshot = openerForm.getSnapshot()
    // loading/unavailable, or the field unset: the schema default (on).
    return snapshot.status !== 'ready' || snapshot.value?.defaultOpener !== false
  }

  // The inject face closes over the client context (services stay in the
  // apply world; the component only receives data + callbacks).
  const face = {
    hooks: {
      // Bare getSnapshot/subscribe source → renderer binds useSessionList.
      sessionList: ctx.sessions.list,
    },
    listSpreadsheets: (sessionId: string, signal?: AbortSignal) =>
      listSpreadsheets(ctx.remote, sessionId, signal),
    readFileBytes: (sessionId: string, path: string, signal?: AbortSignal) =>
      ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, signal)
        .then((result: any) => unwrapRemote(result).data),
    saveFile: (sessionId: string, path: string, bytes: Uint8Array) =>
      saveToWorkspace(sessionId, path, bytes),
    revealFile: (sessionId: string, path: string) =>
      ctx.remote.session.openWorkspacePath({ path }).then((result: any) => unwrapRemote(result)),
    staticUrl: appUrl(),
  }

  // Stage 1: the tab type. Copy thunks re-evaluate per read, so a language
  // change needs no re-registration. Patterns without ':' match the address
  // path by basename at any depth (nocase, dotfiles included).
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    keepMounted: true,
    patterns: SPREADSHEET_PATTERNS,
    // The plugin-config default-opener switch vetoes here: with it off, the
    // fallback text preview resumes and this type is simply not offered.
    canOpen: (address: string) => isDefaultOpener() && parseSessionFileAddress(address) !== undefined,
    title: (address: string) => {
      const target = parseSessionFileAddress(address)
      return target !== undefined && target.name !== '' ? target.name : t('tabTitle')
    },
    guide: [{
      id: 'open',
      order: GUIDE_ORDER,
      title: () => t('guideTitle'),
      description: () => t('guideDescription'),
      icon: PanelIcon,
    }],
  }), 'dsh-gridcraft: tab type')

  // Stage 2: the body (keyed by the type id; `locale: NS` keeps the reactive
  // framework t seat on the component props).
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
    inject: () => face,
  }, SpreadsheetPanel))

  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  }, TabTitle))

  // File-card button: resolves the card's presented coordinates to the
  // declared path (cached per actionUrl) and opens matching files here.
  const resolveCache = new Map<string, Promise<SessionFileTarget | null>>()
  const resolvePresented = (actionUrl: string): Promise<SessionFileTarget | null> => {
    const cached = resolveCache.get(actionUrl)
    if (cached !== undefined) return cached
    const query = new URL(actionUrl, window.location.href).searchParams
    const promise = fetch(`/api/dsh-gridcraft/resolve?${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('dsh-auth-token') ?? ''}` },
    })
      .then(async response => (response.ok ? await response.json() as {
        success: boolean
        data?: { sessionId: string, path: string, name: string }
      } : null))
      .then(body => body !== null && body.success && body.data !== undefined
        ? { sessionId: body.data.sessionId, path: body.data.path, name: body.data.name }
        : null)
      .catch(() => null)
    resolveCache.set(actionUrl, promise)
    return promise
  }

  ctx.slots.inject('deliverables.file.actions', () => ctx.slots.register({
    name: 'deliverables.file.actions',
    id: 'gridcraft-open',
    locale: NS,
    inject: () => ({
      resolvePresented,
      openAddress: (address: string) => { ctx.sidebarRight.openResource(address) },
      isDefaultOpener,
      subscribeDefaultOpener: (listener: () => void) => openerForm.subscribe(listener),
    }),
  }, OpenInGridcraft))

  // The default-opener switch on the bundle's own Plugins page (keyed by the
  // package name; the page renders it between description and rows).
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: BUNDLE_ID,
    locale: NS,
    inject: () => ({ form: openerForm }),
  }, BundleConfigView))
}
