import { describe, expect, it } from 'vitest'
import {
  assertLocalSupabaseUrl,
  isLocalSupabaseUrl,
  LOCAL_TASK3_REFUSAL_MESSAGE,
} from '../config.ts'

describe('supabase config', () => {
  it('accepts localhost Supabase URLs for Task 3 local sync', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true)

    expect(() =>
      assertLocalSupabaseUrl('http://127.0.0.1:54321'),
    ).not.toThrow()
    expect(() =>
      assertLocalSupabaseUrl('http://localhost:54321'),
    ).not.toThrow()
  })

  it('rejects hosted Supabase URLs for Task 3 local sync', () => {
    expect(isLocalSupabaseUrl('https://example.supabase.co')).toBe(false)

    expect(() => assertLocalSupabaseUrl('https://example.supabase.co')).toThrow(
      LOCAL_TASK3_REFUSAL_MESSAGE,
    )
  })
})
