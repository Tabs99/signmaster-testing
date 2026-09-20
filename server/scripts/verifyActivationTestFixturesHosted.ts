import { createServiceRoleClientFromEnv } from '../supabase/client.ts'
import {
  verifyActivationTestFixturesViaService,
  verifyReservedFixtureOrdersPresent,
} from './activationTestFixturesDb.ts'
import { assertHostedActivationFixtureEnvironment } from './activationTestFixturesHostedGuards.ts'
import { logHostedFixtureOperationIntent } from './activationTestFixturesHostedLogging.ts'
import { getActivationTestFixtureExpectations } from './activationTestFixturesLocalHelpers.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  const { targetAsin, projectRef } = assertHostedActivationFixtureEnvironment()
  logHostedFixtureOperationIntent({ operation: 'verify', projectRef, targetAsin })

  const client = createServiceRoleClientFromEnv()

  await verifyReservedFixtureOrdersPresent(client)
  await verifyActivationTestFixturesViaService(targetAsin, client)

  console.log('Hosted activation test fixture verification passed')
  console.log(`Supabase project: ${projectRef}`)
  console.log(`TARGET_ASIN: ${targetAsin}`)
  console.log('')

  for (const fixture of getActivationTestFixtureExpectations()) {
    const note = fixture.cheatSheetNote ? ` (${fixture.cheatSheetNote})` : ''
    console.log(`${fixture.orderId} → ${fixture.expectedStatus}${note}`)
  }
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})
