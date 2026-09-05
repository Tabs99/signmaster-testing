import { expect, test } from '@playwright/test'

const FIXTURE_ORDER_ID = '205-1234567-1234567'

async function fillValidOrderId(page: import('@playwright/test').Page) {
  await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
}

async function submitOrderCheck(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Check my order' }).click()
}

function mockVerifyRoute(
  page: import('@playwright/test').Page,
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

    await expect(page.getByRole('button', { name: 'Checking your order…' })).toBeVisible()
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
    const submit = page.getByRole('button', { name: 'Check my order' })
    await submit.click()
    await expect(page.getByRole('button', { name: 'Checking your order…' })).toBeVisible()
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
      page.getByText(
        'App access will be available once Amazon dispatches your order. Please try again after dispatch.',
      ),
    ).toBeVisible()
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

  test('retries NOT_SHIPPED when Check again is clicked', async ({ page }) => {
    let callCount = 0
    await page.route('**/api/activation/verify', async (route) => {
      callCount += 1
      const status = callCount === 1 ? 'NOT_SHIPPED' : 'ELIGIBLE'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status }),
      })
    })

    await fillValidOrderId(page)
    await submitOrderCheck(page)
    await expect(page.getByRole('heading', { name: 'Your order is confirmed' })).toBeVisible()

    await page.getByRole('button', { name: 'Check again' }).click()
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
