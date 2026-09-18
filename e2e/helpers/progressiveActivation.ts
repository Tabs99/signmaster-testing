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

/** Waits for Checkpoint 3 inline account setup on `/activate` after eligible verify. */
export async function expectProgressiveAccountSetupOnActivate(page: Page) {
  await expect(page).toHaveURL(/\/activate$/)
  await expect(page.getByTestId('activation-account-setup')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Create your account to unlock your companion app.' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email Address')).toBeVisible()
}
