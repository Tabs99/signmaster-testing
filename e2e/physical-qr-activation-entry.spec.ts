import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'
import { mockActivationContextAlwaysValid } from './helpers/progressiveActivation'

/** Heading on the Step 1 activation entry screen (direct `/activate` deep link). */
const ACTIVATION_ENTRY_HEADING = 'Unlock your SignMaster app'

function mockActivationContextGet(
  page: Page,
  status: 'VALID' | 'EXPIRED' | 'NONE',
) {
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

/** Asserts the behaviour of a fresh QR deep link: `/activate` with no query params. */
async function expectPhysicalQrActivationEntry(page: Page) {
  await expect(page).toHaveURL(/\/activate$/)
  await expect(
    page.getByRole('heading', { name: ACTIVATION_ENTRY_HEADING }),
  ).toBeVisible()

  const orderField = page.getByLabel('Amazon order number')
  await expect(orderField).toBeVisible()
  await expect(orderField).toBeEnabled()

  const url = new URL(page.url())
  expect(url.pathname).toBe('/activate')
  expect(url.search).toBe('')
  expect(url.hash).toBe('')
}

test.describe('physical QR activation entry', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('QR E2E 1 — fresh customer lands on activation entry with no session or context', async ({
    page,
  }) => {
    await mockActivationContextGet(page, 'NONE')
    await page.goto('/activate')
    await expectPhysicalQrActivationEntry(page)
  })

  test('QR E2E 2 — direct deep-link refresh keeps activation usable', async ({ page }) => {
    await mockActivationContextGet(page, 'NONE')
    await page.goto('/activate')
    await expectPhysicalQrActivationEntry(page)

    await page.reload()
    await expectPhysicalQrActivationEntry(page)
  })

  test('QR E2E 3 — VALID activation context resumes progressive setup on direct /activate', async ({
    page,
  }) => {
    await mockActivationContextAlwaysValid(page)
    await page.goto('/activate')

    await expect(page).toHaveURL(/\/activate$/)
    await expect(page.getByTestId('activation-account-setup')).toBeVisible()
    await expect(page.getByText('Order verified')).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: 'Create your account to unlock your companion app.',
      }),
    ).toBeVisible()
  })

  test('EXPIRED activation context on direct /activate shows entry form without resume', async ({
    page,
  }) => {
    await mockActivationContextGet(page, 'EXPIRED')
    await page.goto('/activate')
    await expectPhysicalQrActivationEntry(page)
    await expect(page.getByTestId('activation-account-setup')).toHaveCount(0)
  })
})
