/**
 * Jump from a kanban task to the DSH conversation that executed it.
 *
 * The client cordis context is captured by the plugin entry's apply(ctx);
 * the GUI's own workspace navigation service (`uiWorkspace`, provided by
 * @deepseek-ai/dsh-client-ui-workspace) exposes openSession(id) to reveal a
 * session in the main view.
 */

let clientCtx: any = null

/** Called once by the plugin entry when the host loads the client module. */
export function setClientContext(ctx: any): void {
  clientCtx = ctx
}

/**
 * Reveal a session in the GUI's main view and report whether the jump was
 * issued (false when the navigation service is unavailable in this build).
 * Fires 'dsh-kanban:close' so the board overlay steps aside for the conversation.
 */
export function openSessionInGui(sessionId: string): boolean {
  try {
    const uiWorkspace = clientCtx?.get?.('uiWorkspace')
    if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
      uiWorkspace.openSession(sessionId)
      window.dispatchEvent(new CustomEvent('dsh-kanban:close'))
      return true
    }
    console.warn('[dsh-kanban] uiWorkspace service unavailable; cannot open session', sessionId)
  } catch (e) {
    console.warn('[dsh-kanban] Failed to open session:', e)
  }
  return false
}
