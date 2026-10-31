/**
 * Language sync between the DSH host and the embedded GridCraft app.
 *
 * The upstream app has its own i18n (19 languages, zh included) and reads
 * `localStorage['gridcraft.ui']` — a JSON blob with a `language` field — at
 * boot. The iframe runs on the SAME origin as the host web GUI (the bridge
 * requires it), so one Storage is shared: writing the field from the plugin
 * client makes the app boot in the host's language. A running iframe does not
 * hot-switch (the app reads the field only at boot, and the postMessage bridge
 * has no language message), so a switch applies the next time the app boots.
 */

/** Language codes the upstream app ships (from its backstage language list). */
const GC_APP_LANGUAGES = new Set([
  'en', 'es', 'el', 'zh', 'ja', 'ko', 'ru', 'pt', 'de', 'cs',
  'fr', 'sr', 'tr', 'pl', 'it', 'uk', 'vi', 'nl', 'ro',
])

/** The ui prefs blob key (app-owned; every other field is preserved). */
const GC_UI_KEY = 'gridcraft.ui'

/**
 * Point the embedded app at `localeId` (no-op when it already matches).
 * Malformed/unavailable Storage is ignored: the app falls back to English.
 */
export function syncAppLanguage(localeId: string): void {
  const code = GC_APP_LANGUAGES.has(localeId) ? localeId : 'en'
  let storage: Storage
  try {
    storage = window.localStorage
  } catch {
    return
  }
  let ui: Record<string, unknown> = {}
  try {
    ui = JSON.parse(storage.getItem(GC_UI_KEY) ?? '{}') as Record<string, unknown>
  } catch {
    ui = {}
  }
  if (ui.language === code) return
  ui.language = code
  try {
    storage.setItem(GC_UI_KEY, JSON.stringify(ui))
  } catch {
    /* best effort */
  }
}
