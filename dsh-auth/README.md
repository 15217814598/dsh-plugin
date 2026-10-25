# dsh-auth — Login Authentication Plugin for DeepSeek Harness

[English](README.md) | [中文](README.zh.md)

A hot-pluggable authentication plugin for DeepSeek Harness Web GUI that provides username/password login, session management, and API protection.

## Features

- 🔐 **Username/Password Authentication** - Traditional login with secure bcrypt hashing
- 👥 **User Management** - Admin interface for managing users
- 🔑 **JWT Sessions** - Stateless token-based authentication
- 🛡️ **API Protection** - All API endpoints require authentication
- 🚀 **Initial Setup Wizard** - First-run admin account creation
- 🔒 **Role-based Access** - Admin and user roles with different permissions

## Quick Start

### Install

```bash
dsh plugin --profile web add link:/path/to/dsh-auth
```

Or from npm (if published):

```bash
dsh plugin --profile web add dsh-auth
```

### First-time Setup

1. Start DSH Web GUI
2. Navigate to `http://localhost:3080/setup` (or the login page will redirect you)
3. Create your admin account
4. Login with your credentials

### Usage

The plugin automatically:

1. **Protects the Web GUI** - Shows login page for unauthenticated users
2. **Protects API endpoints** - Returns 401 for unauthenticated API requests
3. **Provides user management** - Admin can manage users via the "Users" button in header

## API Endpoints

### Public Endpoints (No auth required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dsh-auth/login` | Login with username/password |
| POST | `/api/dsh-auth/setup` | Create initial admin account |
| GET | `/api/dsh-auth/status` | Check auth status |

### Protected Endpoints (Auth required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dsh-auth/logout` | Logout current session |
| GET | `/api/dsh-auth/me` | Get current user info |

### Admin Endpoints (Admin role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dsh-auth/users` | List all users |
| POST | `/api/dsh-auth/users` | Create new user |
| PUT | `/api/dsh-auth/users/:id` | Update user |
| DELETE | `/api/dsh-auth/users/:id` | Delete user |
| POST | `/api/dsh-auth/users/:id/reset-password` | Reset user password |

## Configuration

In your `cordis.patch.yml`:

```yaml
- insert:
    - id: auth
      name: 'dsh-auth'
      config:
        enabled: true                    # Enable/disable auth
        enableSetup: true                # Show setup wizard
        publicPaths:                     # Paths that don't require auth
          - '/api/dsh-auth/login'
          - '/api/dsh-auth/setup'
          - '/api/dsh-auth/status'
          - '/favicon.ico'
          - '/assets/*'
```

## Data Storage

- **User credentials**: `~/.dsh/dsh-auth.json`
- **File permissions**: 0600 (owner read/write only)
- **Password hashing**: bcrypt with salt rounds
- **Sessions**: JWT tokens with 24-hour expiration

## Security Notes

- Passwords are hashed with bcrypt (industry standard)
- JWT tokens expire after 24 hours
- All `/api/*` routes are protected by default
- Loopback-only access (cannot be accessed from LAN)
- Session cleanup runs automatically every hour

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Type check
npm run typecheck
```

## License

MIT
