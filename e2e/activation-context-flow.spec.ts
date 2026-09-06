import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'

const FIXTURE_ORDER_ID = '205-1234567-1234567'

function mockVerifyEligible(page: Page) {
  return page.route('**/api/activation/verify', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ELIGIBLE' }),
    })
  })
}

function mockActivationContextRoutes(
  page: Page,
  resolveStatus: 'VALID' | 'EXPIRED' | 'NONE' = 'VALID',
) {
  return page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Set-Cookie':
            'sm_activation_ctx=opaque-test-token; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax',
        },
        body: JSON.stringify({ status: 'CREATED' }),
      })
      return
    }

    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: resolveStatus }),
      })
      return
    }

    await route.continue()
  })
}

async function reachEligibleResult(page: Page) {
  await page.goto('/activate')
  await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
  await page.getByRole('button', { name: 'Check my order' }).click()
  await expect(
    page.getByRole('heading', { name: 'Your purchase is verified' }),
  ).toBeVisible()
}

test.describe('SignMaster activation context persistence', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('ELIGIBLE → context created → A5 Continue → create-account still resolves VALID', async ({
    page,
  }) => {
    await mockVerifyEligible(page)
    await mockActivationContextRoutes(page, 'VALID')
    await reachEligibleResult(page)

    await page.getByRole('button', { name: 'Continue to account setup' }).click()
    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText('Purchase verified')).toBeVisible()
    await expect(page.getByTestId('activation-context-missing-notice')).toHaveCount(0)
  })

  test('ELIGIBLE → context → sign-in still resolves VALID', async ({ page }) => {
    await mockVerifyEligible(page)
    await mockActivationContextRoutes(page, 'VALID')
    await reachEligibleResult(page)

    await page.getByRole('button', { name: 'Continue to account setup' }).click()
    await expect(page).toHaveURL(/\/create-account$/)
    await page.goto('/sign-in')
    await expect(page.getByTestId('activation-context-missing-notice')).toHaveCount(0)
  })

  test('refresh on create-account still resolves context', async ({ page }) => {
    await mockVerifyEligible(page)
    await mockActivationContextRoutes(page, 'VALID')
    await reachEligibleResult(page)
    await page.getByRole('button', { name: 'Continue to account setup' }).click()
    await expect(page).toHaveURL(/\/create-account$/)

    await page.reload()
    await expect(page.getByText('Purchase verified')).toBeVisible()
  })

  test('expired context shows restart notice', async ({ page }) => {
    await mockActivationContextRoutes(page, 'EXPIRED')
    await page.goto('/create-account')

    await expect(page.getByTestId('activation-expired-notice')).toBeVisible()
    await expect(page.getByText('Purchase verified')).toHaveCount(0)
  })

  test('no cookie resolves to missing context notice', async ({ page }) => {
    await mockActivationContextRoutes(page, 'NONE')
    await page.goto('/create-account')

    await expect(page.getByTestId('activation-context-missing-notice')).toBeVisible()
    await expect(page.getByText('Purchase verified')).toHaveCount(0)
  })

  test('context GET failure shows retry notice and recovers to VALID', async ({ page }) => {
    let contextGetAttempts = 0

    await page.route('**/api/activation/context', async (route) => {
      if (route.request().method() === 'GET') {
        contextGetAttempts += 1

        if (contextGetAttempts === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'ERROR' }),
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'VALID' }),
        })
        return
      }

      await route.continue()
    })

    await page.goto('/create-account')

    await expect(page.getByTestId('activation-context-service-error-notice')).toBeVisible()
    await expect(page.getByText('Purchase verified')).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Purchase verified')).toBeVisible()
    expect(contextGetAttempts).toBe(2)
  })
})
