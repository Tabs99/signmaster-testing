import { expect, test, type Page } from '@playwright/test'
import {
  buildRecoveryHash,
  mockSupabaseAuthBootstrap,
  mockSupabasePasswordRecover,
  mockSupabaseRecoveryUserEndpoint,
  seedConfirmedSession,
} from './helpers/supabaseMock'

const RESET_EMAIL = 'reset-e2e-fixture@example.invalid'
const NEW_PASSWORD = 'NewSecure123!'

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

test.describe('SignMaster password reset', () => {
  test('Sign In → Forgot password → generic anti-enumeration confirmation', async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockContextResolve(page, 'NONE')
    await mockSupabasePasswordRecover(page, 200)

    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Forgot password?' }).click()

    await expect(page).toHaveURL(/\/forgot-password$/)
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()

    await page.getByLabel('Email Address').fill(RESET_EMAIL)
    await page.getByRole('button', { name: 'Send reset link' }).click()

    await expect(
      page.getByText("If an account exists for this email, we've sent a password reset link."),
    ).toBeVisible()
    // The submitted email must not be echoed back (no enumeration signal).
    await expect(page.getByText(RESET_EMAIL)).toHaveCount(0)
  })

  test('Genuine PASSWORD_RECOVERY session → reset password → success', async ({ page }) => {
    await mockContextResolve(page, 'NONE')
    await mockSupabaseRecoveryUserEndpoint(page, RESET_EMAIL)

    await page.goto(`/reset-password${buildRecoveryHash(RESET_EMAIL)}`)

    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    await page.getByLabel('New Password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm New Password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()

    await expect(page.getByText('Password updated')).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/create-account$/)
  })

  test('Normal authenticated session cannot use the reset form', async ({ page }) => {
    // Signed in normally (persisted session), no recovery entry: the reset form
    // must not appear — this is not the recovery route for a normal session.
    await seedConfirmedSession(page, RESET_EMAIL)
    await mockContextResolve(page, 'NONE')

    await page.goto('/reset-password')

    await expect(page.getByText("This reset link can't be used")).toBeVisible()
    await expect(page.getByLabel('New Password', { exact: true })).toHaveCount(0)
  })

  test('Invalid/expired recovery link → safe recovery', async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)

    await page.goto('/reset-password')

    await expect(page.getByText("This reset link can't be used")).toBeVisible()

    await page.getByRole('button', { name: 'Request a new link' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('Recovery does not persist across a hard reload (falls back to safe state)', async ({
    page,
  }) => {
    await mockContextResolve(page, 'NONE')
    await mockSupabaseRecoveryUserEndpoint(page, RESET_EMAIL)

    await page.goto(`/reset-password${buildRecoveryHash(RESET_EMAIL)}`)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

    // The recovery event does not re-fire on reload; the persisted session must
    // NOT be treated as recovery authority.
    await page.reload()
    await expect(page.getByText("This reset link can't be used")).toBeVisible()
    await expect(page.getByLabel('New Password', { exact: true })).toHaveCount(0)
  })

  test('Duplicate reset submit is blocked', async ({ page }) => {
    const updateCounter = { count: 0 }
    await mockContextResolve(page, 'NONE')
    await mockSupabaseRecoveryUserEndpoint(page, RESET_EMAIL, {
      updateCounter,
      updateDelayMs: 400,
    })

    await page.goto(`/reset-password${buildRecoveryHash(RESET_EMAIL)}`)

    await page.getByLabel('New Password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm New Password').fill(NEW_PASSWORD)

    const submit = page.getByRole('button', { name: 'Update password' })
    await submit.click()
    // While in-flight the button relabels and cannot re-trigger the request.
    await expect(page.getByRole('button', { name: 'Updating password…' })).toBeVisible()
    await page.getByRole('button', { name: 'Updating password…' }).click({ force: true })

    await expect(page.getByText('Password updated')).toBeVisible()
    expect(updateCounter.count).toBe(1)
  })

  test('Activation context continuity is preserved through reset', async ({ page }) => {
    // A verified purchaser with a valid activation context resets their password
    // via genuine recovery and, once authenticated, the resolver continues the claim.
    await mockContextResolve(page, 'VALID')
    await mockSupabaseRecoveryUserEndpoint(page, RESET_EMAIL)
    await mockClaim(page, 'SUCCESS')

    await page.goto(`/reset-password${buildRecoveryHash(RESET_EMAIL)}`)

    await page.getByLabel('New Password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm New Password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()

    await expect(page.getByText('Password updated')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    // The activation resolver resumes on /create-account and completes the claim.
    await expect(page).toHaveURL(/\/create-account$/)
    await expect(page.getByText(/SignMaster is activated/i)).toBeVisible()
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
  })
})
