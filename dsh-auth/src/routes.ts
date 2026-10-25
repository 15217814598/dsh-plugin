/**
 * Auth API routes: login, logout, user management, and middleware
 * for protecting other endpoints.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { UserStore, type JwtPayload } from './store.ts'

/** Route definition */
export interface AuthRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse, params?: Record<string, string>) => Promise<void>
  /** If true, requires authentication */
  auth?: boolean
  /** If true, requires admin role */
  admin?: boolean
}

/** API base path */
export const AUTH_API_BASE = '/api/dsh-auth'

/** Extended request with auth info */
export interface AuthenticatedRequest extends IncomingMessage {
  auth?: JwtPayload
}

/** Parse JSON body from request */
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/** Send JSON response */
function sendJson(res: ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Extract token from Authorization header */
function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

/** Extract cookie token */
function extractCookieToken(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie
  if (!cookies) return null
  const match = cookies.match(/dsh-auth-token=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Create auth routes for the given store.
 */
export function createAuthRoutes(store: UserStore): AuthRoute[] {
  const routes: AuthRoute[] = [
    // ── Public routes ──────────────────────────────────────────────────────

    /** POST /api/dsh-auth/login - Authenticate user */
    {
      method: 'POST',
      path: `${AUTH_API_BASE}/login`,
      handler: async (req, res) => {
        try {
          const { username, password } = await parseBody(req)
          if (!username || !password) {
            sendJson(res, 400, { error: 'Username and password are required' })
            return
          }

          const ip = req.socket.remoteAddress
          const userAgent = req.headers['user-agent']
          const result = await store.authenticate(username, password, { ip, userAgent })

          if (!result) {
            sendJson(res, 401, { error: 'Invalid username or password' })
            return
          }

          const { passwordHash, ...safeUser } = result.user
          sendJson(res, 200, {
            user: safeUser,
            token: result.token,
          })
        } catch (err: any) {
          sendJson(res, 500, { error: err.message })
        }
      },
    },

    /** POST /api/dsh-auth/logout - Invalidate current session */
    {
      method: 'POST',
      path: `${AUTH_API_BASE}/logout`,
      auth: true,
      handler: async (req, res) => {
        const token = extractToken(req) ?? extractCookieToken(req)
        if (token) {
          store.invalidateSession(token)
        }
        sendJson(res, 200, { success: true })
      },
    },

    /** GET /api/dsh-auth/me - Get current user info */
    {
      method: 'GET',
      path: `${AUTH_API_BASE}/me`,
      auth: true,
      handler: async (req, res) => {
        const authReq = req as AuthenticatedRequest
        const user = store.getUser(authReq.auth!.userId)
        if (!user) {
          sendJson(res, 404, { error: 'User not found' })
          return
        }
        sendJson(res, 200, { user })
      },
    },

    /** GET /api/dsh-auth/status - Check auth status (public) */
    {
      method: 'GET',
      path: `${AUTH_API_BASE}/status`,
      handler: async (req, res) => {
        const token = extractToken(req) ?? extractCookieToken(req)
        let authenticated = false
        let user = null

        if (token) {
          const payload = store.verifyToken(token)
          if (payload) {
            authenticated = true
            user = store.getUser(payload.userId)
          }
        }

        sendJson(res, 200, {
          hasAdmin: store.hasAdmin(),
          authenticated,
          user,
        })
      },
    },

    // ── Admin routes ───────────────────────────────────────────────────────

    /** GET /api/dsh-auth/users - List all users (admin only) */
    {
      method: 'GET',
      path: `${AUTH_API_BASE}/users`,
      auth: true,
      admin: true,
      handler: async (req, res) => {
        const users = store.listUsers()
        sendJson(res, 200, { users })
      },
    },

    /** POST /api/dsh-auth/users - Create new user (admin only) */
    {
      method: 'POST',
      path: `${AUTH_API_BASE}/users`,
      auth: true,
      admin: true,
      handler: async (req, res) => {
        try {
          const { username, password, displayName, email, role } = await parseBody(req)
          if (!username || !password) {
            sendJson(res, 400, { error: 'Username and password are required' })
            return
          }
          if (password.length < 6) {
            sendJson(res, 400, { error: 'Password must be at least 6 characters' })
            return
          }

          const user = await store.createUser(username, password, { displayName, email, role })
          const { passwordHash, ...safe } = user
          sendJson(res, 201, { user: safe })
        } catch (err: any) {
          sendJson(res, 400, { error: err.message })
        }
      },
    },

    /** PUT /api/dsh-auth/users/:id - Update user (admin only) */
    {
      method: 'PUT',
      path: `${AUTH_API_BASE}/users/:id`,
      auth: true,
      admin: true,
      handler: async (req, res, params) => {
        try {
          const updates = await parseBody(req)
          const user = await store.updateUser(params!.id, updates)
          if (!user) {
            sendJson(res, 404, { error: 'User not found' })
            return
          }
          sendJson(res, 200, { user })
        } catch (err: any) {
          sendJson(res, 400, { error: err.message })
        }
      },
    },

    /** DELETE /api/dsh-auth/users/:id - Delete user (admin only) */
    {
      method: 'DELETE',
      path: `${AUTH_API_BASE}/users/:id`,
      auth: true,
      admin: true,
      handler: async (req, res, params) => {
        const deleted = store.deleteUser(params!.id)
        if (!deleted) {
          sendJson(res, 404, { error: 'User not found' })
          return
        }
        sendJson(res, 200, { success: true })
      },
    },

    /** POST /api/dsh-auth/users/:id/reset-password - Reset user password (admin only) */
    {
      method: 'POST',
      path: `${AUTH_API_BASE}/users/:id/reset-password`,
      auth: true,
      admin: true,
      handler: async (req, res, params) => {
        try {
          const { password } = await parseBody(req)
          if (!password || password.length < 6) {
            sendJson(res, 400, { error: 'Password must be at least 6 characters' })
            return
          }
          const user = await store.updateUser(params!.id, { password })
          if (!user) {
            sendJson(res, 404, { error: 'User not found' })
            return
          }
          sendJson(res, 200, { success: true })
        } catch (err: any) {
          sendJson(res, 400, { error: err.message })
        }
      },
    },

    /** POST /api/dsh-auth/setup - Initial admin setup (public, only works when no admin exists) */
    {
      method: 'POST',
      path: `${AUTH_API_BASE}/setup`,
      handler: async (req, res) => {
        if (store.hasAdmin()) {
          sendJson(res, 403, { error: 'Admin already exists. Use login instead.' })
          return
        }

        try {
          const { username, password, displayName } = await parseBody(req)
          if (!username || !password) {
            sendJson(res, 400, { error: 'Username and password are required' })
            return
          }
          if (password.length < 6) {
            sendJson(res, 400, { error: 'Password must be at least 6 characters' })
            return
          }

          const user = await store.createUser(username, password, {
            displayName: displayName ?? 'Administrator',
            role: 'admin',
          })

          const result = await store.authenticate(username, password)
          sendJson(res, 201, {
            user,
            token: result?.token,
          })
        } catch (err: any) {
          sendJson(res, 400, { error: err.message })
        }
      },
    },
  ]

  return routes
}

/**
 * Create auth middleware that validates tokens on protected routes.
 * Returns the auth payload if valid, or null.
 */
export function createAuthMiddleware(store: UserStore) {
  return (req: IncomingMessage): JwtPayload | null => {
    const token = extractToken(req) ?? extractCookieToken(req)
    if (!token) return null
    return store.verifyToken(token)
  }
}

/**
 * Check if a request path matches a route pattern with params.
 * Returns matched params or null.
 */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')

  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i]
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }

  return params
}
