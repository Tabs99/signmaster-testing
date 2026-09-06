import type { ActivationContextResolutionStatus } from '../api/activationContextApi.ts'

export type ActivationResumeIntent = 'create_account' | 'sign_in' | 'generic'

export type ActivationResumeState =
  | 'valid_context'
  | 'expired_context'
  | 'no_context'
  | 'valid_context_unconfirmed_auth'
  | 'valid_context_confirmed_auth'
  | 'confirmed_auth_no_context'
  | 'signed_out_valid_context'

export interface ActivationResumeAuthState {
  isAuthenticated: boolean
  isEmailConfirmed: boolean
}

export interface ResolveActivationResumeInput {
  contextStatus: ActivationContextResolutionStatus
  auth: ActivationResumeAuthState
  intent?: ActivationResumeIntent
}

export function resolveActivationResumeState(
  input: ResolveActivationResumeInput,
): ActivationResumeState {
  const { contextStatus, auth, intent = 'generic' } = input

  if (contextStatus === 'EXPIRED') {
    return 'expired_context'
  }

  if (contextStatus === 'NONE') {
    if (auth.isAuthenticated && auth.isEmailConfirmed) {
      return 'confirmed_auth_no_context'
    }

    return 'no_context'
  }

  if (auth.isAuthenticated && auth.isEmailConfirmed) {
    return 'valid_context_confirmed_auth'
  }

  if (auth.isAuthenticated && !auth.isEmailConfirmed) {
    return 'valid_context_unconfirmed_auth'
  }

  if (intent === 'sign_in') {
    return 'signed_out_valid_context'
  }

  return 'valid_context'
}
