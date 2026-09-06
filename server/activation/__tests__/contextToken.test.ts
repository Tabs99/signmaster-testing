import { describe, expect, it } from 'vitest'
import {
  generateActivationContextToken,
  hashActivationContextToken,
  isValidActivationContextTokenFormat,
} from '../contextToken.ts'

describe('activation context token', () => {
  it('generates high-entropy base64url tokens', () => {
    const tokenA = generateActivationContextToken()
    const tokenB = generateActivationContextToken()

    expect(tokenA).not.toBe(tokenB)
    expect(tokenA.length).toBeGreaterThanOrEqual(32)
    expect(isValidActivationContextTokenFormat(tokenA)).toBe(true)
  })

  it('hashes tokens deterministically without storing raw values', () => {
    const token = 'test-token-value-123456789012345678901234567890'
    const hashA = hashActivationContextToken(token)
    const hashB = hashActivationContextToken(token)

    expect(hashA).toBe(hashB)
    expect(hashA).toMatch(/^[a-f0-9]{64}$/)
    expect(hashA).not.toContain(token)
  })

  it('rejects malformed token formats', () => {
    expect(isValidActivationContextTokenFormat('')).toBe(false)
    expect(isValidActivationContextTokenFormat('short')).toBe(false)
    expect(isValidActivationContextTokenFormat('bad token!')).toBe(false)
  })
})
