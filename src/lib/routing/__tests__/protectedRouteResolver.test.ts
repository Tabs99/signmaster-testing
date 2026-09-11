import { describe, expect, it } from 'vitest'
import {
  resolveProtectedRouteState,
  type ActivationContextPhase,
  type EntitlementPhase,
  type ProtectedRouteResolverInput,
} from '../protectedRouteResolver.ts'

function input(
  overrides: Partial<ProtectedRouteResolverInput> = {},
): ProtectedRouteResolverInput {
  return {
    authInitializing: false,
    isAuthenticated: true,
    entitlement: { kind: 'idle' },
    activationContext: { kind: 'idle' },
    ...overrides,
  }
}

describe('resolveProtectedRouteState', () => {
  it('returns checking_auth while auth is initialising (even if entitlement looks active)', () => {
    expect(
      resolveProtectedRouteState(
        input({ authInitializing: true, entitlement: { kind: 'active' } }),
      ),
    ).toBe('checking_auth')
  })

  it('returns signed_out when not authenticated', () => {
    expect(
      resolveProtectedRouteState(input({ isAuthenticated: false })),
    ).toBe('signed_out')
  })

  it.each<EntitlementPhase>([{ kind: 'idle' }, { kind: 'loading' }])(
    'returns checking_entitlement while entitlement is %j',
    (entitlement) => {
      expect(resolveProtectedRouteState(input({ entitlement }))).toBe(
        'checking_entitlement',
      )
    },
  )

  it('returns active when entitlement is active', () => {
    expect(
      resolveProtectedRouteState(input({ entitlement: { kind: 'active' } })),
    ).toBe('active')
  })

  it('treats a backend-rejected token (unauthenticated) as signed_out', () => {
    expect(
      resolveProtectedRouteState(input({ entitlement: { kind: 'unauthenticated' } })),
    ).toBe('signed_out')
  })

  it('returns retryable_error when the entitlement lookup failed', () => {
    expect(
      resolveProtectedRouteState(input({ entitlement: { kind: 'error' } })),
    ).toBe('retryable_error')
  })

  it.each<ActivationContextPhase>([{ kind: 'idle' }, { kind: 'loading' }])(
    'returns checking_activation_context for entitlement none while context is %j',
    (activationContext) => {
      expect(
        resolveProtectedRouteState(
          input({ entitlement: { kind: 'none' }, activationContext }),
        ),
      ).toBe('checking_activation_context')
    },
  )

  it('returns resume_activation for entitlement none + resumable context', () => {
    expect(
      resolveProtectedRouteState(
        input({
          entitlement: { kind: 'none' },
          activationContext: { kind: 'resumable' },
        }),
      ),
    ).toBe('resume_activation')
  })

  it('returns activation_required for entitlement none + not-resumable context', () => {
    expect(
      resolveProtectedRouteState(
        input({
          entitlement: { kind: 'none' },
          activationContext: { kind: 'not_resumable' },
        }),
      ),
    ).toBe('activation_required')
  })

  it('returns retryable_error for entitlement none + context lookup error', () => {
    expect(
      resolveProtectedRouteState(
        input({
          entitlement: { kind: 'none' },
          activationContext: { kind: 'error' },
        }),
      ),
    ).toBe('retryable_error')
  })
})
