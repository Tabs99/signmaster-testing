import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
  ACTIVATION_TEST_FIXTURE_HOSTED_AUTH_EMAIL,
} from './activationTestFixturesLocalHelpers.ts'
import { parseHostedFixtureClaimOwnerUserId } from './activationTestFixturesHostedGuards.ts'

/** Matches existing single-page lookup size; paginate when hosted user base grows. */
export const FIXTURE_AUTH_USER_LIST_PAGE_SIZE = 1000

/** Upper bound on admin listUsers pages scanned (avoids unbounded pagination). */
export const FIXTURE_AUTH_USER_LIST_MAX_PAGES = 100

export async function findAuthUserIdByEmailPaginated(
  client: SupabaseClient,
  normalizedEmail: string,
): Promise<string | null> {
  for (let page = 1; page <= FIXTURE_AUTH_USER_LIST_MAX_PAGES; page++) {
    const listResult = await client.auth.admin.listUsers({
      page,
      perPage: FIXTURE_AUTH_USER_LIST_PAGE_SIZE,
    })

    if (listResult.error) {
      throw new Error(
        `Failed to list fixture auth users (page ${page}): ${listResult.error.message}`,
      )
    }

    const users = listResult.data?.users ?? []
    const existingUser = users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail,
    )

    if (existingUser?.id) {
      return existingUser.id
    }

    if (users.length < FIXTURE_AUTH_USER_LIST_PAGE_SIZE) {
      return null
    }
  }

  throw new Error(
    `Fixture auth user lookup exceeded ${FIXTURE_AUTH_USER_LIST_MAX_PAGES} pages without finding ${normalizedEmail}; refusing to scan further`,
  )
}

export async function getOrCreateActivationFixtureAuthUserId(
  client: SupabaseClient,
  email: string,
  fixtureKind: 'activation-test-local' | 'activation-test-hosted',
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()

  const existingId = await findAuthUserIdByEmailPaginated(client, normalizedEmail)
  if (existingId) {
    return existingId
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
