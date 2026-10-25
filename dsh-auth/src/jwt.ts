/**
 * Simple JWT implementation using Node.js built-in crypto.
 * Supports HS256 signing only (sufficient for our use case).
 */

import { createHmac, randomUUID } from 'node:crypto'

/** JWT header */
interface JwtHeader {
  alg: 'HS256'
  typ: 'JWT'
}

/** JWT payload */
export interface JwtPayload {
  userId: string
  username: string
  role: string
  iat?: number
  exp?: number
}

/** Base64url encode */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/** Base64url decode */
function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64').toString('utf-8')
}

/** JWT secret (in production, should be configurable) */
const JWT_SECRET = process.env.DSH_AUTH_JWT_SECRET || 'dsh-auth-secret-key-change-in-production'

/**
 * Sign a JWT token.
 */
export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInHours = 24): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' }
  
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + (expiresInHours * 60 * 60),
  }

  const headerEncoded = base64UrlEncode(JSON.stringify(header))
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload))
  
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, or null if invalid/expired.
 */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerEncoded, payloadEncoded, signature] = parts

    // Verify signature
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

    if (signature !== expectedSignature) return null

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as JwtPayload

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
