import { expect, test } from './helpers/dashboardFixture'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'
import {
  expectProgressiveAccountSetupOnActivate,
  mockStatefulActivationContext,
} from './helpers/progressiveActivation'
import {
  mockClipboardReadText,
  mockClipboardReadTextRejection,
} from './helpers/orderIdClipboard'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_ORDER_DIGITS = '20512345671234567'
const OVERLONG_CLIPBOARD = `${FIXTURE_ORDER_DIGITS}999`

function mockVerifyEligibleOnce(page: import('@playwright/test').Page) {
  let verifyCalls = 0
  page.route('**/api/activation/verify', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    verifyCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ELIGIBLE' }),
    })
  })
  return () => verifyCalls
}

test.describe('Order ID clipboard UX (CP7)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('E2E 1 — Paste valid Order ID auto-verifies once and reaches progressive setup', async ({
    page,
  }) => {
    await mockClipboardReadText(page, FIXTURE_ORDER_DIGITS)
    await mockStatefulActivationContext(page)
    const getVerifyCalls = mockVerifyEligibleOnce(page)
    await page.goto('/activate')

    await page.getByRole('button', { name: 'Paste' }).click()

    const field = page.getByLabel('Amazon order number')
    await expect(field).toHaveValue(FIXTURE_ORDER_ID)
    await expectProgressiveAccountSetupOnActivate(page)

    expect(getVerifyCalls()).toBe(1)
    await expect(page).toHaveURL(/\/activate$/)
    expect(page.url()).not.toMatch(FIXTURE_ORDER_DIGITS)
  })

  test('E2E 2 — overlong dedicated Paste leaves the field empty with an informational notice', async ({
    page,
  }) => {
    await mockClipboardReadText(page, OVERLONG_CLIPBOARD)
    const getVerifyCalls = mockVerifyEligibleOnce(page)
    await page.goto('/activate')

    await page.getByRole('button', { name: 'Paste' }).click()

    await expect(page.getByLabel('Amazon order number')).toHaveValue('')
    await expect(page.getByRole('status')).toContainText(
      'No Amazon Order ID found in your clipboard.',
    )
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('activation-account-setup')).toHaveCount(0)

    expect(getVerifyCalls()).toBe(0)
  })

  test('E2E 2b — incomplete dedicated Paste does not format partial digits into the field', async ({
    page,
  }) => {
    await mockClipboardReadText(page, '123456')
    const getVerifyCalls = mockVerifyEligibleOnce(page)
    await page.goto('/activate')

    await page.getByRole('button', { name: 'Paste' }).click()

    await expect(page.getByLabel('Amazon order number')).toHaveValue('')
    await expect(page.getByRole('status')).toContainText(
      'No Amazon Order ID found in your clipboard.',
    )
    expect(getVerifyCalls()).toBe(0)
  })

  test('E2E 2c — invalid dedicated Paste preserves an existing Order ID value', async ({
    page,
  }) => {
    await mockClipboardReadText(page, '123456')
    await page.goto('/activate')

    const field = page.getByLabel('Amazon order number')
    await field.fill(FIXTURE_ORDER_ID)
    await page.getByRole('button', { name: 'Paste' }).click()

    await expect(field).toHaveValue(FIXTURE_ORDER_ID)
    await expect(page.getByRole('status')).toContainText(
      'No Amazon Order ID found in your clipboard.',
    )
  })

  test('E2E 3 — clipboard failure keeps manual entry usable', async ({ page }) => {
    await mockClipboardReadTextRejection(page)
    await page.goto('/activate')

    const field = page.getByLabel('Amazon order number')
    await page.getByRole('button', { name: 'Paste' }).click()

    await expect(page.getByRole('status')).toContainText(/Couldn't read your clipboard/i)
    await expect(field).toBeEnabled()
    await expect(field).toHaveValue('')

    await field.fill(FIXTURE_ORDER_ID)
    await expect(field).toHaveValue(FIXTURE_ORDER_ID)
  })

  test('E2E 4 — Show me where is keyboard reachable without verification', async ({ page }) => {
    let verifyCalls = 0
    await page.route('**/api/activation/verify', async (route) => {
      verifyCalls += 1
      await route.continue()
    })
    await page.goto('/activate')

    const showMeWhere = page.getByRole('button', { name: 'Show me where' })
    await showMeWhere.focus()
    await page.keyboard.press('Enter')

    await expect(
      page.getByRole('dialog', { name: 'Finding your Amazon order number' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/activate$/)
    expect(verifyCalls).toBe(0)
  })
})
