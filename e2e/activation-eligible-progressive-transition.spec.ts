import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'
import { expectProgressiveAccountSetupOnActivate } from './helpers/progressiveActivation'

const FIXTURE_ORDER_ID = '205-1234567-1234567'

async function mockGatedEligibleFlow(page: Page) {
  let verifyCalls = 0
  let releaseVerify: (() => void) | undefined
  const verifyGate = new Promise<void>((resolve) => {
    releaseVerify = resolve
  })

  let releaseContext: (() => void) | undefined
  const contextGate = new Promise<void>((resolve) => {
    releaseContext = resolve
  })

  await page.route('**/api/activation/verify', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    verifyCalls += 1
    await verifyGate
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ELIGIBLE' }),
    })
  })

  await page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'POST') {
      await contextGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'CREATED' }),
      })
      return
    }

    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'NONE' }),
      })
      return
    }

    await route.continue()
  })

  return {
    getVerifyCalls: () => verifyCalls,
    releaseVerify: () => releaseVerify?.(),
    releaseContext: () => releaseContext?.(),
  }
}

test.describe('Eligible activation progressive transition', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('progresses through checking and preparing without showing the eligible result plate', async ({
    page,
  }) => {
    const gates = await mockGatedEligibleFlow(page)
    await page.goto('/activate')
    await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)

    await expect(page.getByRole('button', { name: 'Checking your order…' })).toBeVisible()
    await expect(page.getByTestId('activation-entry-form')).toBeVisible()
    await expect(page.getByTestId('activation-result-card')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Your purchase is verified' }),
    ).toHaveCount(0)

    gates.releaseVerify()
    await expect.poll(() => gates.getVerifyCalls()).toBe(1)

    await expect(page.getByRole('button', { name: 'Preparing account setup…' })).toBeVisible()
    await expect(page.getByTestId('activation-entry-form')).toHaveAttribute(
      'data-eligible-preparing',
      'true',
    )
    await expect(page.getByTestId('activation-result-card')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Your purchase is verified' }),
    ).toHaveCount(0)

    gates.releaseContext()
    await expectProgressiveAccountSetupOnActivate(page)
    await expect(page).toHaveURL(/\/activate$/)
  })

  test('NOT_FOUND still shows the result plate after eligible-path regression guard', async ({
    page,
  }) => {
    await page.route('**/api/activation/verify', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'NOT_FOUND' }),
      })
    })
    await page.goto('/activate')
    await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)

    await expect(
      page.getByRole('heading', { name: "We can't verify that order" }),
    ).toBeVisible()
    await expect(page.getByTestId('activation-result-card')).toBeVisible()
  })
})
