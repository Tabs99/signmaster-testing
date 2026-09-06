import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { authService, type AuthService } from '../../../lib/auth/authService'
import type { AuthUser } from '../../../lib/auth/types'
import { getBrowserSupabaseClient } from '../../../lib/supabase/client'

export interface AuthContextValue {
  isInitializing: boolean
  user: AuthUser | null
  isAuthenticated: boolean
  signOut: () => Promise<void>
  /**
   * Re-reads the persisted Supabase session and updates the context user. Used
   * by the email-confirmation continuation so an "I've confirmed" re-check can
   * pick up a confirmation completed in another tab of the same browser without
   * a full reload. Optional so existing test doubles remain valid.
   */
  refresh?: () => Promise<AuthUser | null>
}

export interface AuthProviderProps {
  children: ReactNode
  authService?: AuthService
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmed: Boolean(user.email_confirmed_at),
  }
}

export function AuthProvider({
  children,
  authService: authServiceOverride = authService,
}: AuthProviderProps) {
  const [isInitializing, setIsInitializing] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let active = true
    let authEventSeen = false
    const client = getBrowserSupabaseClient()

    async function restoreSession() {
      try {
        const session = await authServiceOverride.getSession()
        if (active && !authEventSeen) {
          setUser(session?.user ?? null)
        }
      } catch {
        if (active && !authEventSeen) {
          setUser(null)
        }
      } finally {
        if (active) {
          setIsInitializing(false)
        }
      }
    }

    void restoreSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return
      }

      authEventSeen = true
      setUser(session?.user ? mapUser(session.user) : null)
      setIsInitializing(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [authServiceOverride])

  const signOut = useCallback(async () => {
    await authServiceOverride.signOut()
    setUser(null)
  }, [authServiceOverride])

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const session = await authServiceOverride.getSession()
      const nextUser = session?.user ?? null
      setUser(nextUser)
      return nextUser
    } catch {
      setUser(null)
      return null
    }
  }, [authServiceOverride])

  const isAuthenticated = Boolean(user?.emailConfirmed)

  const value = useMemo<AuthContextValue>(
    () => ({
      isInitializing,
      user,
      isAuthenticated,
      signOut,
      refresh,
    }),
    [isAuthenticated, isInitializing, refresh, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }

  return context
}
