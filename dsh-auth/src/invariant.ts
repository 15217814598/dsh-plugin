/**
 * Type invariant exports for dsh-auth.
 * This file ensures type safety across the plugin boundary.
 */

export type { UserRecord, JwtPayload, SessionRecord } from './store.ts'
export type { AuthRoute, AuthenticatedRequest } from './routes.ts'
export type { Config } from './index.ts'
