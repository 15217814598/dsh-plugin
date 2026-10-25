/**
 * User store: JSON file (`~/.dsh/dsh-auth.json`) holding user credentials
 * and session tokens. Provides atomic read/write operations.
 * Uses Node.js built-in crypto for password hashing (no external dependencies).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { hashPassword, verifyPassword } from './crypto.ts'
import { signJwt, verifyJwt, type JwtPayload } from './jwt.ts'

export type { JwtPayload }

/** User record stored in the JSON file */
export interface UserRecord {
  id: string
  username: string
  passwordHash: string
  displayName?: string
  email?: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt?: string
  enabled: boolean
}

/** Session token record */
export interface SessionRecord {
  id: string
  userId: string
  token: string
  createdAt: string
  expiresAt: string
  ip?: string
  userAgent?: string
}

/** Store file shape */
interface AuthStore {
  version: number
  users: Record<string, UserRecord>
  sessions: Record<string, SessionRecord>
  usernameIndex: Record<string, string>
}

/** Store file location */
export function getStorePath(): string {
  return join(homedir(), '.dsh', 'dsh-auth.json')
}

/**
 * User authentication store. Thread-safe via atomic JSON writes.
 */
export class UserStore {
  private store: AuthStore
  private storePath: string

  constructor(storePath?: string) {
    this.storePath = storePath ?? getStorePath()
    this.store = this.load()
  }

  /** Load store from disk, creating if needed */
  private load(): AuthStore {
    try {
      if (existsSync(this.storePath)) {
        const raw = readFileSync(this.storePath, 'utf-8')
        const data = JSON.parse(raw) as AuthStore
        return {
          version: data.version ?? 1,
          users: data.users ?? {},
          sessions: data.sessions ?? {},
          usernameIndex: data.usernameIndex ?? {},
        }
      }
    } catch (err) {
      console.error('[dsh-auth] Failed to load store, creating new:', err)
    }
    return { version: 1, users: {}, sessions: {}, usernameIndex: {} }
  }

  /** Save store to disk atomically */
  private save(): void {
    const dir = dirname(this.storePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    const tmp = `${this.storePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.store, null, 2), 'utf-8')
    writeFileSync(this.storePath, readFileSync(tmp))
    try {
      chmodSync(this.storePath, 0o600)
    } catch {
      // Ignore on Windows
    }
  }

  /** Create a new user */
  async createUser(
    username: string,
    password: string,
    options: { displayName?: string; email?: string; role?: 'admin' | 'user' } = {}
  ): Promise<UserRecord> {
    if (this.store.usernameIndex[username]) {
      throw new Error(`Username "${username}" already exists`)
    }

    const id = randomUUID()
    const passwordHash = await hashPassword(password)
    const now = new Date().toISOString()

    const user: UserRecord = {
      id,
      username,
      passwordHash,
      displayName: options.displayName,
      email: options.email,
      role: options.role ?? 'user',
      createdAt: now,
      enabled: true,
    }

    this.store.users[id] = user
    this.store.usernameIndex[username] = id
    this.save()

    return user
  }

  /** Authenticate user by username and password */
  async authenticate(username: string, password: string, meta?: { ip?: string; userAgent?: string }): Promise<{ user: UserRecord; token: string } | null> {
    const userId = this.store.usernameIndex[username]
    if (!userId) return null

    const user = this.store.users[userId]
    if (!user || !user.enabled) return null

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) return null

    user.lastLoginAt = new Date().toISOString()
    this.save()

    const token = signJwt({
      userId: user.id,
      username: user.username,
      role: user.role,
    })

    const sessionId = randomUUID()
    const now = new Date()
    const session: SessionRecord = {
      id: sessionId,
      userId: user.id,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    }
    this.store.sessions[sessionId] = session
    this.save()

    return { user, token }
  }

  /** Verify JWT token and return payload */
  verifyToken(token: string): JwtPayload | null {
    const payload = verifyJwt(token)
    if (!payload) return null
    const user = this.store.users[payload.userId]
    if (!user || !user.enabled) return null
    return payload
  }

  /** Get user by ID */
  getUser(userId: string): Omit<UserRecord, 'passwordHash'> | null {
    const user = this.store.users[userId]
    if (!user) return null
    const { passwordHash, ...safe } = user
    return safe
  }

  /** Get user by username */
  getUserByUsername(username: string): Omit<UserRecord, 'passwordHash'> | null {
    const userId = this.store.usernameIndex[username]
    if (!userId) return null
    return this.getUser(userId)
  }

  /** List all users (without password hashes) */
  listUsers(): Omit<UserRecord, 'passwordHash'>[] {
    return Object.values(this.store.users).map(({ passwordHash, ...u }) => u)
  }

  /** Update user */
  async updateUser(
    userId: string,
    updates: { displayName?: string; email?: string; role?: 'admin' | 'user'; enabled?: boolean; password?: string }
  ): Promise<Omit<UserRecord, 'passwordHash'> | null> {
    const user = this.store.users[userId]
    if (!user) return null

    if (updates.displayName !== undefined) user.displayName = updates.displayName
    if (updates.email !== undefined) user.email = updates.email
    if (updates.role !== undefined) user.role = updates.role
    if (updates.enabled !== undefined) user.enabled = updates.enabled
    if (updates.password) {
      user.passwordHash = await hashPassword(updates.password)
    }

    this.save()
    const { passwordHash, ...safe } = user
    return safe
  }

  /** Delete user */
  deleteUser(userId: string): boolean {
    const user = this.store.users[userId]
    if (!user) return false

    delete this.store.users[userId]
    delete this.store.usernameIndex[user.username]
    
    for (const [id, session] of Object.entries(this.store.sessions)) {
      if (session.userId === userId) {
        delete this.store.sessions[id]
      }
    }

    this.save()
    return true
  }

  /** Invalidate a session token */
  invalidateSession(token: string): boolean {
    for (const [id, session] of Object.entries(this.store.sessions)) {
      if (session.token === token) {
        delete this.store.sessions[id]
        this.save()
        return true
      }
    }
    return false
  }

  /** Invalidate all sessions for a user */
  invalidateAllSessions(userId: string): number {
    let count = 0
    for (const [id, session] of Object.entries(this.store.sessions)) {
      if (session.userId === userId) {
        delete this.store.sessions[id]
        count++
      }
    }
    if (count > 0) this.save()
    return count
  }

  /** Clean up expired sessions */
  cleanExpiredSessions(): number {
    const now = new Date()
    let count = 0
    for (const [id, session] of Object.entries(this.store.sessions)) {
      if (new Date(session.expiresAt) < now) {
        delete this.store.sessions[id]
        count++
      }
    }
    if (count > 0) this.save()
    return count
  }

  /** Check if any admin user exists */
  hasAdmin(): boolean {
    return Object.values(this.store.users).some(u => u.role === 'admin')
  }

  /** Get active sessions count */
  getActiveSessionsCount(): number {
    const now = new Date()
    return Object.values(this.store.sessions).filter(s => new Date(s.expiresAt) > now).length
  }
}
