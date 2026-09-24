import { expect, test, type Page, DASHBOARD_HEADING } from './helpers/dashboardFixture'
import { mockSupabaseAuthBootstrap, seedConfirmedSession } from './helpers/supabaseMock'
import {
  expectProgressiveAccountSetupOnActivate,
  mockStatefulActivationContext,
} from './helpers/progressiveActivation'
import { mockClipboardReadText } from './helpers/orderIdClipboard'

const FIXTURE_ORDER_ID = '205-1234567-1234567'
const FIXTURE_ORDER_DIGITS = '2051234567123456' // formatting-agnostic substring guard (16 digits)
const FIXTURE_ORDER_ID_RAW_17 = '20512345671234567'
const CONTEXT_COOKIE_NAME = 'sm_activation_ctx'
const CONTEXT_TOKEN_VALUE = 'opaque-privacy-test-token'
const APP_EMAIL = 'privacy-e2e-fixture@example.invalid'
const ACCESS_TEXT = DASHBOARD_HEADING

function mockVerifyEligible(page: Page) {
  return page.route('**/api/activation/verify', async (route) => {
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
}

function mockActivationContextRoutes(page: Page) {
  let hasContext = false
  return page.route('**/api/activation/context', async (route) => {
    if (route.request().method() === 'POST') {
      hasContext = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Set-Cookie': `${CONTEXT_COOKIE_NAME}=${CONTEXT_TOKEN_VALUE}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
        },
        body: JSON.stringify({ status: 'CREATED' }),
      })
      return
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: hasContext ? 'VALID' : 'NONE' }),
      })
      return
    }
    await route.continue()
  })
}

async function readBrowserStorage(page: Page) {
  return page.evaluate(() => {
    const dump = (storage: Storage) => {
      const entries: Array<[string, string]> = []
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)
        if (key) {
          entries.push([key, storage.getItem(key) ?? ''])
        }
      }
      return entries
    }
    return {
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
      cookie: document.cookie,
      url: window.location.href,
    }
  })
}

test.describe('SignMaster privacy & security browser audit', () => {
  test('no raw Order ID, activation token, or context cookie is exposed to the browser after verify', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockVerifyEligible(page)
    await mockActivationContextRoutes(page)

    await page.goto('/activate')
    // A complete valid Order ID auto-verifies after a short debounce.
    await page.getByLabel('Amazon order number').fill(FIXTURE_ORDER_ID)
    await expect(page.getByTestId('activation-account-setup')).toBeVisible()
    await expect(page).toHaveURL(/\/activate$/)

    const storage = await readBrowserStorage(page)

    // The Order ID must never appear in the URL after verification.
    expect(storage.url).not.toContain(FIXTURE_ORDER_ID)
    expect(storage.url).not.toContain(FIXTURE_ORDER_DIGITS)

    // No browser storage value may carry the Order ID or the activation-context
    // token — activation authority stays server-side only.
    const allValues = [...storage.local, ...storage.session]
      .map(([, value]) => value)
      .join('\n')
    expect(allValues).not.toContain(FIXTURE_ORDER_ID)
    expect(allValues).not.toContain(FIXTURE_ORDER_DIGITS)
    expect(allValues).not.toContain(CONTEXT_TOKEN_VALUE)

    // No storage key implies a browser-side activation/entitlement authority
    // (the legacy `signmaster_activated` prototype flag must be gone).
    const allKeys = [...storage.local, ...storage.session].map(([key]) => key.toLowerCase())
    for (const key of allKeys) {
      expect(key).not.toContain('entitlement')
      expect(key).not.toContain('signmaster_activated')
      expect(key).not.toContain('activation_ctx')
    }

    // The HttpOnly activation-context token is not readable by JavaScript.
    expect(storage.cookie).not.toContain(CONTEXT_COOKIE_NAME)
    expect(storage.cookie).not.toContain(CONTEXT_TOKEN_VALUE)
  })

  test('Paste button path does not persist Order ID in browser storage or URL', async ({
    page,
  }) => {
    await mockSupabaseAuthBootstrap(page)
    await mockVerifyEligible(page)
    await mockStatefulActivationContext(page)
    await mockClipboardReadText(page, FIXTURE_ORDER_ID_RAW_17)

    await page.goto('/activate')
    await page.getByRole('button', { name: 'Paste' }).click()
    await expect(page.getByLabel('Amazon order number')).toHaveValue(FIXTURE_ORDER_ID)
    await expectProgressiveAccountSetupOnActivate(page)

    const storage = await readBrowserStorage(page)
    expect(storage.url).not.toContain(FIXTURE_ORDER_ID)
    expect(storage.url).not.toContain(FIXTURE_ORDER_DIGITS)
    const allValues = [...storage.local, ...storage.session].map(([, value]) => value).join('\n')
    expect(allValues).not.toContain(FIXTURE_ORDER_ID)
    expect(allValues).not.toContain(FIXTURE_ORDER_DIGITS)
  })

  test('entitlement check sends only the bearer token — no user id in the URL or body', async ({
    page,
  }) => {
    await seedConfirmedSession(page, APP_EMAIL)

    let capturedUrl = ''
    let capturedMethod = ''
    let capturedAuth: string | undefined
    let capturedBody: string | null = null

    await page.route('**/api/entitlement/me', async (route) => {
      const request = route.request()
      capturedUrl = request.url()
      capturedMethod = request.method()
      capturedAuth = request.headers()['authorization']
      capturedBody = request.postData()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
    })

    await page.goto('/app')
    await expect(page.getByText(ACCESS_TEXT)).toBeVisible()

    expect(capturedMethod).toBe('GET')
    // Path only — no query string that could smuggle a browser-chosen user id.
    expect(capturedUrl).toMatch(/\/api\/entitlement\/me$/)
    expect(capturedAuth).toMatch(/^Bearer .+/)
    expect(capturedBody).toBeNull()
  })
})
