/**
 * Browser-half entry for the dsh-auth plugin — runs inside the dsh web GUI.
 * Registers the auth guard and mounts the login/user management surfaces.
 */

import type { Context } from '@deepseek-ai/cordis'
import { authApi } from './api.ts'

/** Plugin ID for data attributes */
const PLUGIN_ID = 'dsh-auth'

/**
 * Auth guard: intercepts page loads and shows login if not authenticated.
 */
class AuthGuard {
  private container: HTMLDivElement | null = null
  private isAuthenticated = false
  private checkInterval: ReturnType<typeof setInterval> | null = null

  constructor(private ctx: Context) {}

  /** Start the auth guard */
  async start(): Promise<void> {
    // Check initial auth status
    await this.checkAuth()

    // Listen for auth state changes
    window.addEventListener('storage', this.onStorageChange)

    // Periodically check token validity
    this.checkInterval = setInterval(() => this.checkAuth(), 5 * 60 * 1000) // Every 5 mins
  }

  /** Stop the auth guard */
  stop(): void {
    window.removeEventListener('storage', this.onStorageChange)
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.unmount()
  }

  /** Check authentication status */
  private async checkAuth(): Promise<void> {
    try {
      const status = await authApi.getStatus()

      if (status.authenticated) {
        this.isAuthenticated = true
        this.unmount()
        return
      }

      // Not authenticated — show login
      this.isAuthenticated = false
      this.mountLogin()
    } catch (err) {
      console.error('[dsh-auth] Auth check failed:', err)
      // On error, assume not authenticated
      this.isAuthenticated = false
      this.mountLogin()
    }
  }

  /** Handle storage events (token changes in other tabs) */
  private onStorageChange = (e: StorageEvent): void => {
    if (e.key === 'dsh-auth-token') {
      this.checkAuth()
    }
  }

  /** Mount the login page */
  private async mountLogin(): Promise<void> {
    if (this.container) return

    // Dynamically import React components
    const { createElement } = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { LoginPage } = await import('./LoginPage.tsx')

    this.container = document.createElement('div')
    this.container.id = `${PLUGIN_ID}-login-container`
    this.container.style.cssText = 'position:fixed;inset:0;z-index:10000;'
    document.body.appendChild(this.container)

    const root = createRoot(this.container)
    root.render(
      createElement(LoginPage, {
        onLogin: () => {
          this.isAuthenticated = true
          this.unmount()
        },
      })
    )
  }

  /** Unmount the login page */
  private unmount(): void {
    if (!this.container) return

    // Remove the container
    this.container.remove()
    this.container = null
  }

  /** Check if currently authenticated */
  get authenticated(): boolean {
    return this.isAuthenticated
  }
}

/**
 * Mount user management button in the header (if admin).
 */
function mountUserManagementButton(ctx: Context): void {
  // Wait for the header to be available
  const observer = new MutationObserver(() => {
    const header = document.querySelector('[data-dsh-header], .header, header')
    if (!header || document.querySelector(`[${PLUGIN_ID}-users-button]`)) return

    const button = document.createElement('button')
    button.setAttribute(`${PLUGIN_ID}-users-button`, '')
    button.textContent = '👥 Users'
    button.style.cssText = `
      padding: 6px 12px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
    `

    button.addEventListener('click', async () => {
      const { createElement } = await import('react')
      const { createRoot } = await import('react-dom/client')
      const { UserManagement } = await import('./UserManagement.tsx')

      const container = document.createElement('div')
      document.body.appendChild(container)

      const root = createRoot(container)
      root.render(
        createElement(UserManagement, {
          onClose: () => {
            root.unmount()
            container.remove()
          },
        })
      )
    })

    // Add to header
    if (header instanceof HTMLElement) {
      const rightSection = header.querySelector('[data-header-right], .header-right')
      if (rightSection) {
        rightSection.appendChild(button)
      } else {
        header.appendChild(button)
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Plugin client-side entry point.
 */
export function apply(ctx: Context): void {
  console.log('[dsh-auth] Client plugin loading...')

  const guard = new AuthGuard(ctx)

  // Start auth guard
  guard.start().catch(err => {
    console.error('[dsh-auth] Failed to start auth guard:', err)
  })

  // Mount user management button if admin
  authApi.getStatus().then(status => {
    if (status.authenticated && status.user?.role === 'admin') {
      mountUserManagementButton(ctx)
    }
  })

  // Cleanup on dispose
  ctx.effect(() => () => {
    guard.stop()
  }, 'dsh-auth: client')
}
