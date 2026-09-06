import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBrowserSupabaseClient,
  getBrowserSupabaseClient,
  resetBrowserSupabaseClientForTests,
} from '../client'

describe('browser supabase client', () => {
  afterEach(() => {
    resetBrowserSupabaseClientForTests()
  })

  it('creates a client with public anon credentials only', () => {
    const client = createBrowserSupabaseClient(
      'http://127.0.0.1:54321',
      'public-anon-key',
    )

    expect(client).toBeTruthy()
    expect(client.auth).toBeTruthy()
  })

  it('returns a singleton browser client', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')

    const first = getBrowserSupabaseClient()
    const second = getBrowserSupabaseClient()

    expect(first).toBe(second)
  })
})
