import { getActivationTargetAsin } from '../activation/config.ts'
import {
  getSupabaseConfig,
  isLocalSupabaseUrl,
  type SupabaseConfig,
} from '../supabase/config.ts'

/** Must be exactly `1` to run hosted activation fixture seed/clean scripts. */
export const HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV =
  'SIGNMASTER_ALLOW_HOSTED_ACTIVATION_FIXTURES'

/**
 * Must equal the Supabase project ref parsed from `SUPABASE_URL` (hostname
 * segment before `.supabase.co`).
 */
export const HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV =
  'SIGNMASTER_CONFIRM_HOSTED_ACTIVATION_FIXTURES'

/**
 * Optional explicit UUID for the ALREADY_CLAIMED fixture entitlement owner.
 * When unset, seed creates/reuses a dedicated fixture auth user (see helpers).
 */
export const HOSTED_ACTIVATION_FIXTURE_CLAIM_OWNER_ENV =
  'SIGNMASTER_ACTIVATION_FIXTURE_CLAIM_OWNER_USER_ID'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractSupabaseProjectRef(supabaseUrl: string): string {
  let hostname: string
  try {
    hostname = new URL(supabaseUrl).hostname.toLowerCase()
  } catch {
    throw new Error('Invalid SUPABASE_URL')
  }

  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)
  if (!match?.[1]) {
    throw new Error(
      'Hosted activation fixture scripts require a hosted *.supabase.co SUPABASE_URL',
    )
  }

  return match[1]
}

export function assertHostedActivationFixtureEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): {
  supabaseConfig: SupabaseConfig
  supabaseUrl: string
  targetAsin: string
  projectRef: string
} {
  if (env[HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV]?.trim() !== '1') {
    throw new Error(
      `Refusing hosted activation fixture operation: set ${HOSTED_ACTIVATION_FIXTURES_ALLOW_ENV}=1 explicitly`,
    )
  }

  const supabaseConfig = getSupabaseConfig(env)
  const supabaseUrl = supabaseConfig.url

  if (isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      'Refusing hosted activation fixture operation against local Supabase (127.0.0.1 / localhost)',
    )
  }

  const projectRef = extractSupabaseProjectRef(supabaseUrl)
  const confirm = env[HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV]?.trim()

  if (confirm !== projectRef) {
    throw new Error(
      `Refusing hosted activation fixture operation: set ${HOSTED_ACTIVATION_FIXTURES_CONFIRM_ENV}=${projectRef} to confirm the target Supabase project`,
    )
  }

  return {
    supabaseConfig,
    supabaseUrl,
    targetAsin: getActivationTargetAsin(env),
    projectRef,
  }
}

export function parseHostedFixtureClaimOwnerUserId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env[HOSTED_ACTIVATION_FIXTURE_CLAIM_OWNER_ENV]?.trim()
  if (!raw) {
    return null
  }

  if (!UUID_RE.test(raw)) {
    throw new Error(
      `${HOSTED_ACTIVATION_FIXTURE_CLAIM_OWNER_ENV} must be a UUID when set`,
    )
  }

  return raw
}
