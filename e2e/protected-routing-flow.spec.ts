import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap, seedConfirmedSession } from './helpers/supabaseMock'

const APP_EMAIL = 'protected-e2e-fixture@example.invalid'
const ACCESS_TEXT = 'SignMaster access is active.'
const B10_HEADING = 'Finish activating SignMaster'

function mockEntitlement(
  page: Page,
  getStatus: () => 'ACTIVE' | 'NONE' | number,
  options: { delayMs?: number } = {},
) {
  return page.route('**/api/entitlement/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }

    const status = getStatus()

    if (typeof status === 'number') {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ERROR' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

function mockContext(page: Page, status: 'VALID' | 'EXPIRED' | 'NONE') {
  return page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status }),
      })
      return
    }
    await route.continue()
  })
}

function mockClaim(page: Page, status: string) {
  return page.route('**/api/activation/claim', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

test.describe('SignMaster entitlement-aware protected routing', () => {
  test('unauthenticated visit to /app redirects to sign in without flashing protected content', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockContext(page, 'NONE')

    await page.goto('/app')

    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { name: 'Sign in to SignMaster' })).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)
  })

  test('active entitlement is granted access to /app', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'ACTIVE')

    await page.goto('/app')

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
  })

  test('no entitlement + no activation context shows the activation-required (B10) state', async ({
    page,
  }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'NONE')
    await mockContext(page, 'NONE')

    await page.goto('/app')

    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()
    await expect(
      page.getByText('Your account is ready. Verify your Amazon order to activate access.'),
    ).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)

    // No horizontal overflow at the current viewport (runs at 375px on mobile project).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('B10 "Verify my order" routes to activation', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'NONE')
    await mockContext(page, 'NONE')

    await page.goto('/app')
    await page.getByRole('button', { name: 'Verify my order' }).click()

    await expect(page).toHaveURL(/\/activate$/)
  })

  test('no entitlement + valid context resumes activation and completes the claim', async ({
    page,
  }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'NONE')
    await mockContext(page, 'VALID')
    await mockClaim(page, 'SUCCESS')

    await page.goto('/app')

    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
  })

  test('a transient entitlement failure fails closed, then recovers on retry', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    let attempts = 0
    await mockEntitlement(page, () => {
      attempts += 1
      return attempts === 1 ? 500 : 'ACTIVE'
    })

    await page.goto('/app')

    await expect(page.getByRole('heading', { name: "We couldn't check your access" })).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)

    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
  })

  test('protected content never flashes while the entitlement check is in flight', async ({
    page,
  }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'ACTIVE', { delayMs: 800 })

    await page.goto('/app')

    await expect(page.getByText('Checking your access…')).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
  })

  test('entitlement authority is re-checked from the backend, not cached', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockContext(page, 'NONE')
    let status: 'ACTIVE' | 'NONE' = 'ACTIVE'
    await mockEntitlement(page, () => status)

    await page.goto('/app')
    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()

    // Backend flips to NONE (e.g. revoked). A fresh navigation must reflect it.
    status = 'NONE'
    await page.goto('/activate')
    await page.goto('/app')

    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)
  })
})
