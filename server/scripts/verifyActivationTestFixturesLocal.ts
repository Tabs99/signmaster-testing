import { resolveSmokeApiBase } from './smokeActivationVerifyLocalHelpers.ts'
import { getActivationTestFixtureExpectations } from './activationTestFixturesLocalHelpers.ts'
import {
  assertLocalActivationFixtureEnvironment,
  verifyReservedFixtureOrdersPresent,
} from './activationTestFixturesLocalDb.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function verifyFixtureViaHttp(
  apiBase: string,
  orderId: string,
  expectedStatus: string,
): Promise<void> {
  const response = await fetch(`${apiBase}/api/activation/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })

  const body = (await response.json()) as { status?: string }

  console.log(`${orderId} → ${response.status} ${JSON.stringify(body)}`)

  if (response.status !== 200 || body.status !== expectedStatus) {
    throw new Error(
      `Expected 200 ${expectedStatus} for ${orderId}, got ${response.status} ${JSON.stringify(body)}`,
    )
  }
}

async function main(): Promise<void> {
  assertLocalActivationFixtureEnvironment()
  await verifyReservedFixtureOrdersPresent()

  const apiBase = resolveSmokeApiBase(process.env.SMOKE_API_BASE)

  for (const fixture of getActivationTestFixtureExpectations()) {
    await verifyFixtureViaHttp(apiBase, fixture.orderId, fixture.expectedStatus)
  }

  console.log('Activation test fixture HTTP verification passed')
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})
