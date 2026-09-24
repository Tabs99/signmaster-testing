import { expect, test, type Page } from './helpers/dashboardFixture'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
  mockSupabaseSignUpConfirmationRequired,
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

function mockComplete(
  page: Page,
  status: string,
  counter?: { count: number },
  afterComplete?: () => void,
) {
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

    // Reflect the real backend: a successful finalisation means the entitlement
    // is now active, so a subsequent `/app` entitlement check must see ACTIVE.
    afterComplete?.()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

function mockContinuationCreate(page: Page, reference = 'e2e-continuation-reference-0123456789abcdef') {
  return page.route('**/api/activation/continuation', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'CREATED', reference }),
    })
  })
}

function mockEntitlement(page: Page, getStatus: () => 'NONE' | 'ACTIVE') {
  // Sign-in authenticates then hands off to the shared `/app` resolver, which
  // reads entitlement first. A user still mid-activation resolves to NONE, so
  // the resolver routes to the resume path (`/create-account`) where the claim
  // and completion run — preserving the Task 6 completion semantics asserted
  // here. Once finalisation completes the entitlement becomes ACTIVE, so the
  // auto-navigation into `/app` lands on the active-access screen.
  return page.route('**/api/entitlement/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: getStatus() }),
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

  test('claim success then Continue finalises the activation and enters the app once', async ({
    page,
  }) => {
    const completeCounter = { count: 0 }
    const entitlement = { status: 'NONE' as 'NONE' | 'ACTIVE' }
    await mockEntitlement(page, () => entitlement.status)
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'COMPLETED', completeCounter, () => {
      entitlement.status = 'ACTIVE'
    })
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)

    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    // Finalisation navigates straight into the app — the user is NOT parked on
    // a second redundant "Your SignMaster access is active" success screen.
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByTestId('dashboard-first-run')).toBeVisible()
    await expect(page.getByText('Your SignMaster access is active')).toHaveCount(0)
    expect(completeCounter.count).toBe(1)
  })

  test('completion stays activated and enters the app when the context was already finalised', async ({
    page,
  }) => {
    const completeCounter = { count: 0 }
    const entitlement = { status: 'NONE' as 'NONE' | 'ACTIVE' }
    await mockEntitlement(page, () => entitlement.status)
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'NO_CONTEXT', completeCounter, () => {
      entitlement.status = 'ACTIVE'
    })
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await signInConfirmed(page)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByTestId('dashboard-first-run')).toBeVisible()
    expect(completeCounter.count).toBe(1)
  })

  test('conflict path offers recovery without exposing another account', async ({ page }) => {
    await mockEntitlement(page, () => 'NONE')
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
    await mockEntitlement(page, () => 'NONE')
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
    await mockContinuationCreate(page)
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
