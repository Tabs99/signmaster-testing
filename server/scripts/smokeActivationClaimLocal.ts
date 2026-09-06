import { createActivationContext } from '../services/activationContextService.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import {
  assertLocalActivationFixtureEnvironment,
  cleanupActivationTestFixturesLocal,
  getOrCreateActivationFixtureAuthUserId,
  runLocalSupabaseSql,
  seedActivationTestFixturesLocal,
} from './activationTestFixturesLocalDb.ts'
import { ACTIVATION_TEST_FIXTURE_AUTH_EMAIL } from './activationTestFixturesLocalHelpers.ts'
import { resolveSmokeApiBase } from './smokeActivationVerifyLocalHelpers.ts'

const ELIGIBLE_ORDER_ID = '777-7777777-7777777'

async function signInFixtureUser(
  email: string,
  password: string,
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim() ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL for claim smoke')
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const body = (await response.json()) as { access_token?: string; error_description?: string }

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Failed to sign in fixture user for claim smoke: ${body.error_description ?? response.status}`,
    )
  }

  return body.access_token
}

async function countEntitlementsForOrder(orderId: string): Promise<number> {
  const client = createServiceRoleClientFromEnv()
  const result = await client
    .from('app_entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('amazon_order_id', orderId)

  if (result.error) {
    throw new Error(`Failed to count entitlements: ${result.error.message}`)
  }

  return result.count ?? 0
}

async function main(): Promise<void> {
  assertLocalActivationFixtureEnvironment()
  runLocalSupabaseSql(
    `delete from public.activation_contexts where amazon_order_id in ('000-0000000-0000000', '111-1111111-1111111', '222-2222222-2222222', '333-3333333-3333333', '444-4444444-4444444', '555-5555555-5555555', '666-6666666-6666666', '777-7777777-7777777', '${ELIGIBLE_ORDER_ID}');`,
  )
  cleanupActivationTestFixturesLocal()
  await seedActivationTestFixturesLocal()

  const client = createServiceRoleClientFromEnv()
  const fixtureUserId = await getOrCreateActivationFixtureAuthUserId(client)
  await client.auth.admin.updateUserById(fixtureUserId, {
    password: 'ActivationFixture123!',
  })
  const created = await createActivationContext(ELIGIBLE_ORDER_ID, {
    supabaseClient: client,
  })

  const apiBase = resolveSmokeApiBase()
  const accessToken = await signInFixtureUser(
    ACTIVATION_TEST_FIXTURE_AUTH_EMAIL,
    'ActivationFixture123!',
  )

  const claimOnce = async () => {
    const response = await fetch(`${apiBase}/api/activation/claim`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: `sm_activation_ctx=${encodeURIComponent(created.token)}`,
      },
    })

    return {
      status: response.status,
      body: (await response.json()) as { status?: string },
    }
  }

  const firstClaim = await claimOnce()
  console.log('First claim:', firstClaim.status, firstClaim.body)

  if (firstClaim.status !== 200 || firstClaim.body.status !== 'SUCCESS') {
    throw new Error(`Expected first claim SUCCESS, got ${JSON.stringify(firstClaim)}`)
  }

  const countAfterFirst = await countEntitlementsForOrder(ELIGIBLE_ORDER_ID)
  if (countAfterFirst !== 1) {
    throw new Error(`Expected exactly one entitlement row, found ${countAfterFirst}`)
  }

  const secondClaim = await claimOnce()
  console.log('Second claim:', secondClaim.status, secondClaim.body)

  if (secondClaim.status !== 200 || secondClaim.body.status !== 'SUCCESS') {
    throw new Error(`Expected idempotent SUCCESS, got ${JSON.stringify(secondClaim)}`)
  }

  const countAfterSecond = await countEntitlementsForOrder(ELIGIBLE_ORDER_ID)
  if (countAfterSecond !== 1) {
    throw new Error(`Expected still one entitlement row, found ${countAfterSecond}`)
  }

  console.log('sameContextRetrySuccess: true')

  const otherUser = await client.auth.admin.createUser({
    email: `claim-smoke-other-${Date.now()}@example.invalid`,
    email_confirm: true,
    password: 'OtherFixture123!',
  })

  if (otherUser.error || !otherUser.data.user?.id) {
    throw new Error('Failed to create second smoke user')
  }

  const otherToken = await signInFixtureUser(
    otherUser.data.user.email!,
    'OtherFixture123!',
  )

  const conflictResponse = await fetch(`${apiBase}/api/activation/claim`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${otherToken}`,
      Cookie: `sm_activation_ctx=${encodeURIComponent(created.token)}`,
    },
  })

  const conflictBody = (await conflictResponse.json()) as { status?: string }
  console.log('Other-user claim:', conflictResponse.status, conflictBody)

  if (conflictResponse.status !== 200 || conflictBody.status !== 'ALREADY_CLAIMED') {
    throw new Error(`Expected ALREADY_CLAIMED for other user, got ${JSON.stringify(conflictBody)}`)
  }

  const revokeResult = await client
    .from('app_entitlements')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revocation_reason: 'smoke-test',
    })
    .eq('amazon_order_id', ELIGIBLE_ORDER_ID)

  if (revokeResult.error) {
    throw new Error(`Failed to revoke entitlement for smoke: ${revokeResult.error.message}`)
  }

  const revokedSameUserClaim = await claimOnce()
  console.log('Revoked same-user claim:', revokedSameUserClaim.status, revokedSameUserClaim.body)

  if (revokedSameUserClaim.status !== 200 || revokedSameUserClaim.body.status !== 'NOT_ELIGIBLE') {
    throw new Error(
      `Expected NOT_ELIGIBLE for revoked same-user claim, got ${JSON.stringify(revokedSameUserClaim)}`,
    )
  }

  const revokedOtherUserResponse = await fetch(`${apiBase}/api/activation/claim`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${otherToken}`,
      Cookie: `sm_activation_ctx=${encodeURIComponent(created.token)}`,
    },
  })
  const revokedOtherUserBody = (await revokedOtherUserResponse.json()) as { status?: string }
  console.log('Revoked other-user claim:', revokedOtherUserResponse.status, revokedOtherUserBody)

  if (
    revokedOtherUserResponse.status !== 200 ||
    revokedOtherUserBody.status !== 'ALREADY_CLAIMED'
  ) {
    throw new Error(
      `Expected ALREADY_CLAIMED for revoked other-user claim, got ${JSON.stringify(revokedOtherUserBody)}`,
    )
  }

  const finalEntitlement = await client
    .from('app_entitlements')
    .select('user_id, status')
    .eq('amazon_order_id', ELIGIBLE_ORDER_ID)
    .maybeSingle()

  if (
    finalEntitlement.error ||
    finalEntitlement.data?.user_id !== fixtureUserId ||
    finalEntitlement.data?.status !== 'revoked'
  ) {
    throw new Error('Entitlement row was modified unexpectedly during revoked smoke checks')
  }

  const finalCount = await countEntitlementsForOrder(ELIGIBLE_ORDER_ID)
  if (finalCount !== 1) {
    throw new Error(`Expected exactly one entitlement row after revoked checks, found ${finalCount}`)
  }

  console.log('revokedStatusSemantics: true')

  await client.from('app_entitlements').delete().eq('amazon_order_id', ELIGIBLE_ORDER_ID)
  runLocalSupabaseSql(
    `delete from public.activation_contexts where amazon_order_id = '${ELIGIBLE_ORDER_ID}';`,
  )
  cleanupActivationTestFixturesLocal()

  console.log('Activation claim local smoke passed')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
