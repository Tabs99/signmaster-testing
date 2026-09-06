import type { Page } from '@playwright/test'

export async function mockSupabaseAuthBootstrap(page: Page) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    })
  })
}

export async function mockSupabaseSignUpSuccess(page: Page, email: string) {
  await page.route('**/auth/v1/signup**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email,
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    })
  })
}

export async function mockSupabaseSignInSuccess(page: Page, email: string) {
  await page.route('**/auth/v1/token**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        user: {
          id: '00000000-0000-4000-8000-000000000002',
          email,
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    })
  })
}
