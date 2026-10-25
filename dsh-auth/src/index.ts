/**
 * dsh-auth — Login authentication plugin for DeepSeek Harness.
 * Provides username/password authentication, session management,
 * and API protection for the Web GUI.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { UserStore } from './store.ts'
import { createAuthRoutes, createAuthMiddleware, matchRoute, AUTH_API_BASE, type AuthRoute } from './routes.ts'

/** Stable cordis plugin name */
export const name = 'auth'

/** Services required before the auth surfaces can mount */
export const inject = ['webServer']

/** Plugin config */
export interface Config {
  /** Enable/disable authentication */
  enabled?: boolean
  /** Paths that don't require authentication (glob patterns) */
  publicPaths?: string[]
  /** Whether to show setup wizard when no admin exists */
  enableSetup?: boolean
}

/** Default config */
const defaultConfig: Required<Config> = {
  enabled: true,
  publicPaths: [
    '/api/dsh-auth/login',
    '/api/dsh-auth/setup',
    '/api/dsh-auth/status',
    '/favicon.ico',
    '/assets/*',
  ],
  enableSetup: true,
}

/**
 * Check if a path matches any of the public path patterns
 */
function isPublicPath(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      if (path.startsWith(prefix)) return true
    } else if (path === pattern) {
      return true
    }
  }
  return false
}

/**
 * Plugin apply function — mounts auth routes and middleware.
 */
export function apply(ctx: Context, config?: Config): void {
  const resolvedConfig = { ...defaultConfig, ...config }
  
  if (!resolvedConfig.enabled) {
    console.log('[dsh-auth] Authentication disabled by config')
    return
  }

  const store = new UserStore()
  const authMiddleware = createAuthMiddleware(store)
  const authRoutes = createAuthRoutes(store)

  console.log(`[dsh-auth] Initializing with ${store.hasAdmin() ? 'existing admin' : 'no admin (setup required)'}`)

  // Register auth API routes
  const routeDisposers: (() => void)[] = []

  for (const route of authRoutes) {
    const disposer = ctx.webServer.register({
      method: route.method,
      path: route.path,
      handler: async (req, res) => {
        // Check authentication for protected routes
        if (route.auth) {
          const auth = authMiddleware(req)
          if (!auth) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Authentication required' }))
            return
          }
          // Check admin requirement
          if (route.admin && auth.role !== 'admin') {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Admin access required' }))
            return
          }
          // Attach auth info to request
          ;(req as any).auth = auth
        }

        // Extract params for parameterized routes
        const params = route.path.includes(':')
          ? matchRoute(route.path, req.url?.split('?')[0] ?? '')
          : undefined

        await route.handler(req, res, params ?? undefined)
      },
    })
    routeDisposers.push(disposer)
  }

  // Cleanup on dispose
  ctx.effect(() => () => {
    for (const dispose of routeDisposers) dispose()
  }, 'dsh-auth: routes')

  // Register middleware to protect all other /api routes
  const middlewareDisposer = ctx.webServer.register({
    method: 'GET',
    path: '/api/*',
    handler: async (req, res) => {
      const path = req.url?.split('?')[0] ?? ''
      
      // Skip auth routes (already handled)
      if (path.startsWith(AUTH_API_BASE)) {
        return
      }

      // Skip public paths
      if (isPublicPath(path, resolvedConfig.publicPaths)) {
        return
      }

      // Check authentication
      const auth = authMiddleware(req)
      if (!auth) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Authentication required' }))
        return
      }
    },
  })

  ctx.effect(() => () => middlewareDisposer(), 'dsh-auth: middleware')

  // Clean expired sessions periodically
  const interval = setInterval(() => {
    const cleaned = store.cleanExpiredSessions()
    if (cleaned > 0) {
      console.log(`[dsh-auth] Cleaned ${cleaned} expired sessions`)
    }
  }, 60 * 60 * 1000) // Every hour

  ctx.effect(() => () => clearInterval(interval), 'dsh-auth: cleanup')

  console.log('[dsh-auth] Plugin initialized successfully')
}

/** Model-facing announcement */
export const AUTH_GUIDANCE = '本机已安装 dsh-auth 插件（登录鉴权）：保护 Web GUI 访问，需要用户名/密码登录。首次使用请访问 /setup 创建管理员账户。用户提到「登录 / 鉴权 / 认证 / 用户管理」时即指本插件。'
