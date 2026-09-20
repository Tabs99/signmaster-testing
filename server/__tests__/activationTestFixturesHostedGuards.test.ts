import { describe, expect, it } from 'vitest'
import {
  assertHostedActivationFixtureEnvironment,
  extractSupabaseProjectRef,
  HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV,
  HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV,
  parseHostedFixtureClaimOwnerUserId,
} from '../scripts/activationTestFixturesHostedGuards.ts'

const HOSTED_URL = 'https://abcdefghijklmnop.supabase.co'
const PROJECT_REF = 'abcdefghijklmnop'

function hostedEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: HOSTED_URL,
    SUPABASE_SECRET_KEY: 'test-secret-key',
    TARGET_ASIN: 'B0H8ZRL6DK',
    [HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV]: '1',
    [HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV]: PROJECT_REF,
    ...overrides,
  }
}

describe('hosted activation fixture guards', () => {
  it('extracts the Supabase project ref from a hosted URL', () => {
    expect(extractSupabaseProjectRef(HOSTED_URL)).toBe(PROJECT_REF)
  })

  it('requires explicit allow and project confirmation', () => {
    expect(() =>
      assertHostedActivationFixtureEnvironment(
        hostedEnv({ [HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV]: undefined }),
      ),
    ).toThrow(/SIGNMASTER_ALLOW_HOSTED_ACTIVATION_FIXTURES=1/)

    expect(() =>
      assertHostedActivationFixtureEnvironment(
        hostedEnv({ [HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV]: 'wrong-ref' }),
      ),
    ).toThrow(/SIGNMASTER_CONFIRM_HOSTED_ACTIVATION_FIXTURES=abcdefghijklmnop/)
  })

  it('refuses localhost Supabase URLs', () => {
    expect(() =>
      assertHostedActivationFixtureEnvironment(
        hostedEnv({
          SUPABASE_URL: 'http://127.0.0.1:54321',
          [HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV]: '127.0.0.1',
        }),
      ),
    ).toThrow(/local Supabase/)
  })

  it('passes when guards and TARGET_ASIN are set for a hosted project', () => {
    const result = assertHostedActivationFixtureEnvironment(hostedEnv())
    expect(result.projectRef).toBe(PROJECT_REF)
    expect(result.targetAsin).toBe('B0H8ZRL6DK')
  })

  it('accepts an optional explicit claim-owner UUID', () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    expect(
      parseHostedFixtureClaimOwnerUserId(
        hostedEnv({
          SIGNMASTER_ACTIVATION_FIXTURE_CLAIM_OWNER_USER_ID: uuid,
        }),
      ),
    ).toBe(uuid)
  })

  it('rejects malformed claim-owner UUIDs', () => {
    expect(() =>
      parseHostedFixtureClaimOwnerUserId(
        hostedEnv({
          SIGNMASTER_ACTIVATION_FIXTURE_CLAIM_OWNER_USER_ID: 'not-a-uuid',
        }),
      ),
    ).toThrow(/must be a UUID/)
  })

  it('requires SUPABASE_SECRET_KEY', () => {
    expect(() =>
      assertHostedActivationFixtureEnvironment(
        hostedEnv({ SUPABASE_SECRET_KEY: undefined }),
      ),
    ).toThrow(/SUPABASE_SECRET_KEY/)
  })

  it('requires TARGET_ASIN', () => {
    expect(() =>
      assertHostedActivationFixtureEnvironment(hostedEnv({ TARGET_ASIN: undefined })),
    ).toThrow(/TARGET_ASIN/)
  })
})
