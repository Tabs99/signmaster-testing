import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
  categorisePasswordResetRequestError,
  categorisePasswordUpdateError,
  mapAuthError,
  mapSignUpError,
} from './authErrors'
import { getBrowserSupabaseClient } from '../supabase/client'
import { buildOAuthReturnUrl } from './oauthRedirect'
import type {
  AuthSessionInfo,
  AuthUser,
  GoogleSignInResult,
  PasswordResetRequestResult,
  PasswordUpdateResult,
  SignInResult,
  SignUpResult,
} from './types'

export interface GoogleSignInOptions {
  redirectTo?: string
}

export interface SignUpOptions {
  /**
   * Where Supabase should redirect after the user confirms their email. Used to
   * carry the opaque cross-device activation continuation reference so the
   * journey can resume on the confirming device.
   */
  emailRedirectTo?: string
}

export interface RequestPasswordResetOptions {
  /**
   * Dedicated app route Supabase should redirect the recovery email back to
   * (e.g. `${origin}/reset-password`). Carries no sensitive tokens or
   * activation identifiers — Supabase appends only the recovery session.
   */
  redirectTo?: string
}

export interface AuthService {
  signUp(
    email: string,
    password: string,
    options?: SignUpOptions,
  ): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<SignInResult>
  signInWithGoogle(options?: GoogleSignInOptions): Promise<GoogleSignInResult>
  requestPasswordReset(
    email: string,
    options?: RequestPasswordResetOptions,
  ): Promise<PasswordResetRequestResult>
  updatePassword(newPassword: string): Promise<PasswordUpdateResult>
  signOut(): Promise<void>
  getSession(): Promise<AuthSessionInfo | null>
  getCurrentUser(): Promise<AuthUser | null>
}

export interface AuthServiceDeps {
  getClient: () => SupabaseClient
}

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmed: Boolean(user.email_confirmed_at),
  }
}

function mapSession(user: User): AuthSessionInfo {
  return {
    user: mapUser(user),
  }
}

export function createAuthService(
  deps: AuthServiceDeps = { getClient: getBrowserSupabaseClient },
): AuthService {
  return {
    async signUp(email, password, options) {
      try {
        const client = deps.getClient()
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          ...(options?.emailRedirectTo
            ? { options: { emailRedirectTo: options.emailRedirectTo } }
            : {}),
        })

        if (error) {
          return {
            kind: 'error',
            error: mapSignUpError(error),
          }
        }

        if (!data.user) {
          return {
            kind: 'error',
            error: mapSignUpError(new Error('missing user')),
          }
        }

        const user = mapUser(data.user)

        if (user.emailConfirmed && data.session) {
          return {
            kind: 'success',
            user,
            session: mapSession(data.user),
          }
        }

        if (!user.emailConfirmed) {
          if (data.session) {
            await client.auth.signOut()
          }

          return {
            kind: 'email_confirmation_required',
            user,
          }
        }

        return {
          kind: 'email_confirmation_required',
          user,
        }
      } catch (error) {
        return {
          kind: 'error',
          error: mapSignUpError(error),
        }
      }
    },

    async signInWithGoogle(options) {
      try {
        const client = deps.getClient()
        const redirectTo = options?.redirectTo ?? buildOAuthReturnUrl()
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })

        if (error) {
          return {
            kind: 'error',
            error: mapAuthError(error),
          }
        }

        return { kind: 'redirect_initiated' }
      } catch (error) {
        return {
          kind: 'error',
          error: mapAuthError(error),
        }
      }
    },

    async signIn(email, password) {
      try {
        const client = deps.getClient()
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) {
          return {
            kind: 'error',
            error: mapAuthError(error),
          }
        }

        if (!data.user || !data.session) {
          return {
            kind: 'error',
            error: mapAuthError(new Error('missing session')),
          }
        }

        const user = mapUser(data.user)

        if (!user.emailConfirmed) {
          await client.auth.signOut()
          return {
            kind: 'error',
            error: mapAuthError(new Error('Email not confirmed')),
          }
        }

        return {
          kind: 'success',
          user,
          session: mapSession(data.user),
        }
      } catch (error) {
        return {
          kind: 'error',
          error: mapAuthError(error),
        }
      }
    },

    async requestPasswordReset(email, options) {
      try {
        const client = deps.getClient()
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          options?.redirectTo ? { redirectTo: options.redirectTo } : undefined,
        )

        if (error) {
          const category = categorisePasswordResetRequestError(error)
          return { kind: category }
        }

        return { kind: 'sent' }
      } catch (error) {
        const category = categorisePasswordResetRequestError(error)
        // A thrown value with no recognisable transient signal collapses to
        // `sent` so the request flow never reveals whether an account exists.
        return { kind: category }
      }
    },

    async updatePassword(newPassword) {
      try {
        const client = deps.getClient()
        const { data, error } = await client.auth.updateUser({
          password: newPassword,
        })

        if (error) {
          return { kind: categorisePasswordUpdateError(error) }
        }

        if (!data.user) {
          return { kind: 'invalid_recovery_session' }
        }

        return { kind: 'success', user: mapUser(data.user) }
      } catch (error) {
        return { kind: categorisePasswordUpdateError(error) }
      }
    },

    async signOut() {
      const client = deps.getClient()
      const { error } = await client.auth.signOut()
      if (error) {
        throw mapAuthError(error)
      }
    },

    async getSession() {
      const client = deps.getClient()
      const { data, error } = await client.auth.getSession()

      if (error) {
        throw mapAuthError(error)
      }

      const user = data.session?.user
      if (!user) {
        return null
      }

      return mapSession(user)
    },

    async getCurrentUser() {
      const client = deps.getClient()
      const { data, error } = await client.auth.getUser()

      if (error) {
        throw mapAuthError(error)
      }

      return data.user ? mapUser(data.user) : null
    },
  }
}

export const authService = createAuthService()
