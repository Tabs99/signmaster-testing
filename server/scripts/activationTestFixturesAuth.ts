import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
  ACTIVATION_TEST_FIXTURE_HOSTED_AUTH_EMAIL,
} from './activationTestFixturesLocalHelpers.ts'
import { parseHostedFixtureClaimOwnerUserId } from './activationTestFixturesHostedGuards.ts'

export async function getOrCreateActivationFixtureAuthUserId(
  client: SupabaseClient,
  email: string,
  fixtureKind: 'activation-test-local' | 'activation-test-hosted',
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()

  const listResult = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })

  if (listResult.error) {
    throw new Error(
      `Failed to list fixture auth users: ${listResult.error.message}`,
    )
  }

  const existingUser = listResult.data.users.find(
    (user) => user.email?.toLowerCase() === normalizedEmail,
  )

  if (existingUser?.id) {
    return existingUser.id
  }

  const createResult = await client.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: {
      signmaster_fixture: fixtureKind,
    },
  })

  if (createResult.error || !createResult.data.user?.id) {
    throw new Error(
      `Failed to create fixture auth user: ${createResult.error?.message ?? 'missing user id'}`,
    )
  }

  return createResult.data.user.id
}

export async function resolveLocalFixtureClaimOwnerUserId(
  client: SupabaseClient,
): Promise<string> {
  return getOrCreateActivationFixtureAuthUserId(
    client,
    ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
    'activation-test-local',
  )
}

export async function resolveHostedFixtureClaimOwnerUserId(
  client: SupabaseClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const explicit = parseHostedFixtureClaimOwnerUserId(env)
  if (explicit) {
    return explicit
  }

  return getOrCreateActivationFixtureAuthUserId(
    client,
    ACTIVATION_TEST_FIXTURE_HOSTED_AUTH_EMAIL,
    'activation-test-hosted',
  )
}
