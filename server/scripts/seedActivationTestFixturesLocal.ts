import {
  formatActivationTestCheatSheet,
} from './activationTestFixturesLocalHelpers.ts'
import { seedActivationTestFixturesLocal } from './activationTestFixturesLocalDb.ts'

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'unknown error'
}

async function main(): Promise<void> {
  const { targetAsin, nonFixtureOrderCount } =
    await seedActivationTestFixturesLocal()

  console.log(formatActivationTestCheatSheet(targetAsin).join('\n'))
  console.log('')
  console.log(
    `Non-fixture amazon_orders preserved: ${nonFixtureOrderCount} row(s) unchanged`,
  )
}

main().catch((error: unknown) => {
  console.error(formatError(error))
  process.exitCode = 1
})
