# dsh-auth — DeepSeek Harness 登录鉴权插件

[English](README.md) | 中文

DeepSeek Harness Web GUI 的热插拔登录鉴权插件，提供用户名/密码登录、会话管理和 API 保护。

## 功能特性

- 🔐 **用户名/密码认证** - 使用 bcrypt 安全哈希的传统登录方式
- 👥 **用户管理** - 管理员界面管理用户
- 🔑 **JWT 会话** - 基于令牌的无状态认证
- 🛡️ **API 保护** - 所有 API 端点都需要认证
- 🚀 **初始设置向导** - 首次运行时创建管理员账户
- 🔒 **基于角色的访问控制** - 管理员和用户角色，不同权限

## 快速开始

### 安装

```bash
dsh plugin --profile web add link:/path/to/dsh-auth
```

或从 npm 安装（如果已发布）：

```bash
dsh plugin --profile web add dsh-auth
```

### 首次设置

1. 启动 DSH Web GUI
2. 访问 `http://localhost:3080/setup`（或登录页面会自动重定向）
3. 创建管理员账户
4. 使用凭证登录

### 使用方法

插件会自动：

1. **保护 Web GUI** - 为未认证用户显示登录页面
2. **保护 API 端点** - 为未认证的 API 请求返回 401
3. **提供用户管理** - 管理员可通过标题栏的"Users"按钮管理用户

## API 端点

### 公开端点（无需认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/dsh-auth/login` | 用户名/密码登录 |
| POST | `/api/dsh-auth/setup` | 创建初始管理员账户 |
| GET | `/api/dsh-auth/status` | 检查认证状态 |

### 受保护端点（需要认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/dsh-auth/logout` | 注销当前会话 |
| GET | `/api/dsh-auth/me` | 获取当前用户信息 |

### 管理员端点（需要管理员角色）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/dsh-auth/users` | 列出所有用户 |
| POST | `/api/dsh-auth/users` | 创建新用户 |
| PUT | `/api/dsh-auth/users/:id` | 更新用户 |
| DELETE | `/api/dsh-auth/users/:id` | 删除用户 |
| POST | `/api/dsh-auth/users/:id/reset-password` | 重置用户密码 |

## 配置

在 `cordis.patch.yml` 中：

```yaml
- insert:
    - id: auth
      name: 'dsh-auth'
      config:
        enabled: true                    # 启用/禁用认证
        enableSetup: true                # 显示设置向导
        publicPaths:                     # 不需要认证的路径
          - '/api/dsh-auth/login'
          - '/api/dsh-auth/setup'
          - '/api/dsh-auth/status'
          - '/favicon.ico'
          - '/assets/*'
```

## 数据存储

- **用户凭证**: `~/.dsh/dsh-auth.json`
- **文件权限**: 0600（仅所有者可读写）
- **密码哈希**: bcrypt 带盐值
- **会话**: JWT 令牌，24 小时过期

## 安全说明

- 密码使用 bcrypt 哈希（行业标准）
- JWT 令牌 24 小时后过期
- 默认保护所有 `/api/*` 路由
- 仅限 loopback 访问（无法从局域网访问）
- 每小时自动清理过期会话

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监视模式
npm run watch

# 类型检查
npm run typecheck
```

## 许可证

MIT
