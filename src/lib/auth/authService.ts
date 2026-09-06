import type { SupabaseClient, User } from '@supabase/supabase-js'
import { mapAuthError, mapSignUpError } from './authErrors'
import { getBrowserSupabaseClient } from '../supabase/client'
import type {
  AuthSessionInfo,
  AuthUser,
  SignInResult,
  SignUpResult,
} from './types'

export interface AuthService {
  signUp(email: string, password: string): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<SignInResult>
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
    async signUp(email, password) {
      try {
        const client = deps.getClient()
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
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
