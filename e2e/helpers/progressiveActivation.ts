import { expect, type Page } from '@playwright/test'

/** GET always VALID (direct `/create-account` / sign-in resume tests). */
export async function mockActivationContextAlwaysValid(page: Page) {
  await page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'POST') {
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
        body: JSON.stringify({ status: 'VALID' }),
      })
      return
    }

    await route.continue()
  })
}

/** GET returns NONE until a context POST succeeds, then VALID (matches real cookie lifecycle). */
export async function mockStatefulActivationContext(page: Page) {
  let hasContext = false

  await page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'POST') {
      hasContext = true
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
        body: JSON.stringify({ status: hasContext ? 'VALID' : 'NONE' }),
      })
      return
    }

    await route.continue()
  })
}

const DEFAULT_VERIFIED_ORDER_ID = '205-1234567-1234567'

/** Waits for Checkpoint 3 inline account setup on `/activate` after eligible verify. */
export async function expectProgressiveAccountSetupOnActivate(
  page: Page,
  verifiedOrderId: string | false = DEFAULT_VERIFIED_ORDER_ID,
) {
  await expect(page).toHaveURL(/\/activate$/)
  expect(page.url()).not.toMatch(/\d{3}-\d{7}-\d{7}/)
  const accountSetup = page.getByTestId('activation-account-setup')
  await expect(accountSetup).toBeVisible()
  await expect(accountSetup.getByText('Order verified', { exact: true })).toBeVisible()
  if (verifiedOrderId !== false) {
    await expect(accountSetup.getByTestId('activation-verified-order-id')).toContainText(
      `Order ID: ${verifiedOrderId}`,
    )
  }
  await expect(page.getByText('Need help with activation?')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Create your account to unlock your companion app.' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email Address')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use another order' })).toBeVisible()
}

export async function reachProgressiveAccountSetup(page: Page) {
  await page.goto('/activate')
  await page.getByLabel('Amazon order number').fill(DEFAULT_VERIFIED_ORDER_ID)
  await expectProgressiveAccountSetupOnActivate(page, DEFAULT_VERIFIED_ORDER_ID)
}
