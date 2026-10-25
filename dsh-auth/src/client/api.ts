/**
 * Browser-side API client for the auth routes.
 */

/** API endpoint paths */
const API = {
  login: '/api/dsh-auth/login',
  logout: '/api/dsh-auth/logout',
  me: '/api/dsh-auth/me',
  status: '/api/dsh-auth/status',
  setup: '/api/dsh-auth/setup',
  users: '/api/dsh-auth/users',
} as const

/** User info from API */
export interface UserInfo {
  id: string
  username: string
  displayName?: string
  email?: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt?: string
  enabled: boolean
}

/** Login response */
export interface LoginResponse {
  user: UserInfo
  token: string
}

/** Auth status response */
export interface AuthStatusResponse {
  hasAdmin: boolean
  authenticated: boolean
  user: UserInfo | null
}

/** API error */
export class AuthApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'AuthApiError'
  }
}

/**
 * Auth API client.
 */
export class AuthApi {
  private token: string | null = null

  constructor() {
    // Try to load token from localStorage
    this.token = localStorage.getItem('dsh-auth-token')
  }

  /** Set the auth token */
  setToken(token: string | null): void {
    this.token = token
    if (token) {
      localStorage.setItem('dsh-auth-token', token)
      document.cookie = `dsh-auth-token=${token}; path=/; max-age=${24 * 60 * 60}`
    } else {
      localStorage.removeItem('dsh-auth-token')
      document.cookie = 'dsh-auth-token=; path=/; max-age=0'
    }
  }

  /** Get the current token */
  getToken(): string | null {
    return this.token
  }

  /** Make an authenticated request */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const res = await fetch(path, {
      ...options,
      headers,
    })

    const data = await res.json()

    if (!res.ok) {
      throw new AuthApiError(data.error ?? 'Request failed', res.status)
    }

    return data as T
  }

  /** Login with username and password */
  async login(username: string, password: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>(API.login, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    this.setToken(data.token)
    return data
  }

  /** Logout */
  async logout(): Promise<void> {
    try {
      await this.request(API.logout, { method: 'POST' })
    } finally {
      this.setToken(null)
    }
  }

  /** Get current user info */
  async getMe(): Promise<UserInfo> {
    const data = await this.request<{ user: UserInfo }>(API.me)
    return data.user
  }

  /** Check auth status */
  async getStatus(): Promise<AuthStatusResponse> {
    return this.request<AuthStatusResponse>(API.status)
  }

  /** Initial setup (create admin) */
  async setup(username: string, password: string, displayName?: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>(API.setup, {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    })
    this.setToken(data.token)
    return data
  }

  /** List users (admin only) */
  async listUsers(): Promise<UserInfo[]> {
    const data = await this.request<{ users: UserInfo[] }>(API.users)
    return data.users
  }

  /** Create user (admin only) */
  async createUser(
    username: string,
    password: string,
    options?: { displayName?: string; email?: string; role?: 'admin' | 'user' }
  ): Promise<UserInfo> {
    const data = await this.request<{ user: UserInfo }>(API.users, {
      method: 'POST',
      body: JSON.stringify({ username, password, ...options }),
    })
    return data.user
  }

  /** Update user (admin only) */
  async updateUser(
    userId: string,
    updates: { displayName?: string; email?: string; role?: 'admin' | 'user'; enabled?: boolean }
  ): Promise<UserInfo> {
    const data = await this.request<{ user: UserInfo }>(`${API.users}/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    return data.user
  }

  /** Delete user (admin only) */
  async deleteUser(userId: string): Promise<void> {
    await this.request(`${API.users}/${userId}`, { method: 'DELETE' })
  }

  /** Reset user password (admin only) */
  async resetPassword(userId: string, password: string): Promise<void> {
    await this.request(`${API.users}/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  }

  /** Check if authenticated */
  isAuthenticated(): boolean {
    return !!this.token
  }
}

/** Singleton API instance */
export const authApi = new AuthApi()
