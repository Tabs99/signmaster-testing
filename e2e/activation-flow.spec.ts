import { expect, test, type Page } from '@playwright/test'
import { mockSupabaseAuthBootstrap } from './helpers/supabaseMock'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const NOT_SHIPPED_FIXTURE_ORDER_ID = '222-2222222-2222222'
const NOT_SHIPPED_FIXTURE_DIGITS = '22222222222222222'

async function fillValidOrderId(page: Page) {
  await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
}

async function fillNotShippedFixtureOrderId(page: Page) {
  await page.getByLabel('Amazon order number').fill(NOT_SHIPPED_FIXTURE_DIGITS)
}

// Verification now starts automatically once a complete, valid Order ID is
// present (see fillValidOrderId / fillNotShippedFixtureOrderId). The manual
// "Check my order" button remains as an accessibility fallback and is covered
// by the ActivationStep1 unit tests; these E2E flows rely on auto-verification,
// which avoids racing the button as it is replaced by the checking state.
async function submitOrderCheck(_page: Page) {
  // Intentionally a no-op: a complete valid Order ID auto-verifies.
}

async function expectApprovedCheckingButton(page: Page) {
  const checkingButton = page.getByRole('button', { name: 'Checking your order…' })
  await expect(checkingButton).toBeVisible()
  await expect(checkingButton).toBeDisabled()
  await expect(checkingButton).toHaveAttribute('aria-busy', 'true')
  await expect(checkingButton.locator('svg[aria-hidden="true"]')).toBeVisible()
  return checkingButton
}

async function startEntryFormWatch(page: Page) {
  await page.evaluate(() => {
    window.__entryFormSeenDuringWatch = false
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="activation-entry-form"]')) {
        window.__entryFormSeenDuringWatch = true
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.__entryFormObserver = observer
  })
}

async function stopEntryFormWatch(page: Page) {
  return page.evaluate(() => {
    window.__entryFormObserver?.disconnect()
    return window.__entryFormSeenDuringWatch === true
  })
}

function mockVerifyRoute(
  page: Page,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return page.route('**/api/activation/verify', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(body),
    })
  })
}

test.describe('SignMaster activation verification', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabaseAuthBootstrap(page)
    await page.goto('/activate')
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

  test('posts the formatted order ID and shows loading before ELIGIBLE', async ({ page }) => {
    let releaseResponse: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })

    await page.route('**/api/activation/verify', async (route) => {
      expect(route.request().method()).toBe('POST')
      expect(route.request().postDataJSON()).toEqual({ orderId: FIXTURE_ORDER_ID })

      await responseGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ELIGIBLE' }),
      })
    })

    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expectApprovedCheckingButton(page)
    await expect(page.getByLabel('Amazon order number')).toBeDisabled()

    releaseResponse?.()
    await expect(page.getByRole('heading', { name: 'Your purchase is verified' })).toBeVisible()
  })

  test('blocks duplicate submission while checking', async ({ page }) => {
    let requestCount = 0
    await page.route('**/api/activation/verify', async (route) => {
      requestCount += 1
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ELIGIBLE' }),
      })
    })

    await fillValidOrderId(page)
    // Auto-verification starts once the complete valid Order ID is present.
    await expect(page.getByRole('button', { name: 'Checking your order…' })).toBeVisible()
    // Re-triggering while a verification is in flight must not duplicate it.
    await page.getByRole('button', { name: 'Checking your order…' }).click({ force: true })

    await page.waitForResponse('**/api/activation/verify')
    expect(requestCount).toBe(1)
  })

  test('shows NOT_FOUND result', async ({ page }) => {
    await mockVerifyRoute(page, 200, { status: 'NOT_FOUND' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(page.getByRole('heading', { name: "We can't verify that order" })).toBeVisible()
  })

  test('shows NOT_SHIPPED result', async ({ page }) => {
    await mockVerifyRoute(page, 200, { status: 'NOT_SHIPPED' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()
    await expect(
      page.getByText('App access will be available once Amazon dispatches your order.'),
    ).toBeVisible()
    await expect(page.getByText('Please try again after dispatch.')).toBeVisible()
  })

  test('NOT_SHIPPED Use another order returns to empty focused entry field', async ({ page }) => {
    await mockVerifyRoute(page, 200, { status: 'NOT_SHIPPED' })
    await fillNotShippedFixtureOrderId(page)
    await submitOrderCheck(page)

    const resultCard = page.getByTestId('activation-result-card')
    await expect(resultCard).toBeVisible()
    await expect(resultCard.getByRole('button', { name: 'Use another order' })).toBeVisible()
    await expect(resultCard.getByRole('button', { name: 'Get support' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Get support' })).toHaveCount(1)

    await resultCard.getByRole('button', { name: 'Use another order' }).click()

    const orderField = page.getByLabel('Amazon order number')
    await expect(orderField).toBeVisible()
    await expect(orderField).toHaveValue('')
    await expect(orderField).toBeFocused()
    await expect(page.getByTestId('activation-entry-form')).toBeVisible()
    await expect(page.getByTestId('activation-result-card')).toHaveCount(0)
  })

  test('shows ALREADY_CLAIMED result', async ({ page }) => {
    await mockVerifyRoute(page, 200, { status: 'ALREADY_CLAIMED' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(
      page.getByRole('heading', { name: 'This order has already been used' }),
    ).toBeVisible()
  })

  test('shows service unavailable for server ERROR', async ({ page }) => {
    await mockVerifyRoute(page, 500, { status: 'ERROR' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(
      page.getByRole('heading', { name: "We can't check your order right now" }),
    ).toBeVisible()
  })

  test('shows CANCELLED result and clears the field after Try another Order ID', async ({
    page,
  }) => {
    await mockVerifyRoute(page, 200, { status: 'CANCELLED' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(
      page.getByRole('heading', { name: 'That order was cancelled' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Try another Order ID' }).click()
    await expect(page.getByLabel('Amazon order number')).toHaveValue('')
  })

  test('shows RETURNED result', async ({ page }) => {
    await mockVerifyRoute(page, 200, { status: 'RETURNED' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(page.getByRole('heading', { name: 'That pack was returned' })).toBeVisible()
  })

  test('shows rate-limited result with Check again disabled without Retry-After', async ({
    page,
  }) => {
    await mockVerifyRoute(page, 429, { error: 'RATE_LIMITED' })
    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(page.getByRole('heading', { name: "Let's give that a moment" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check again' })).toBeDisabled()
  })

  test('NOT_SHIPPED retry keeps stable result card during checking', async ({ page }) => {
    let callCount = 0
    let releaseRetry: (() => void) | undefined
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve
    })
    let secondRequestReceived = false

    await page.route('**/api/activation/verify', async (route) => {
      expect(route.request().method()).toBe('POST')
      callCount += 1

      if (callCount === 1) {
        expect(route.request().postDataJSON()).toEqual({
          orderId: NOT_SHIPPED_FIXTURE_ORDER_ID,
        })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'NOT_SHIPPED' }),
        })
        return
      }

      expect(route.request().postDataJSON()).toEqual({
        orderId: NOT_SHIPPED_FIXTURE_ORDER_ID,
      })
      secondRequestReceived = true
      await retryGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'NOT_SHIPPED' }),
      })
    })

    await fillNotShippedFixtureOrderId(page)
    await submitOrderCheck(page)
    const resultCard = page.getByTestId('activation-result-card')
    await expect(resultCard).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()

    await startEntryFormWatch(page)
    await page.getByRole('button', { name: 'Check again' }).click()

    await expect.poll(() => secondRequestReceived).toBe(true)
    expect(callCount).toBe(2)

    await expect(resultCard).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()
    await expect(
      page.getByText('App access will be available once Amazon dispatches your order.'),
    ).toBeVisible()
    await expect(page.getByTestId('activation-entry-form')).toHaveCount(0)
    await expect(page.getByLabel('Amazon order number')).toHaveCount(0)
    await expect(page.getByText(NOT_SHIPPED_FIXTURE_ORDER_ID)).toBeVisible()

    const checkingButton = await expectApprovedCheckingButton(page)
    await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0)

    await checkingButton.click({ force: true })
    expect(callCount).toBe(2)

    expect(await stopEntryFormWatch(page)).toBe(false)

    releaseRetry!()
    await expect(resultCard).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
    expect(callCount).toBe(2)
  })

  test('retries NOT_SHIPPED when Check again is clicked and can reach ELIGIBLE', async ({
    page,
  }) => {
    let callCount = 0
    let releaseRetry: (() => void) | undefined
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve
    })

    await page.route('**/api/activation/verify', async (route) => {
      callCount += 1
      if (callCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'NOT_SHIPPED' }),
        })
        return
      }

      await retryGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ELIGIBLE' }),
      })
    })

    await fillValidOrderId(page)
    await submitOrderCheck(page)
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()

    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByLabel('Amazon order number')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()
    await expectApprovedCheckingButton(page)
    await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0)

    releaseRetry!()
    await expect(page.getByRole('heading', { name: 'Your purchase is verified' })).toBeVisible()
    expect(callCount).toBe(2)
  })

  test('shows connection failure when verify route aborts', async ({ page }) => {
    await page.route('**/api/activation/verify', async (route) => {
      await route.abort('failed')
    })

    await fillValidOrderId(page)
    await submitOrderCheck(page)

    await expect(page.getByRole('heading', { name: "We couldn't connect" })).toBeVisible()
  })
})
