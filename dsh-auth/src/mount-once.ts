/**
 * Utility to ensure a plugin is mounted only once, even if loaded multiple times.
 * Follows the dsh-ssh pattern.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Global mount registry */
const mounted = new Set<string>()

/**
 * Create a mount-once wrapper for a plugin apply function.
 * @param name - unique plugin name
 * @param apply - the actual apply function
 * @returns wrapped apply that only executes once
 */
export function mountOnce<T>(
  name: string,
  apply: (ctx: Context, config?: T) => void
): (ctx: Context, config?: T) => void {
  return (ctx: Context, config?: T) => {
    if (mounted.has(name)) {
      console.log(`[dsh-auth] Plugin "${name}" already mounted, skipping`)
      return
    }
    mounted.add(name)
    apply(ctx, config)
  }
}
