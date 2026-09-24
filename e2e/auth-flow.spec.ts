import { expect, test, type Page } from './helpers/dashboardFixture'
import {
  mockSupabaseAuthBootstrap,
  mockSupabasePostSignupSessionReadFailureOnce,
  mockSupabaseSignInSuccess,
  mockSupabaseSignUpConfirmationRequired,
  mockSupabaseSignUpEmailAlreadyRegistered,
  mockSupabaseSignUpSuccess,
  setConfirmedSessionStorage,
} from './helpers/supabaseMock'
import {
  expectProgressiveAccountSetupOnActivate,
  mockActivationContextAlwaysValid,
  mockStatefulActivationContext,
  reachProgressiveAccountSetup,
} from './helpers/progressiveActivation'

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
  return mockStatefulActivationContext(page)
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

function mockActivationClaim(page: Page, status: string, counter?: { count: number }) {
  return page.route('**/api/activation/claim', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (counter) {
      counter.count += 1
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

function mockSignUpWithCounter(
  page: Page,
  counter: { count: number },
  fulfill: (route: import('@playwright/test').Route) => Promise<void>,
) {
  return page.route('**/auth/v1/signup**', async (route) => {
    counter.count += 1
    await fulfill(route)
  })
}

async function fillProgressiveAccountForm(page: Page, email: string) {
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Create Password').fill(AUTH_TEST_PASSWORD)
  await page.getByLabel('Confirm Password').fill(AUTH_TEST_PASSWORD)
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('/auth/v1/signup'),
    ),
    page.getByRole('button', { name: 'Create Account & Continue' }).click(),
  ])
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

  test('progressive activate supports email/password account creation inline', async ({
    page,
  }) => {
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockActivationContextCreate(page)
    await mockSupabaseSignUpSuccess(page, AUTH_TEST_EMAIL)
    await mockContinuationCreate(page)
    await mockActivationClaim(page, 'SUCCESS')
    await page.goto('/activate')
    await fillValidOrderId(page)
    await submitOrderCheck(page)
    await expectProgressiveAccountSetupOnActivate(page)

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.getByLabel('Create Password').fill(AUTH_TEST_PASSWORD)
    await page.getByLabel('Confirm Password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create Account & Continue' }).click()

    await expect(page).toHaveURL(/\/activate$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
  })

  test('A5 eligible verification reveals inline account setup on activate', async ({ page }) => {
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockActivationContextCreate(page)
    await page.goto('/activate')
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expectProgressiveAccountSetupOnActivate(page)
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
    await mockActivationContextAlwaysValid(page)
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
    await mockActivationContextAlwaysValid(page)
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

test.describe('Progressive activation integration seams (pre-CP5)', () => {
  const PENDING_EMAIL = 'progressive-pending-e2e@example.invalid'

  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('progressive email confirmation recheck stays unconfirmed without claim', async ({
    page,
  }) => {
    const claimCounter = { count: 0 }
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockStatefulActivationContext(page)
    await mockContinuationCreate(page)
    await mockSupabaseSignUpConfirmationRequired(page, PENDING_EMAIL)
    await mockActivationClaim(page, 'SUCCESS', claimCounter)

    await reachProgressiveAccountSetup(page)
    await fillProgressiveAccountForm(page, PENDING_EMAIL)

    await expect(page).toHaveURL(/\/activate$/)
    await expect(page.getByTestId('email-confirmation-continuation')).toBeVisible()
    await expect(page.getByLabel('Email Address')).toHaveCount(0)

    await page.getByRole('button', { name: "I've confirmed my email" }).click()

    await expect(page.getByTestId('email-confirmation-not-seen')).toBeVisible()
    await expect(page).toHaveURL(/\/activate$/)
    await expect(page.getByLabel('Email Address')).toHaveCount(0)
    expect(claimCounter.count).toBe(0)
    await expect(page).not.toHaveURL(/\/app$/)
  })

  test('progressive email confirmation recheck confirmed runs claim once on activate', async ({
    page,
  }) => {
    const signupCounter = { count: 0 }
    const claimCounter = { count: 0 }
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockStatefulActivationContext(page)
    await mockContinuationCreate(page)
    await mockSignUpWithCounter(page, signupCounter, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '00000000-0000-4000-8000-000000000003',
            email: PENDING_EMAIL,
            email_confirmed_at: null,
          },
        }),
      })
    })
    await mockActivationClaim(page, 'SUCCESS', claimCounter)

    await reachProgressiveAccountSetup(page)
    await fillProgressiveAccountForm(page, PENDING_EMAIL)
    expect(signupCounter.count).toBe(1)

    await setConfirmedSessionStorage(page, PENDING_EMAIL)
    await page.getByRole('button', { name: "I've confirmed my email" }).click()

    await expect(page).toHaveURL(/\/activate$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
    expect(signupCounter.count).toBe(1)
    expect(claimCounter.count).toBe(1)
    await expect(page.getByLabel('Amazon order number')).toHaveCount(0)
  })

  test('progressive confirmed signup auth-sync retry reaches claim without second signup', async ({
    page,
  }) => {
    const signupCounter = { count: 0 }
    const claimCounter = { count: 0 }
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockStatefulActivationContext(page)
    await mockSupabasePostSignupSessionReadFailureOnce(page)
    await mockSignUpWithCounter(page, signupCounter, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'test-refresh-token',
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: AUTH_TEST_EMAIL,
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
          },
        }),
      })
    })
    await mockActivationClaim(page, 'SUCCESS', claimCounter)

    await reachProgressiveAccountSetup(page)
    await fillProgressiveAccountForm(page, AUTH_TEST_EMAIL)

    await expect(page.getByTestId('activation-auth-sync-notice')).toBeVisible()
    await expect(page.getByLabel('Email Address')).toHaveCount(0)
    expect(signupCounter.count).toBe(1)

    await page.getByRole('button', { name: 'Retry' }).click()

    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
    expect(signupCounter.count).toBe(1)
    expect(claimCounter.count).toBe(1)
    await expect(page.getByLabel('Email Address')).toHaveCount(0)
  })

  test('progressive existing account sign-in resumes VALID context and claims once', async ({
    page,
  }) => {
    const signupCounter = { count: 0 }
    const claimCounter = { count: 0 }
    await mockVerifyRoute(page, 'ELIGIBLE')
    await mockStatefulActivationContext(page)
    await mockSignUpWithCounter(page, signupCounter, async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 422,
          error_code: 'user_already_exists',
          msg: 'User already registered',
        }),
      })
    })
    await mockEntitlementNone(page)
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)
    await mockActivationClaim(page, 'SUCCESS', claimCounter)

    await reachProgressiveAccountSetup(page)
    await fillProgressiveAccountForm(page, AUTH_TEST_EMAIL)
    expect(signupCounter.count).toBe(1)

    await expect(
      page.getByText(/We could not create your account. If you already have one, try signing in./i),
    ).toBeVisible()

    await page.getByRole('alert').getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { name: 'Sign in to SignMaster' })).toBeVisible()

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    const signInButton = page.getByRole('button', { name: 'Sign in', exact: true })
    await expect(signInButton).toBeEnabled()
    await signInButton.click()

    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
    expect(signupCounter.count).toBe(1)
    expect(claimCounter.count).toBe(1)
    await expect(page.getByLabel('Amazon order number')).toHaveCount(0)
  })
})
