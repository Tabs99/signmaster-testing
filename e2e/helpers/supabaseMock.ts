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

const RECOVERY_USER_ID = '00000000-0000-4000-8000-000000000010'

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * Builds a URL hash that supabase-js (implicit flow, detectSessionInUrl) parses
 * as a password-recovery entry, causing it to emit the `PASSWORD_RECOVERY`
 * auth event — the genuine recovery authority. The access token is a decode-only
 * JWT (unsigned); the mocked `GET /auth/v1/user` supplies the user object.
 */
export function buildRecoveryHash(email: string): string {
  const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
    sub: RECOVERY_USER_ID,
    email,
    aud: 'authenticated',
    role: 'authenticated',
    exp: 9999999999,
  })}.signature`

  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: 'test-recovery-refresh-token',
    expires_in: '3600',
    token_type: 'bearer',
    type: 'recovery',
  })

  return `#${params.toString()}`
}

/**
 * Handles the Supabase `/auth/v1/user` endpoint for recovery-driven tests:
 * GET returns the recovery user (used while establishing the session from the
 * recovery hash); PUT returns the updated user (the `updatePassword` call).
 */
export async function mockSupabaseRecoveryUserEndpoint(
  page: Page,
  email: string,
  options: { updateCounter?: { count: number }; updateDelayMs?: number } = {},
) {
  const user = {
    id: RECOVERY_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  }

  await page.route('**/auth/v1/user**', async (route) => {
    const method = route.request().method()

    if (method === 'PUT') {
      if (options.updateCounter) {
        options.updateCounter.count += 1
      }
      if (options.updateDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.updateDelayMs))
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      })
      return
    }

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      })
      return
    }

    await route.continue()
  })
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

/**
 * Mocks Supabase's sign-out endpoint so `authService.signOut()` (used by the
 * B10 "Use another account" action) resolves cleanly and supabase-js clears the
 * persisted session from localStorage without a real network call.
 */
export async function mockSupabaseSignOut(page: Page) {
  await page.route('**/auth/v1/logout**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({ status: 204, contentType: 'application/json', body: '' })
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
