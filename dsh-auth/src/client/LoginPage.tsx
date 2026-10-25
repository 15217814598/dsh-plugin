/**
 * Login page component — shown when user is not authenticated.
 */

import React, { useState, useEffect } from 'react'
import { authApi, type AuthStatusResponse } from './api.ts'

/** Login page props */
interface LoginPageProps {
  onLogin: () => void
}

/**
 * Login page with support for initial setup and regular login.
 */
export function LoginPage({ onLogin }: LoginPageProps) {
  const [status, setStatus] = useState<AuthStatusResponse | null>(null)
  const [mode, setMode] = useState<'login' | 'setup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  // Check auth status on mount
  useEffect(() => {
    authApi.getStatus().then(s => {
      setStatus(s)
      if (s.authenticated) {
        onLogin()
        return
      }
      if (!s.hasAdmin) {
        setMode('setup')
      }
    }).catch(err => {
      setError('Failed to check auth status')
      console.error(err)
    }).finally(() => {
      setChecking(false)
    })
  }, [onLogin])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'setup') {
        await authApi.setup(username, password, displayName || undefined)
      } else {
        await authApi.login(username, password)
      }
      onLogin()
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loading}>Checking authentication...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>🔐</div>
          <h1 style={styles.title}>DeepSeek Harness</h1>
          <p style={styles.subtitle}>
            {mode === 'setup' ? 'Initial Setup' : 'Login to continue'}
          </p>
        </div>

        {mode === 'setup' && (
          <div style={styles.notice}>
            <strong>Welcome!</strong> Create your admin account to get started.
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'setup' && (
            <div style={styles.field}>
              <label style={styles.label}>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Administrator"
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'setup' ? 'Min 6 characters' : 'Enter password'}
              required
              minLength={mode === 'setup' ? 6 : undefined}
              style={styles.input}
            />
          </div>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
          >
            {loading
              ? 'Processing...'
              : mode === 'setup'
                ? 'Create Admin Account'
                : 'Login'}
          </button>
        </form>

        {mode === 'login' && (
          <div style={styles.footer}>
            <button
              onClick={() => setMode('setup')}
              style={styles.linkButton}
            >
              First time? Create admin account
            </button>
          </div>
        )}

        {mode === 'setup' && status?.hasAdmin && (
          <div style={styles.footer}>
            <button
              onClick={() => setMode('login')}
              style={styles.linkButton}
            >
              Already have an account? Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
    color: '#1a1a2e',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#666',
  },
  notice: {
    background: '#e8f5e9',
    color: '#2e7d32',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#333',
  },
  input: {
    padding: '12px 16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    background: '#ffebee',
    color: '#c62828',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
  },
  button: {
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    cursor: 'pointer',
    fontSize: '14px',
    textDecoration: 'underline',
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
}
