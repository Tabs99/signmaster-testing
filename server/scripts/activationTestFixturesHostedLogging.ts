import { ACTIVATION_TEST_RESET_ORDER_IDS } from './activationTestFixturesLocalHelpers.ts'

export type HostedFixtureOperation = 'seed' | 'clean' | 'verify'

/**
 * Logs safe metadata immediately before a hosted fixture script mutates data
 * (or before read-only verify). Never log secrets or credential values.
 */
export function logHostedFixtureOperationIntent(options: {
  operation: HostedFixtureOperation
  projectRef: string
  targetAsin: string
}): void {
  const { operation, projectRef, targetAsin } = options
  const reservedOrderIdCount = ACTIVATION_TEST_RESET_ORDER_IDS.length
  const mutates = operation === 'seed' || operation === 'clean'

  console.log('--- SignMaster hosted activation fixtures ---')
  console.log(`Operation: ${operation}${mutates ? ' (will mutate database)' : ' (read-only)'}`)
  console.log(`Supabase project ref: ${projectRef}`)
  console.log(`TARGET_ASIN: ${targetAsin}`)
  console.log(`Reserved fixture order IDs: ${reservedOrderIdCount}`)
  console.log('---')
}
