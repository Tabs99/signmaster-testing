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

/**
 * Seeds a confirmed Supabase session into localStorage so the app boots
 * authenticated — mirroring the recovery session Supabase establishes from a
 * password-recovery link (detectSessionInUrl). The far-future `expires_at`
 * keeps supabase-js from attempting a network refresh.
 */
export async function seedConfirmedSession(page: Page, email: string) {
  await page.addInitScript(
    ({ email }) => {
      const session = {
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 9999999999,
        refresh_token: 'test-refresh-token',
        user: {
          id: '00000000-0000-4000-8000-000000000010',
          aud: 'authenticated',
          role: 'authenticated',
          email,
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }
      window.localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
    },
    { email },
  )
}

export async function mockSupabasePasswordRecover(
  page: Page,
  status = 200,
  counter?: { count: number },
) {
  await page.route('**/auth/v1/recover**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (counter) {
      counter.count += 1
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(status === 200 ? {} : { message: 'error' }),
    })
  })
}

export async function mockSupabaseUpdateUserSuccess(
  page: Page,
  email: string,
  counter?: { count: number },
  delayMs = 0,
) {
  await page.route('**/auth/v1/user**', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }

    if (counter) {
      counter.count += 1
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000010',
        email,
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
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
