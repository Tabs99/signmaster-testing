import { expect, test, type Page } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
  mockSupabaseSignOut,
  seedConfirmedSession,
} from './helpers/supabaseMock'

const APP_EMAIL = 'protected-e2e-fixture@example.invalid'
const APP_PASSWORD = 'Secure123!'
const ACCESS_TEXT = 'SignMaster access is active.'
const B10_HEADING = 'Finish activating SignMaster'

/**
 * Persists a confirmed Supabase session via a one-shot `evaluate` (not an init
 * script) so it can later be cleared to model a genuine sign-out. localStorage
 * survives same-origin navigations, so the session stays put across `goto`
 * until it is explicitly removed.
 */
async function persistConfirmedSession(page: Page, email: string) {
  await page.evaluate((sessionEmail) => {
    const session = {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999999999,
      refresh_token: 'test-refresh-token',
      user: {
        id: '00000000-0000-4000-8000-000000000010',
        aud: 'authenticated',
        role: 'authenticated',
        email: sessionEmail,
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
      },
    }
    window.localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
  }, email)
}

async function clearPersistedSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('sb-127-auth-token')
  })
}

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

  test('active entitlement survives a true logout / login cycle without a browser cache', async ({
    page,
  }) => {
    let entitlementCalls = 0
    await mockSupabaseAuthBootstrap(page)
    await mockEntitlement(page, () => {
      entitlementCalls += 1
      return 'ACTIVE'
    })
    await mockSupabaseSignInSuccess(page, APP_EMAIL)

    // 1. Authenticated user with ACTIVE entitlement reaches /app.
    await page.goto('/sign-in')
    await persistConfirmedSession(page, APP_EMAIL)
    await page.goto('/app')
    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
    const callsAfterInitialGrant = entitlementCalls
    expect(callsAfterInitialGrant).toBeGreaterThanOrEqual(1)

    // 2 + 3. Sign out (clear the persisted session) — a direct /app visit no
    // longer grants access and never flashes protected content.
    await clearPersistedSession(page)
    await page.goto('/app')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)

    // 4 + 5 + 6. Sign in again → the resolver re-checks entitlement (ACTIVE)
    // from the backend and access is restored.
    await page.getByLabel('Email Address').fill(APP_EMAIL)
    await page.locator('#sign-in-password').fill(APP_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()

    // 7. Entitlement was re-queried on the second grant — nothing was served
    // from a browser-side entitlement cache.
    expect(entitlementCalls).toBeGreaterThan(callsAfterInitialGrant)
  })

  test('returning active user signs in and reaches /app even when the activation-context API is down', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockEntitlement(page, () => 'ACTIVE')
    await mockSupabaseSignInSuccess(page, APP_EMAIL)

    // Activation-context API is unavailable. For an ACTIVE user it must never
    // be consulted, and it must never block authentication or access.
    let contextCalls = 0
    await page.route('**/api/activation/context', async (route) => {
      contextCalls += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ERROR' }),
      })
    })

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(APP_EMAIL)
    await page.locator('#sign-in-password').fill(APP_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
    await expect(page.getByRole('heading', { name: B10_HEADING })).toHaveCount(0)
    expect(contextCalls).toBe(0)
  })

  test('a malformed entitlement response fails closed (no access, no B10)', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockContext(page, 'NONE')
    // 200 OK but an unrecognised payload — must never be mistaken for a
    // definitive ACTIVE or NONE. The client collapses it to a transient
    // failure and the guard shows the fail-closed retry screen.
    await page.route('**/api/entitlement/me', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ unexpected: 'shape', status: 'WAT' }),
      })
    })

    await page.goto('/app')

    await expect(
      page.getByRole('heading', { name: "We couldn't check your access" }),
    ).toBeVisible()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: B10_HEADING })).toHaveCount(0)
  })

  test('B10 "Use another account" signs out and returns to sign in', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockEntitlement(page, () => 'NONE')
    await mockContext(page, 'NONE')
    await mockSupabaseSignOut(page)

    await page.goto('/app')
    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()

    await page.getByRole('button', { name: 'Use another account' }).click()

    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { name: 'Sign in to SignMaster' })).toBeVisible()

    // The Supabase session was cleared by sign-out (no persisted auth token).
    const persistedSession = await page.evaluate(() =>
      window.localStorage.getItem('sb-127-auth-token'),
    )
    expect(persistedSession).toBeNull()
  })

  test('B10 does not flash while an ACTIVE entitlement is still resolving', async ({ page }) => {
    await seedConfirmedSession(page, APP_EMAIL)
    await mockContext(page, 'NONE')
    await mockEntitlement(page, () => 'ACTIVE', { delayMs: 700 })

    await page.goto('/app')

    // While entitlement is in flight only the neutral loading screen shows —
    // never the activation-required (B10) state for an about-to-be-active user.
    await expect(page.getByText('Checking your access…')).toBeVisible()
    await expect(page.getByRole('heading', { name: B10_HEADING })).toHaveCount(0)

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
    await expect(page.getByRole('heading', { name: B10_HEADING })).toHaveCount(0)
  })
})
