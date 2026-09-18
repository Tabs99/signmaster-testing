import { expect, test, type Page } from '@playwright/test'
import {
  mockSupabaseAuthBootstrap,
  mockSupabaseSignInSuccess,
  seedConfirmedSession,
} from './helpers/supabaseMock'
import { mockStatefulActivationContext } from './helpers/progressiveActivation'

const EMAIL = 'keyboard-e2e-fixture@example.invalid'
const PASSWORD = 'Secure123!'
const ORDER_ID = '205-1234567-1234567'
const ACCESS_TEXT = 'SignMaster access is active.'
const B10_HEADING = 'Finish activating SignMaster'

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

function mockContext(page: Page, status: 'VALID' | 'NONE') {
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

test.describe('SignMaster keyboard accessibility', () => {
  test('Continue with Google is keyboard reachable on sign-in', async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)

    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Continue with Google' }).focus()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeFocused()
  })

  test('sign-in is completable with the keyboard only and routes to /app', async ({ page }) => {
    await mockSupabaseSignInSuccess(page, EMAIL)
    await mockEntitlement(page, 'ACTIVE')

    await page.goto('/sign-in')

    // Reach the email field and fill both inputs using only the keyboard.
    await page.getByLabel('Email Address').focus()
    await expect(page.getByLabel('Email Address')).toBeFocused()
    await page.keyboard.type(EMAIL)

    await page.keyboard.press('Tab')
    await expect(page.locator('#sign-in-password')).toBeFocused()
    await page.keyboard.type(PASSWORD)

    // Enter within the form submits without a pointer click on the button.
    await page.keyboard.press('Enter')

    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()
  })

  test('activation order entry is submittable with the keyboard only', async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockStatefulActivationContext(page)
    await page.route('**/api/activation/verify', async (route) => {
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

    await page.goto('/activate')

    const orderField = page.getByLabel('Amazon order number')
    await orderField.focus()
    await expect(orderField).toBeFocused()
    await page.keyboard.type(ORDER_ID)
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('activation-account-setup')).toBeVisible()
  })

  test('B10 primary action is keyboard-focusable and activates with Enter', async ({ page }) => {
    await seedConfirmedSession(page, EMAIL)
    await mockEntitlement(page, 'NONE')
    await mockContext(page, 'NONE')

    await page.goto('/app')
    await expect(page.getByRole('heading', { name: B10_HEADING })).toBeVisible()

    const verify = page.getByRole('button', { name: 'Verify my order' })
    await verify.focus()
    await expect(verify).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/activate$/)
  })
})
