import { expect, test } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'

const EDGE_TOLERANCE_PX = 2

async function openSupportHelpSection(page: import('@playwright/test').Page) {
  await page.goto('/activate')
  await page.getByRole('button', { name: 'Get support' }).click()
  await expect(
    page.getByRole('dialog', { name: 'SignMaster activation help' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'I still need help' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
}

test.describe('Help sheet support email Copy layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
  })

  test('Copy action is grouped inside the row with a left divider and no nested box', async ({
    page,
  }) => {
    await openSupportHelpSection(page)

    const row = page.getByTestId('help-support-email-row')
    const copy = page.getByTestId('help-support-copy-button')

    await expect(row).toBeVisible()
    await expect(copy).toBeVisible()
    await expect(copy).toHaveText('Copy')

    const layout = await row.evaluate((rowEl) => {
      const copyEl = rowEl.querySelector('[data-testid="help-support-copy-button"]')
      if (!(copyEl instanceof HTMLElement)) {
        return null
      }
      const rowRect = rowEl.getBoundingClientRect()
      const copyRect = copyEl.getBoundingClientRect()
      const copyStyles = window.getComputedStyle(copyEl)
      return {
        topInset: copyRect.top - rowRect.top,
        bottomInset: rowRect.bottom - copyRect.bottom,
        rightInset: rowRect.right - copyRect.right,
        borderTop: copyStyles.borderTopWidth,
        borderRight: copyStyles.borderRightWidth,
        borderBottom: copyStyles.borderBottomWidth,
        borderLeft: copyStyles.borderLeftWidth,
      }
    })

    expect(layout).not.toBeNull()
    expect(layout!.topInset).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(layout!.bottomInset).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(layout!.rightInset).toBeLessThanOrEqual(EDGE_TOLERANCE_PX)
    expect(parseFloat(layout!.borderLeft)).toBeGreaterThan(0)
    expect(parseFloat(layout!.borderTop)).toBe(0)
    expect(parseFloat(layout!.borderRight)).toBe(0)
    expect(parseFloat(layout!.borderBottom)).toBe(0)
  })

  test('Copy still copies the support email address', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSupportHelpSection(page)

    await page.getByTestId('help-support-copy-button').click()
    await expect(page.getByTestId('help-support-copy-button')).toHaveText('Copied')
  })
})
