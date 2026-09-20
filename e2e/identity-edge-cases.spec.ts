import { expect, test } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
} from './helpers/supabaseMock'

const AUTH_TEST_EMAIL = 'identity-edge-e2e@example.invalid'
const AUTH_TEST_PASSWORD = 'Secure123!'
const FAKE_OWNER_EMAIL = 'other-owner-leak-check@example.invalid'
const FAKE_OWNER_USER_ID = '00000000-0000-4000-8000-owner-leak-check'

function mockEntitlementNone(page: import('@playwright/test').Page) {
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

function mockActivationContextValid(page: import('@playwright/test').Page) {
  return page.route('**/api/activation/context', async (route) => {
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

test.describe('Identity edge cases (CP8)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('ALREADY_CLAIMED shows safe copy without owner email or user id', async ({ page }) => {
    await mockEntitlementNone(page)
    await mockActivationContextValid(page)
    await page.route('**/api/activation/claim', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ALREADY_CLAIMED' }),
      })
    })
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator('[data-claim-outcome="already_claimed"]')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'This order is linked to another account' }),
    ).toBeVisible()

    const pageText = await page.locator('body').innerText()
    expect(pageText).not.toContain(FAKE_OWNER_EMAIL)
    expect(pageText).not.toContain(FAKE_OWNER_USER_ID)
    expect(pageText).not.toMatch(/owner@/i)
    await expect(page).not.toHaveURL(/\/app$/)
  })

  test('NOT_ELIGIBLE shows safe ineligible copy without revoked-owner details', async ({
    page,
  }) => {
    await mockEntitlementNone(page)
    await mockActivationContextValid(page)
    await page.route('**/api/activation/claim', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'NOT_ELIGIBLE' }),
      })
    })
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)

    await page.goto('/sign-in')
    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator('[data-claim-outcome="not_eligible"]')).toBeVisible()
    const pageText = await page.locator('body').innerText()
    expect(pageText).not.toContain(FAKE_OWNER_USER_ID)
    expect(pageText).not.toMatch(/revoked by admin/i)
    await expect(page).not.toHaveURL(/\/app$/)
  })
})
