/**
 * postMessage bridge to the embedded GridCraft web app (`?host=parent`).
 *
 * Wire shapes (apps/gridcraft-web/src/host.rs upstream):
 * - child → parent: {type:'gridcraft:ready', version}
 *                   {type:'gridcraft:save', name, bytes}
 *                   {type:'gridcraft:dirty', dirty}
 *                   {type:'gridcraft:failed', error}
 * - parent → child: {type:'gridcraft:open', name, bytes}
 *
 * Both sides guard on origin + source; the app itself only talks to a
 * same-origin parent, and the panel only accepts events whose source is the
 * iframe's contentWindow.
 */

export interface GridcraftSaveMessage {
  type: 'gridcraft:save'
  name: string
  bytes: ArrayBuffer
}

export type GridcraftInbound =
  | { type: 'gridcraft:ready', version: string }
  | GridcraftSaveMessage
  | { type: 'gridcraft:dirty', dirty: boolean }
  | { type: 'gridcraft:failed', error: string }

export function isInbound(data: unknown): data is GridcraftInbound {
  return typeof data === 'object' && data !== null
    && typeof (data as { type?: unknown }).type === 'string'
    && String((data as { type: string }).type).startsWith('gridcraft:')
}

/** Send a workbook to the iframe (equivalent of File › Open). */
export function sendOpen(win: Window | null, name: string, bytes: Uint8Array): void {
  if (win === null) return
  // Copy into a plain ArrayBuffer so detach/transfer semantics can never
  // alias the remote's buffer.
  const copy = bytes.slice().buffer
  win.postMessage({ type: 'gridcraft:open', name, bytes: copy }, window.location.origin)
}

/**
 * Pending open request: `gridcraft:open` sent before the app posts
 * `gridcraft:ready` would be dropped by the app's bridge (no queue upstream),
 * so the panel holds the request and flushes it on ready.
 */
export interface PendingOpen {
  name: string
  bytes: Uint8Array
}
