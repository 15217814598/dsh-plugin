/**
 * Password hashing using Node.js built-in crypto (no external dependencies).
 * Uses PBKDF2 with SHA-512 for secure password hashing.
 */

import { randomBytes, pbkdf2Sync } from 'node:crypto'

const ITERATIONS = 100000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

/**
 * Hash a password with a random salt.
 * Format: salt:hash (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString('hex')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  
  const verifyHash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return hash === verifyHash
}
