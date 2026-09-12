import { expect, test } from '@playwright/test'

test.describe('Amazon order ID key repeat', () => {
  test('keydown repeat events enter repeated digits', async ({ page }) => {
    await page.goto('/activate')

    const field = page.getByLabel('Amazon order number')
    await field.press('0')

    await field.evaluate((input) => {
      for (let index = 0; index < 3; index++) {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: '0', repeat: true, bubbles: true }),
        )
      }
    })

    await expect(field).toHaveValue('000-0')
    await expect(page.getByText('4/17 digits')).toBeVisible()
  })
})
