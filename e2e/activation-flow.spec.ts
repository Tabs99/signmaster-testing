import { expect, test } from '@playwright/test'

/**
 * Smoke coverage for the CURRENT prototype behaviour of the SignMaster app.
 *
 * These tests intentionally exercise the existing localStorage-backed
 * activation/account prototype (Order ID + postcode). They do not assume the
 * future /api/activation or Supabase integration described in ARCHITECTURE.md.
 *
 * Valid prototype inputs (see the validation utils under src/features):
 *  - Order ID matching the pattern 3-7-7 digits that does not start with "000"
 *  - UK postcode that does not start with "XX"
 *  - Email without "+exists", password >= 8 chars with a number/symbol
 */

const VALID_ORDER_ID = '202-1234567-8901234'
const VALID_POSTCODE = 'SW1A 1AA'
const VALID_EMAIL = 'e2e-user@example.com'
const VALID_PASSWORD = 'Password1'

// Simulated verification/account delays are ~1.8s each; allow generous headroom.
const STEP_TRANSITION_TIMEOUT = 10_000

test.describe('SignMaster prototype activation flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads and shows the activation screen', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Verify Your Purchase' }),
    ).toBeVisible()

    await expect(page.getByLabel('Amazon Order ID')).toBeVisible()
    await expect(page.getByLabel('Delivery Postcode')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Verify Order & Continue' }),
    ).toBeVisible()
  })

  test('progresses through the prototype activation and account creation flow', async ({
    page,
  }) => {
    // Step 1: activation
    await expect(
      page.getByRole('heading', { name: 'Verify Your Purchase' }),
    ).toBeVisible()

    await page.getByLabel('Amazon Order ID').fill(VALID_ORDER_ID)
    await page.getByLabel('Delivery Postcode').fill(VALID_POSTCODE)

    const verifyButton = page.getByRole('button', {
      name: 'Verify Order & Continue',
    })
    await expect(verifyButton).toBeEnabled()
    await verifyButton.click()

    // Step 2: account creation
    await expect(
      page.getByRole('heading', { name: 'Create your SignMaster account' }),
    ).toBeVisible({ timeout: STEP_TRANSITION_TIMEOUT })

    await page.getByLabel('Email Address').fill(VALID_EMAIL)
    await page.getByLabel('Create Password').fill(VALID_PASSWORD)
    await page.getByLabel('Confirm Password').fill(VALID_PASSWORD)

    const createButton = page.getByRole('button', {
      name: 'Create Account & Continue',
    })
    await expect(createButton).toBeEnabled()
    await createButton.click()

    // Step 3: completion
    await expect(
      page.getByText('Account created!'),
    ).toBeVisible({ timeout: STEP_TRANSITION_TIMEOUT })
    await expect(
      page.getByText('Welcome to SignMaster. Your companion app is ready.'),
    ).toBeVisible()
  })
})
