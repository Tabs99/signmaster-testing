import { expect, test, type Page } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
} from './helpers/supabaseMock'

const AUTH_TEST_EMAIL = 'completion-e2e-fixture@example.invalid'
const AUTH_TEST_PASSWORD = 'Secure123!'
const PENDING_EMAIL = 'pending-e2e-fixture@example.invalid'

function mockContextResolve(page: Page, status: 'VALID' | 'EXPIRED' | 'NONE' = 'VALID') {
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

function mockComplete(page: Page, status: string, counter?: { count: number }) {
  return page.route('**/api/activation/complete', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (counter) {
      counter.count += 1
    }

    const authorization = route.request().headers()['authorization']
    expect(authorization).toBe('Bearer test-access-token')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

/**
 * Mocks a Supabase sign-up that requires email confirmation: no session token and
 * an unconfirmed user, mirroring Supabase when confirmations are enabled.
 */
function mockSupabaseSignUpConfirmationRequired(page: Page, email: string) {
  return page.route('**/auth/v1/signup**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-4000-8000-000000000003',
          email,
          email_confirmed_at: null,
        },
      }),
    })
  })
}

async function signInConfirmed(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
  await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('SignMaster activation completion', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('claim success then Continue finalises the activation and clears the context', async ({
    page,
  }) => {
    const completeCounter = { count: 0 }
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'COMPLETED', completeCounter)
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)

    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('Your SignMaster access is active')).toBeVisible()
    expect(completeCounter.count).toBe(1)
  })

  test('completion stays activated when the context was already finalised', async ({ page }) => {
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'NO_CONTEXT')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('Your SignMaster access is active')).toBeVisible()
  })

  test('conflict path offers recovery without exposing another account', async ({ page }) => {
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'ALREADY_CLAIMED')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)

    await expect(
      page.getByText('This order is linked to another account'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Use another order' }).click()
    await expect(page).toHaveURL(/\/activate$/)
  })

  test('not eligible path shows safe copy with no internal reason', async ({ page }) => {
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'NOT_ELIGIBLE')
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)

    await expect(
      page.getByText('This order can no longer be used to activate SignMaster.'),
    ).toBeVisible()
    await expect(page.getByText(/cancelled/i)).toHaveCount(0)
    await expect(page.getByText(/returned/i)).toHaveCount(0)
  })

  test('email confirmation continuation shows the waiting and not-seen-yet states', async ({
    page,
  }) => {
    await mockContextResolve(page, 'VALID')
    await mockSupabaseSignUpConfirmationRequired(page, PENDING_EMAIL)

    await page.goto('/create-account')
    await page.getByLabel('Email Address').fill(PENDING_EMAIL)
    await page.getByLabel('Create Password').fill(AUTH_TEST_PASSWORD)
    await page.getByLabel('Confirm Password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create Account & Continue' }).click()

    await expect(page.getByTestId('email-confirmation-continuation')).toBeVisible()
    await page.getByRole('button', { name: "I've confirmed my email" }).click()

    await expect(page.getByTestId('email-confirmation-not-seen')).toBeVisible()
  })
})
