import { describe, expect, it } from 'vitest'
import {
  LOCAL_SMOKE_API_REFUSAL_MESSAGE,
  assertLocalSmokeApiBase,
  isLocalSmokeApiBase,
  resolveSmokeApiBase,
  shouldAttemptFixtureCleanup,
} from '../scripts/smokeActivationVerifyLocalHelpers.ts'

describe('isLocalSmokeApiBase', () => {
  it('accepts localhost', () => {
    expect(isLocalSmokeApiBase('http://localhost:4200')).toBe(true)
    expect(isLocalSmokeApiBase('http://localhost')).toBe(true)
  })

  it('accepts 127.0.0.1', () => {
    expect(isLocalSmokeApiBase('http://127.0.0.1:4200')).toBe(true)
  })

  it('accepts ::1', () => {
    expect(isLocalSmokeApiBase('http://[::1]:4200')).toBe(true)
  })

  it('rejects remote hosts', () => {
    expect(isLocalSmokeApiBase('https://signmastercards.co.uk')).toBe(false)
    expect(isLocalSmokeApiBase('https://signmaster-web-app.vercel.app')).toBe(false)
    expect(isLocalSmokeApiBase('https://abcdef.supabase.co')).toBe(false)
    expect(isLocalSmokeApiBase('http://192.168.1.10:4200')).toBe(false)
    expect(isLocalSmokeApiBase('not-a-url')).toBe(false)
  })
})

describe('assertLocalSmokeApiBase', () => {
  it('throws a clear local-development error for remote bases', () => {
    expect(() => assertLocalSmokeApiBase('https://signmastercards.co.uk')).toThrow(
      LOCAL_SMOKE_API_REFUSAL_MESSAGE,
    )
  })
})

describe('resolveSmokeApiBase', () => {
  it('defaults to localhost and normalizes trailing slashes', () => {
    expect(resolveSmokeApiBase()).toBe('http://localhost:4200')
    expect(resolveSmokeApiBase('http://127.0.0.1:4200/')).toBe('http://127.0.0.1:4200')
  })
})

describe('shouldAttemptFixtureCleanup', () => {
  it('requires cleanup when only the order row was created', () => {
    expect(
      shouldAttemptFixtureCleanup({ orderCreated: true, itemCreated: false }),
    ).toBe(true)
  })

  it('does not require cleanup when no fixture rows were created', () => {
    expect(
      shouldAttemptFixtureCleanup({ orderCreated: false, itemCreated: false }),
    ).toBe(false)
  })
})
