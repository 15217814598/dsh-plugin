/**
 * User management panel — admin-only interface for managing users.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { authApi, type UserInfo } from './api.ts'

/** User management props */
interface UserManagementProps {
  onClose: () => void
}

/**
 * User management panel component.
 */
export function UserManagement({ onClose }: UserManagementProps) {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null)

  // Form state
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formDisplayName, setFormDisplayName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user')

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await authApi.listUsers()
      setUsers(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const resetForm = () => {
    setFormUsername('')
    setFormPassword('')
    setFormDisplayName('')
    setFormEmail('')
    setFormRole('user')
    setShowCreateForm(false)
    setEditingUser(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await authApi.createUser(formUsername, formPassword, {
        displayName: formDisplayName || undefined,
        email: formEmail || undefined,
        role: formRole,
      })
      resetForm()
      loadUsers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    try {
      await authApi.updateUser(editingUser.id, {
        displayName: formDisplayName || undefined,
        email: formEmail || undefined,
        role: formRole,
      })
      resetForm()
      loadUsers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = async (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await authApi.deleteUser(userId)
      loadUsers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleResetPassword = async (userId: string, username: string) => {
    const password = prompt(`Enter new password for "${username}":`)
    if (!password || password.length < 6) {
      if (password) alert('Password must be at least 6 characters')
      return
    }
    try {
      await authApi.resetPassword(userId, password)
      alert('Password reset successfully')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleToggleEnabled = async (user: UserInfo) => {
    try {
      await authApi.updateUser(user.id, { enabled: !user.enabled })
      loadUsers()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const startEdit = (user: UserInfo) => {
    setEditingUser(user)
    setFormUsername(user.username)
    setFormDisplayName(user.displayName ?? '')
    setFormEmail(user.email ?? '')
    setFormRole(user.role)
    setShowCreateForm(false)
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={styles.title}>User Management</h2>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        {error && (
          <div style={styles.error}>
            {error}
            <button onClick={() => setError(null)} style={styles.dismissError}>×</button>
          </div>
        )}

        <div style={styles.toolbar}>
          <button
            onClick={() => { resetForm(); setShowCreateForm(true) }}
            style={styles.primaryButton}
          >
            + Add User
          </button>
          <button onClick={loadUsers} style={styles.secondaryButton}>
            Refresh
          </button>
        </div>

        {/* Create/Edit Form */}
        {(showCreateForm || editingUser) && (
          <div style={styles.formCard}>
            <h3 style={styles.formTitle}>
              {editingUser ? `Edit User: ${editingUser.username}` : 'Create New User'}
            </h3>
            <form onSubmit={editingUser ? handleUpdate : handleCreate} style={styles.form}>
              {!editingUser && (
                <>
                  <div style={styles.field}>
                    <label style={styles.label}>Username *</label>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={e => setFormUsername(e.target.value)}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Password *</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Min 6 characters"
                      style={styles.input}
                    />
                  </div>
                </>
              )}
              <div style={styles.field}>
                <label style={styles.label}>Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={e => setFormDisplayName(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Role</label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value as 'admin' | 'user')}
                  style={styles.input}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={styles.formActions}>
                <button type="submit" style={styles.primaryButton}>
                  {editingUser ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={resetForm} style={styles.secondaryButton}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users List */}
        {loading ? (
          <div style={styles.loading}>Loading users...</div>
        ) : (
          <div style={styles.userList}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Username</th>
                  <th style={styles.th}>Display Name</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Last Login</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{user.username}</strong>
                      {user.email && <div style={styles.email}>{user.email}</div>}
                    </td>
                    <td style={styles.td}>{user.displayName ?? '-'}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: user.role === 'admin' ? '#e3f2fd' : '#f5f5f5',
                        color: user.role === 'admin' ? '#1565c0' : '#666',
                      }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleToggleEnabled(user)}
                        style={{
                          ...styles.statusBadge,
                          background: user.enabled ? '#e8f5e9' : '#ffebee',
                          color: user.enabled ? '#2e7d32' : '#c62828',
                        }}
                      >
                        {user.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td style={styles.td}>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : 'Never'}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button onClick={() => startEdit(user)} style={styles.actionButton}>
                          Edit
                        </button>
                        <button
                          onClick={() => handleResetPassword(user.id, user.username)}
                          style={styles.actionButton}
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.username)}
                          style={{ ...styles.actionButton, color: '#c62828' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  panel: {
    background: '#fff',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '900px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #eee',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#666',
    padding: '4px 8px',
  },
  error: {
    background: '#ffebee',
    color: '#c62828',
    padding: '12px 16px',
    margin: '16px 24px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissError: {
    background: 'none',
    border: 'none',
    color: '#c62828',
    cursor: 'pointer',
    fontSize: '18px',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    padding: '16px 24px',
  },
  primaryButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  secondaryButton: {
    padding: '10px 20px',
    background: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  formCard: {
    margin: '0 24px 16px',
    padding: '20px',
    background: '#f9f9f9',
    borderRadius: '8px',
  },
  formTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#555',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  userList: {
    padding: '0 24px 24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #eee',
    fontSize: '13px',
    fontWeight: 600,
    color: '#666',
  },
  tr: {
    borderBottom: '1px solid #f5f5f5',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
  },
  email: {
    fontSize: '12px',
    color: '#888',
    marginTop: '2px',
  },
  badge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    background: 'none',
    border: '1px solid #ddd',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#667eea',
  },
}
