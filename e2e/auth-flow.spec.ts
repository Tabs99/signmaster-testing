import { expect, test, type Page } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
  mockSupabaseSignUpSuccess,
} from './helpers/supabaseMock'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const AUTH_TEST_EMAIL = 'auth-e2e-fixture@example.invalid'
const AUTH_TEST_PASSWORD = 'Secure123!'

function mockVerifyRoute(page: Page, status: string) {
  return page.route('**/api/activation/verify', async (route) => {
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

function mockActivationContextCreate(page: Page) {
  return page.route('**/api/activation/context', async (route) => {
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

function mockContinuationCreate(page: Page) {
  return page.route('**/api/activation/continuation', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'CREATED',
        reference: 'e2e-continuation-reference-0123456789abcdef',
      }),
    })
  })
}

function mockEntitlementNone(page: Page) {
  // Sign-in authenticates then hands off to the shared `/app` resolver, which
  // reads entitlement first. A user still mid-activation resolves to NONE, so
  // the resolver routes to the resume path (`/create-account`) where the claim
  // runs — preserving the claim semantics this test asserts.
  return page.route('**/api/entitlement/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'NONE' }),
    })
  })
}

function mockActivationClaim(page: Page, status: string) {
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

async function fillValidOrderId(page: Page) {
  await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
}

// A complete, valid Order ID now auto-verifies after a short debounce, so the
// manual "Check my order" button (kept as an accessibility fallback, covered by
// unit tests) does not need to be clicked here.
async function submitOrderCheck(_page: Page) {
  // Intentionally a no-op: a complete valid Order ID auto-verifies.
}

test.describe('SignMaster auth foundation', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('A5 Continue navigates to create-account', async ({ page }) => {
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockActivationContextCreate(page)
    await page.goto('/activate')
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(
      page.getByRole('heading', { name: 'Your purchase is verified' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Continue to account setup' }).click()

    await expect(page).toHaveURL(/\/create-account$/)
    await expect(
      page.getByRole('heading', { name: 'Create your SignMaster account' }),
    ).toBeVisible()
  })

  test('A9 Sign in navigates to sign-in screen', async ({ page }) => {
    await mockVerifyRoute(page, 'ALREADY_CLAIMED')
    await page.goto('/activate')
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    const statusPlate = page.getByRole('status')
    await expect(statusPlate.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(statusPlate.getByRole('button', { name: 'Use another order' })).toBeVisible()
    await statusPlate.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { name: 'Sign in to SignMaster' })).toBeVisible()
  })

  test('create-account with confirmed session and valid context activates access', async ({
    page,
  }) => {
    await mockSupabaseSignUpSuccess(page, AUTH_TEST_EMAIL)
    await mockActivationContextCreate(page)
    await mockContinuationCreate(page)
    await mockActivationClaim(page, 'SUCCESS')
    await page.goto('/create-account')

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.getByLabel('Create Password').fill(AUTH_TEST_PASSWORD)
    await page.getByLabel('Confirm Password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create Account & Continue' }).click()

    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
  })

  test('sign-in with confirmed session and valid context activates access', async ({ page }) => {
    await mockEntitlementNone(page)
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)
    await mockActivationContextCreate(page)
    await mockActivationClaim(page, 'SUCCESS')
    await page.goto('/sign-in')

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
  })
})
