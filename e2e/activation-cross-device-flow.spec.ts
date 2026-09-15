import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'

const CROSS_DEVICE_EMAIL = 'cross-device-e2e-fixture@example.invalid'
const REFERENCE = 'e2e-cross-device-reference-0123456789abcdefghij'

/**
 * Seeds a confirmed Supabase session into localStorage so the confirming device
 * boots authenticated — mirroring Supabase establishing the session from the
 * email-confirmation redirect (detectSessionInUrl) without the original browser
 * cookie ever being present.
 */
async function seedConfirmedSession(page: Page) {
  await page.addInitScript(
    ({ email }) => {
      const session = {
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 9999999999,
        refresh_token: 'test-refresh-token',
        user: {
          id: '00000000-0000-4000-8000-000000000009',
          aud: 'authenticated',
          role: 'authenticated',
          email,
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }
      window.localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
    },
    { email: CROSS_DEVICE_EMAIL },
  )
}

function mockContextResolve(page: Page, status: 'VALID' | 'NONE' = 'VALID') {
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

function mockContinue(page: Page, status: string, counter?: { count: number }) {
  return page.route('**/api/activation/continue', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (counter) {
      counter.count += 1
    }

    const headers = route.request().headers()
    expect(headers['authorization']).toBe('Bearer test-access-token')

    const fulfillment: Parameters<typeof route.fulfill>[0] = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    }

    if (status === 'CONTINUED') {
      // Re-issue the HttpOnly context cookie on the confirming device.
      fulfillment.headers = {
        'Set-Cookie':
          'sm_activation_ctx=fresh-cross-device-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
      }
    }

    await route.fulfill(fulfillment)
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

function mockComplete(page: Page, status: string, afterComplete?: () => void) {
  return page.route('**/api/activation/complete', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    // A successful finalisation grants the entitlement, so a subsequent `/app`
    // entitlement check must see ACTIVE.
    afterComplete?.()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status }),
    })
  })
}

function mockEntitlement(page: Page, getStatus: () => 'NONE' | 'ACTIVE') {
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

test.describe('SignMaster cross-device activation continuation', () => {
  test('resumes activation on the confirming device without the original cookie', async ({
    page,
  }) => {
    const continueCounter = { count: 0 }
    const entitlement = { status: 'NONE' as 'NONE' | 'ACTIVE' }
    await seedConfirmedSession(page)
    await mockEntitlement(page, () => entitlement.status)
    await mockContinue(page, 'CONTINUED', continueCounter)
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'COMPLETED', () => {
      entitlement.status = 'ACTIVE'
    })

    await page.goto(`/activation/continue?ref=${REFERENCE}`)

    // Resumes to the account flow and runs the claim automatically.
    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()

    // Finalisation navigates straight into the app on the confirming device.
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByTestId('app-access')).toBeVisible()
    await expect(page.getByText('Your SignMaster access is active')).toHaveCount(0)

    expect(continueCounter.count).toBe(1)
  })

  test('shows safe recovery when the continuation reference is already used (replay)', async ({
    page,
  }) => {
    await seedConfirmedSession(page)
    await mockContinue(page, 'ALREADY_CONSUMED')

    await page.goto(`/activation/continue?ref=${REFERENCE}`)

    await expect(
      page.getByText("This activation link can't be used"),
    ).toBeVisible()
    // No sensitive identifiers rendered.
    await expect(page.getByText(REFERENCE)).toHaveCount(0)
  })

  test('prompts sign-in when the confirming device has no session', async ({ page }) => {
    // No seeded session → not authenticated.
    await mockSupabaseAuthBootstrap(page)
    await mockContinue(page, 'CONTINUED')

    await page.goto(`/activation/continue?ref=${REFERENCE}`)

    await expect(page.getByText('Sign in to finish activating')).toBeVisible()
  })

  test('wrong-email / invalid reference shows safe recovery without enumeration', async ({
    page,
  }) => {
    // The confirmed session's email does not match the reference binding →
    // server resolves INVALID. The UI must show the same neutral recovery state
    // as any other unusable link, leaking no account/order existence.
    await seedConfirmedSession(page)
    await mockContinue(page, 'INVALID')

    await page.goto(`/activation/continue?ref=${REFERENCE}`)

    await expect(page.getByText("This activation link can't be used")).toBeVisible()
    await expect(page.getByText(CROSS_DEVICE_EMAIL)).toHaveCount(0)
    await expect(page.getByText(REFERENCE)).toHaveCount(0)
  })

  test('transient continue failure is retryable and recovers to CONTINUED', async ({ page }) => {
    // A 5xx during the exchange must fail closed to a retryable state (the
    // reference is not burned) and succeed on retry — no protected access is
    // granted on the transient error.
    await seedConfirmedSession(page)
    await mockContextResolve(page, 'VALID')
    await mockClaim(page, 'SUCCESS')
    await mockComplete(page, 'COMPLETED')

    let attempts = 0
    await page.route('**/api/activation/continue', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      attempts += 1
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ERROR' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Set-Cookie':
            'sm_activation_ctx=fresh-cross-device-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
        },
        body: JSON.stringify({ status: 'CONTINUED' }),
      })
    })

    await page.goto(`/activation/continue?ref=${REFERENCE}`)

    await expect(page.getByRole('heading', { name: "We couldn't finish just now" })).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    expect(attempts).toBe(2)
  })
})
