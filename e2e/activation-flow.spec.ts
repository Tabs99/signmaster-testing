import { expect, test } from '@playwright/test'

/**
 * Task 1 smoke coverage for the static Keyline Step 1 activation screen.
 * Real verification integration is covered in Task 2.
 */

test.describe('SignMaster activation Step 1 (static)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads the approved Step 1 screen without postcode', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Unlock your SignMaster app' }),
    ).toBeVisible()

    await expect(page.getByLabel('Amazon order number')).toBeVisible()
    await expect(page.getByLabel(/postcode/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Check my order' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show me where' })).toBeVisible()
  })

  test('opens and closes the help sheet', async ({ page }) => {
    await page.getByRole('button', { name: 'Show me where' }).click()

    await expect(
      page.getByRole('dialog', { name: 'Finding your Amazon order number' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Back to activation' }).click()

    await expect(
      page.getByRole('dialog', { name: 'Finding your Amazon order number' }),
    ).toHaveCount(0)
  })
})
