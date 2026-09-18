import { expect, test, type Page } from '@playwright/test'
import {
  mockAppleOAuthAuthorizeReturn,
  mockSupabaseAuthBootstrap,
  mockSupabaseAuthenticatedUser,
} from './helpers/supabaseMock'
import {
  mockStatefulActivationContext,
  reachProgressiveAccountSetup,
} from './helpers/progressiveActivation'

const APPLE_EMAIL = 'apple-oauth-e2e-fixture@example.invalid'
const RELAY_EMAIL = 'private-relay@example.invalid'
const ORDER_ID = '205-1234567-1234567'
const ORDER_DIGITS = '2051234567123456'
const ACCESS_TEXT = 'SignMaster access is active.'
const B10_HEADING = 'Finish activating SignMaster'

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

function mockContextGet(page: Page, getStatus: () => 'VALID' | 'EXPIRED' | 'NONE') {
  return page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: getStatus() }),
      })
      return
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'CREATED' }),
      })
      return
    }
    await route.continue()
  })
}

function mockClaimOnce(page: Page, counter: { count: number }) {
  return page.route('**/api/activation/claim', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    counter.count += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'SUCCESS' }),
    })
  })
}

function mockEntitlement(page: Page, status: 'ACTIVE' | 'NONE') {
  return page.route('**/api/entitlement/me', async (route) => {
    if (route.request().method() !== 'GET') {
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

test.describe('Apple OAuth integration (CP6)', () => {
  test('E2E 1 — progressive activation with Apple claims once after OAuth return', async ({
    page,
  }) => {
    const claimCounter = { count: 0 }
    await mockSupabaseAuthBootstrap(page)
    await mockSupabaseAuthenticatedUser(page, APPLE_EMAIL)
    await mockVerifyEligible(page)
    await mockStatefulActivationContext(page)
    await mockClaimOnce(page, claimCounter)
    await mockAppleOAuthAuthorizeReturn(page, APPLE_EMAIL, {
      onAuthorize: (redirectTo) => {
        expect(redirectTo).not.toContain(ORDER_ID)
        expect(redirectTo).not.toContain(ORDER_DIGITS)
        expect(redirectTo).toMatch(/\/activate$/)
      },
    })

    await reachProgressiveAccountSetup(page)
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page).toHaveURL(/\/activate/)
    await expect(page.locator('[data-claim-outcome="success"]')).toBeVisible()
    expect(claimCounter.count).toBe(1)
    expect(page.url()).not.toContain(ORDER_ID)
  })

  test('E2E 2 — Apple return with expired context does not claim', async ({ page }) => {
    let activationContextStatus: 'NONE' | 'VALID' | 'EXPIRED' = 'NONE'
    const claimCounter = { count: 0 }

    await page.addInitScript(() => {
      sessionStorage.clear()
    })

    await mockSupabaseAuthBootstrap(page)
    await mockSupabaseAuthenticatedUser(page, APPLE_EMAIL)
    await mockVerifyEligible(page)
    await page.route('**/api/activation/context', async (route) => {
      if (route.request().method() === 'POST') {
        activationContextStatus = 'VALID'
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
          body: JSON.stringify({ status: activationContextStatus }),
        })
        return
      }
      await route.continue()
    })
    await mockClaimOnce(page, claimCounter)
    await mockAppleOAuthAuthorizeReturn(page, APPLE_EMAIL, {
      onAuthorize: () => {
        activationContextStatus = 'EXPIRED'
      },
    })

    await reachProgressiveAccountSetup(page)
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page).toHaveURL(/\/activate/)
    expect(claimCounter.count).toBe(0)
    await expect(page.locator('[data-claim-outcome="success"]')).toHaveCount(0)
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)
    await expect(page.getByLabel('Amazon order number')).toBeVisible()
  })

  test('E2E 3 — Apple sign-in with ACTIVE entitlement enters /app without claim', async ({
    page,
  }) => {
    const claimCounter = { count: 0 }
    await mockSupabaseAuthBootstrap(page)
    await mockSupabaseAuthenticatedUser(page, APPLE_EMAIL)
    await mockEntitlement(page, 'ACTIVE')
    await mockClaimOnce(page, claimCounter)
    await mockAppleOAuthAuthorizeReturn(page, APPLE_EMAIL)

    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
    expect(claimCounter.count).toBe(0)
  })

  test('E2E 4 — Apple sign-in with no entitlement and no context shows B10', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockSupabaseAuthenticatedUser(page, APPLE_EMAIL)
    await mockEntitlement(page, 'NONE')
    await mockContextGet(page, () => 'NONE')
    await mockAppleOAuthAuthorizeReturn(page, APPLE_EMAIL)

    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Verify my order' })).toBeVisible()
  })

  test('E2E 5 — Apple initiation failure keeps Google and email/password usable', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockVerifyEligible(page)
    await mockStatefulActivationContext(page)
    await mockAppleOAuthAuthorizeReturn(page, APPLE_EMAIL, { fail: true })

    await reachProgressiveAccountSetup(page)
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page).toHaveURL(/\/activate/)
    await expect(page.getByLabel('Email Address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
    await expect(page.getByText(ACCESS_TEXT)).toHaveCount(0)
  })

  test('E2E 6 — Hide My Email style relay address uses normal resolver (no merge UI)', async ({
    page,
  }) => {
    const claimCounter = { count: 0 }
    await mockSupabaseAuthBootstrap(page)
    await mockSupabaseAuthenticatedUser(page, RELAY_EMAIL)
    await mockEntitlement(page, 'NONE')
    await mockContextGet(page, () => 'NONE')
    await mockClaimOnce(page, claimCounter)
    await mockAppleOAuthAuthorizeReturn(page, RELAY_EMAIL)

    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Continue with Apple' }).click()

    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()
    expect(claimCounter.count).toBe(0)
    await expect(page.getByText(/merge|link account/i)).toHaveCount(0)
  })
})
