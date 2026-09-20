import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActivationTargetAsin } from '../activation/config.ts'
import {
  assertLocalSupabaseUrl,
  getSupabaseConfig,
} from '../supabase/config.ts'
import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import { resolveLocalFixtureClaimOwnerUserId } from './activationTestFixturesAuth.ts'
import {
  buildFixtureCleanupSqlStatements,
} from './activationTestFixturesLocalHelpers.ts'
import {
  seedActivationTestFixtures,
  verifyActivationTestFixturesViaService as verifyFixturesViaServiceInDb,
  verifyReservedFixtureOrdersPresent as verifyFixtureOrdersPresentInDb,
} from './activationTestFixturesDb.ts'

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export function assertLocalActivationFixtureEnvironment(): {
  supabaseUrl: string
  targetAsin: string
} {
  const supabaseConfig = getSupabaseConfig()
  assertLocalSupabaseUrl(supabaseConfig.url)

  return {
    supabaseUrl: supabaseConfig.url,
    targetAsin: getActivationTargetAsin(),
  }
}

export function runLocalSupabaseSql(sql: string): void {
  execSync(`npx supabase db query --local ${JSON.stringify(sql)}`, {
    stdio: 'pipe',
    cwd: PROJECT_ROOT,
  })
}

export { countNonFixtureAmazonOrders } from './activationTestFixturesDb.ts'
export { getOrCreateActivationFixtureAuthUserId } from './activationTestFixturesAuth.ts'

export function cleanupActivationTestFixturesLocal(): void {
  for (const sql of buildFixtureCleanupSqlStatements()) {
    runLocalSupabaseSql(sql)
  }
}

export async function cleanupActivationTestFixturesViaClient(
  client: SupabaseClient,
): Promise<void> {
  await deleteActivationTestFixtures(client)
}

export async function seedActivationTestFixturesLocal(): Promise<{
  targetAsin: string
  nonFixtureOrderCount: number
}> {
  const { targetAsin } = assertLocalActivationFixtureEnvironment()
  const client = createServiceRoleClientFromEnv()

  const claimOwnerUserId = await resolveLocalFixtureClaimOwnerUserId(client)
  const { nonFixtureOrderCount } = await seedActivationTestFixtures(
    client,
    targetAsin,
    claimOwnerUserId,
  )

  return {
    targetAsin,
    nonFixtureOrderCount,
  }
}

export async function verifyActivationTestFixturesViaService(
  targetAsin: string,
): Promise<void> {
  const client = createServiceRoleClientFromEnv()
  await verifyFixturesViaServiceInDb(targetAsin, client)
}

export async function verifyReservedFixtureOrdersPresent(): Promise<void> {
  const client = createServiceRoleClientFromEnv()
  await verifyFixtureOrdersPresentInDb(client)
}
