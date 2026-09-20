import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import { resolveHostedFixtureClaimOwnerUserId } from './activationTestFixturesAuth.ts'
import { seedActivationTestFixtures } from './activationTestFixturesDb.ts'
import { assertHostedActivationFixtureEnvironment } from './activationTestFixturesHostedGuards.ts'
import { logHostedFixtureOperationIntent } from './activationTestFixturesHostedLogging.ts'
import { formatActivationTestCheatSheet } from './activationTestFixturesLocalHelpers.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  const { targetAsin, projectRef } = assertHostedActivationFixtureEnvironment()
  logHostedFixtureOperationIntent({ operation: 'seed', projectRef, targetAsin })

  const client = createServiceRoleClientFromEnv()

  const claimOwnerUserId = await resolveHostedFixtureClaimOwnerUserId(client)
  const { nonFixtureOrderCount } = await seedActivationTestFixtures(
    client,
    targetAsin,
    claimOwnerUserId,
  )

  const lines = formatActivationTestCheatSheet(targetAsin)
  lines.push('')
  lines.push(`Supabase project: ${projectRef}`)
  lines.push('Database: HOSTED (synthetic fixtures only)')
  lines.push('')
  lines.push(
    `Non-fixture amazon_orders preserved: ${nonFixtureOrderCount} row(s) unchanged`,
  )

  console.log(lines.join('\n'))
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})
