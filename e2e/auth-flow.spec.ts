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

async function fillValidOrderId(page: Page) {
  await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
}

async function submitOrderCheck(page: Page) {
  await page.getByRole('button', { name: 'Check my order' }).click()
}

test.describe('SignMaster auth foundation', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('A5 Continue navigates to create-account', async ({ page }) => {
    await mockVerifyRoute(page, 'ELIGIBLE')
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

  test('create-account basic flow with mocked Supabase sign-up', async ({ page }) => {
    await mockSupabaseSignUpSuccess(page, AUTH_TEST_EMAIL)
    await page.goto('/create-account')

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.getByLabel('Create Password').fill(AUTH_TEST_PASSWORD)
    await page.getByLabel('Confirm Password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create Account & Continue' }).click()

    await expect(page.getByText('Account created!')).toBeVisible()
    await expect(page.getByText(/Activation will continue in a later step/i)).toBeVisible()
  })

  test('sign-in basic flow with mocked Supabase token exchange', async ({ page }) => {
    await mockSupabaseSignInSuccess(page, AUTH_TEST_EMAIL)
    await page.goto('/sign-in')

    await page.getByLabel('Email Address').fill(AUTH_TEST_EMAIL)
    await page.locator('#sign-in-password').fill(AUTH_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText("You're signed in")).toBeVisible()
    await expect(page.getByText(/companion app access is not unlocked yet/i)).toBeVisible()
  })
})
