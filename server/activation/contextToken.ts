import { createHash, randomBytes } from 'node:crypto'

export const ACTIVATION_CONTEXT_TOKEN_BYTES = 32

export function generateActivationContextToken(): string {
  return randomBytes(ACTIVATION_CONTEXT_TOKEN_BYTES).toString('base64url')
}

export function hashActivationContextToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isValidActivationContextTokenFormat(token: string): boolean {
  if (!token || token.length < 32 || token.length > 128) {
    return false
  }

  return /^[A-Za-z0-9_-]+$/.test(token)
}
