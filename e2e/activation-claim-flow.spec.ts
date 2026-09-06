import { expect, test, type Page } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
} from './helpers/supabaseMock'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const AUTH_TEST_EMAIL = 'claim-e2e-fixture@example.invalid'
const AUTH_TEST_PASSWORD = 'Secure123!'

function mockActivationContextRoutes(page: Page, resolveStatus: 'VALID' | 'EXPIRED' = 'VALID') {
  return page.route('**/api/activation/context', async (route) => {
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

function mockActivationClaimRoute(
  page: Page,
  status: 'SUCCESS' | 'ALREADY_CLAIMED' | 'NOT_ELIGIBLE' | 'CONTEXT_EXPIRED',
) {
  return page.route('**/api/activation/claim', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    const authorization = route.request().headers()['authorization']
    expect(authorization).toBe('Bearer test-access-token')

    const body = route.request().postData()
    expect(body).toBeNull()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

test.describe('SignMaster activation claim', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('confirmed sign-in with valid context claims successfully', async ({ page }) => {
    await mockActivationContextRoutes(page, 'VALID')
    await mockActivationClaimRoute(page, 'SUCCESS')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText("You're signed in")).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
  })

  test('same user repeat claim remains SUCCESS', async ({ page }) => {
    let claimAttempts = 0

    await mockActivationContextRoutes(page, 'VALID')
    await page.route('**/api/activation/claim', async (route) => {
      claimAttempts += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'SUCCESS' }),
      })
    })
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
    expect(claimAttempts).toBe(1)
  })

  test('other user conflict returns ALREADY_CLAIMED', async ({ page }) => {
    await mockActivationContextRoutes(page, 'VALID')
    await mockActivationClaimRoute(page, 'ALREADY_CLAIMED')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator('[data-claim-outcome="already_claimed"]')).toBeVisible()
  })

  test('expired context blocks claim', async ({ page }) => {
    let claimCalled = false

    await mockActivationContextRoutes(page, 'EXPIRED')
    await page.route('**/api/activation/claim', async (route) => {
      claimCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'CONTEXT_EXPIRED' }),
      })
    })

    await page.goto('/create-account')

    await expect(page.getByTestId('activation-expired-notice')).toBeVisible()
    await expect(page.locator('[data-claim-outcome]')).toHaveCount(0)
    expect(claimCalled).toBe(false)
  })

  test('eligibility change before claim returns NOT_ELIGIBLE', async ({ page }) => {
    await mockActivationContextRoutes(page, 'VALID')
    await mockActivationClaimRoute(page, 'NOT_ELIGIBLE')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator('[data-claim-outcome="not_eligible"]')).toBeVisible()
  })
})
