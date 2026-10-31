/** Shared types for the dsh-gridcraft host half. */

/** Plugin configuration (the `Config` schema → plugins settings page). */
export interface GridcraftConfig {
  enabled?: boolean
  /** Open spreadsheet files in GridCraft by default; off = built-in preview. */
  defaultOpener?: boolean
}

/** Standard JSON API envelope, aligned with the other dsh plugins. */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
