import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivationAccountSetup from '../components/ActivationAccountSetup'
import { AUTH_MESSAGES } from '../../../lib/auth/types'
import type { SignUpResult } from '../types'

vi.mock('../../../lib/api/activationContextApi', () => ({
  resolveActivationContext: vi.fn(),
}))

vi.mock('../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

vi.mock('../../activation/hooks/useActivationClaimWhenReady', () => ({
  useActivationClaimWhenReady: vi.fn(() => ({ state: { kind: 'idle' }, retry: vi.fn() })),
}))

import { resolveActivationContext } from '../../../lib/api/activationContextApi'
import { useAuthContext } from '../../auth/context/AuthProvider'
import { useActivationClaimWhenReady } from '../../activation/hooks/useActivationClaimWhenReady'

const mockResolveActivationContext = vi.mocked(resolveActivationContext)
const mockUseAuthContext = vi.mocked(useAuthContext)
const mockUseActivationClaimWhenReady = vi.mocked(useActivationClaimWhenReady)

const VALID_CONTEXT_RESOLUTION = {
  status: 'VALID' as const,
  isLoading: false,
  error: false,
  retry: vi.fn(),
}

async function fillValidAccountForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email Address'), 'alex@example.invalid')
  await user.type(screen.getByLabelText('Create Password'), 'Secure123!')
  await user.type(screen.getByLabelText('Confirm Password'), 'Secure123!')
}

describe('ActivationAccountSetup (Checkpoint 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveActivationContext.mockResolvedValue({
      kind: 'status',
      status: 'VALID',
    })
    mockUseAuthContext.mockReturnValue({
      isInitializing: false,
      isAuthenticated: false,
      user: null,
      signOut: vi.fn(),
      refresh: vi.fn(),
    })
    mockUseActivationClaimWhenReady.mockReturnValue({
      state: { kind: 'idle' },
      retry: vi.fn(),
    })
  })

  describe('progressive variant', () => {
    it('shows inline email/password form with Order verified when context is VALID', async () => {
      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
        />,
      )

      expect(screen.getByTestId('activation-account-setup')).toBeInTheDocument()
      expect(screen.getByText('Order verified')).toBeInTheDocument()
      expect(screen.getByText('SignMaster 101 UK Road Sign Flashcards')).toBeInTheDocument()
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })

    it('blocks submit when activation context is missing', async () => {
      const signUp = vi.fn()
      mockResolveActivationContext.mockResolvedValue({
        kind: 'status',
        status: 'NONE',
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-context-missing-notice')).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      expect(signUp).not.toHaveBeenCalled()
    })

    it('shows expired notice and blocks sign-up when context is EXPIRED', async () => {
      const signUp = vi.fn()
      mockResolveActivationContext.mockResolvedValue({
        kind: 'status',
        status: 'EXPIRED',
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          signUp={signUp}
          onRestartActivation={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-expired-notice')).toBeInTheDocument()
      })

      const user = userEvent.setup()
      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      expect(signUp).not.toHaveBeenCalled()
    })

    it('confirmed sign-up performs exactly one auth refresh and does not return to the editable form', async () => {
      const user = userEvent.setup()
      let isAuthenticated = false
      const refresh = vi.fn().mockImplementation(async () => {
        isAuthenticated = true
        return {
          id: '1',
          email: 'alex@example.invalid',
          emailConfirmed: true,
        }
      })
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated,
        user: isAuthenticated
          ? {
              id: '1',
              email: 'alex@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(1)
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      expect(screen.queryByLabelText('Email Address')).not.toBeInTheDocument()
      expect(screen.getByTestId('activation-claim-pending')).toBeInTheDocument()
    })

    it('requests claim when auth becomes ready after sign-up (single ready arm)', async () => {
      const user = userEvent.setup()
      let isAuthenticated = false
      const refresh = vi.fn().mockImplementation(async () => {
        isAuthenticated = true
        return {
          id: '1',
          email: 'alex@example.invalid',
          emailConfirmed: true,
        }
      })
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated,
        user: isAuthenticated
          ? {
              id: '1',
              email: 'alex@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledOnce()
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
          expect.objectContaining({ ready: true }),
        )
      })
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('shows auth-sync retry UI when refresh fails after signUp SUCCESS (no account form)', async () => {
      const user = userEvent.setup()
      const refresh = vi.fn().mockResolvedValue(null)
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        signOut: vi.fn(),
        refresh,
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('activation-auth-sync-notice')).toBeInTheDocument()
        expect(screen.getByText(AUTH_MESSAGES.accountCreatedSignInIncomplete)).toBeInTheDocument()
      })
      expect(signUp).toHaveBeenCalledTimes(1)
      expect(screen.queryByLabelText('Email Address')).not.toBeInTheDocument()
    })

    it('auth-sync Retry calls refreshAuth only and reaches claim-ready state on success', async () => {
      const user = userEvent.setup()
      let isAuthenticated = false
      const refresh = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockImplementation(async () => {
          isAuthenticated = true
          return {
            id: '1',
            email: 'alex@example.invalid',
            emailConfirmed: true,
          }
        })
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated,
        user: isAuthenticated
          ? {
              id: '1',
              email: 'alex@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await waitFor(() => {
        expect(screen.getByTestId('activation-auth-sync-notice')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Retry' }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(2)
      })
      expect(signUp).toHaveBeenCalledTimes(1)

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
          expect.objectContaining({ ready: true }),
        )
      })
      expect(screen.getByTestId('activation-claim-pending')).toBeInTheDocument()
    })

    it('repeated auth-sync retry failure does not call signUp again', async () => {
      const user = userEvent.setup()
      const refresh = vi.fn().mockResolvedValue(null)
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        signOut: vi.fn(),
        refresh,
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await user.click(await screen.findByRole('button', { name: 'Retry' }))
      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(2)
      })
      await user.click(screen.getByRole('button', { name: 'Retry' }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(3)
      })
      expect(signUp).toHaveBeenCalledTimes(1)
      expect(screen.queryByLabelText('Email Address')).not.toBeInTheDocument()
    })

    it('shows claim SUCCESS continuation UI after confirmed auth', async () => {
      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: true,
        user: {
          id: '1',
          email: 'alex@example.invalid',
          emailConfirmed: true,
        },
        signOut: vi.fn(),
        refresh: vi.fn(),
      })
      mockUseActivationClaimWhenReady.mockReturnValue({
        state: { kind: 'outcome', outcome: 'success' },
        retry: vi.fn(),
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
        />,
      )

      expect(await screen.findByText(/SignMaster is activated/i)).toBeInTheDocument()
      expect(document.querySelector('[data-claim-outcome="success"]')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    })

    it('shows email confirmation UI when sign-up requires confirmation', async () => {
      const user = userEvent.setup()
      const signUp = vi.fn().mockResolvedValue({
        kind: 'email_confirmation_required',
        user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      await waitFor(() => {
        expect(screen.getByTestId('email-confirmation-continuation')).toBeInTheDocument()
      })
    })

    it('recheck success performs exactly one auth refresh and reaches claim-ready state', async () => {
      const user = userEvent.setup()
      let emailConfirmed = false
      const refresh = vi.fn().mockImplementation(async () => {
        emailConfirmed = true
        return {
          id: '2',
          email: 'pending@example.invalid',
          emailConfirmed: true,
        }
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated: emailConfirmed,
        user: emailConfirmed
          ? {
              id: '2',
              email: 'pending@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={vi.fn().mockResolvedValue({
            kind: 'email_confirmation_required',
            user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
          })}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(1)
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={vi.fn().mockResolvedValue({
            kind: 'email_confirmation_required',
            user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
          })}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(mockUseActivationClaimWhenReady).toHaveBeenCalledWith(
          expect.objectContaining({ ready: true }),
        )
      })
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('recheck while still unconfirmed stays on confirmation UI', async () => {
      const user = userEvent.setup()
      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        signOut: vi.fn(),
        refresh: vi.fn().mockResolvedValue(null),
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={vi.fn().mockResolvedValue({
            kind: 'email_confirmation_required',
            user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
          })}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

      await waitFor(() => {
        expect(screen.getByTestId('email-confirmation-not-seen')).toBeInTheDocument()
      })
    })

    it('Change email clears fields but keeps valid context resolution', async () => {
      const user = userEvent.setup()

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={vi.fn().mockResolvedValue({
            kind: 'email_confirmation_required',
            user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
          })}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await user.click(screen.getByRole('button', { name: 'Change email' }))

      expect(screen.getByLabelText('Email Address')).toHaveValue('')
      expect(screen.getByLabelText('Create Password')).toHaveValue('')
      expect(screen.getByLabelText('Confirm Password')).toHaveValue('')
      expect(screen.getByText('Order verified')).toBeInTheDocument()
      expect(mockResolveActivationContext).not.toHaveBeenCalled()
    })

    it('shows existing-account sign-in path after email_already_registered', async () => {
      const user = userEvent.setup()
      const onSignIn = vi.fn()
      const signUp = vi.fn().mockResolvedValue({
        kind: 'error',
        error: {
          code: 'email_already_registered',
          message: AUTH_MESSAGES.emailAlreadyRegistered,
        },
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          onSignIn={onSignIn}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      const alert = await screen.findByRole('alert')
      expect(
        within(alert).getByText(/We could not create your account. If you already have one, try signing in./i),
      ).toBeInTheDocument()

      await user.click(within(alert).getByRole('button', { name: 'Sign in' }))
      expect(onSignIn).toHaveBeenCalledOnce()
    })

    it('blocks submit for invalid email, password, and mismatch', async () => {
      const user = userEvent.setup()
      const signUp = vi.fn()
      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
        />,
      )

      await user.type(screen.getByLabelText('Email Address'), 'bad')
      await user.type(screen.getByLabelText('Create Password'), 'short')
      await user.type(screen.getByLabelText('Confirm Password'), 'different')
      fireEvent.submit(screen.getByRole('form', { name: 'Create SignMaster account form' }))

      expect(signUp).not.toHaveBeenCalled()
      expect(screen.getByText(/Enter a valid email address/i)).toBeInTheDocument()
    })

    it('focuses the first invalid field on submit', async () => {
      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
        />,
      )

      fireEvent.submit(screen.getByRole('form', { name: 'Create SignMaster account form' }))

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByLabelText('Email Address'))
      })
    })

    it('prevents duplicate sign-up requests while the first is in flight', async () => {
      let resolveSignUp: (value: SignUpResult) => void = () => undefined
      const signUp = vi.fn(
        (): Promise<SignUpResult> =>
          new Promise((resolve) => {
            resolveSignUp = resolve
          }),
      )

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      const user = userEvent.setup()
      await fillValidAccountForm(user)
      const submit = screen.getByRole('button', { name: 'Create Account & Continue' })
      await user.click(submit)
      fireEvent.submit(submit.closest('form')!)

      expect(signUp).toHaveBeenCalledTimes(1)

      resolveSignUp({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })
    })

    it('keeps sign-up retryable after a network error without auto-retrying', async () => {
      const user = userEvent.setup()
      const signUp = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({
          kind: 'success',
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
          session: {
            user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
          },
        })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))

      await waitFor(() => {
        expect(screen.getByText(AUTH_MESSAGES.networkError)).toBeInTheDocument()
      })
      expect(signUp).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await waitFor(() => {
        expect(signUp).toHaveBeenCalledTimes(2)
      })
    })

    it('shows recoverable context service error with retry', async () => {
      const user = userEvent.setup()
      mockResolveActivationContext.mockResolvedValue({ kind: 'service_unavailable' })

      render(
        <ActivationAccountSetup
          variant="progressive"
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-context-service-error-notice')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Retry' }))
      expect(mockResolveActivationContext).toHaveBeenCalledTimes(2)
    })

    it('exposes claim retry without duplicate concurrent claims (hook contract)', async () => {
      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: true,
        user: {
          id: '1',
          email: 'alex@example.invalid',
          emailConfirmed: true,
        },
        signOut: vi.fn(),
        refresh: vi.fn(),
      })
      const retry = vi.fn()
      mockUseActivationClaimWhenReady.mockReturnValue({
        state: { kind: 'connection_error' },
        retry,
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
        />,
      )

      await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
      expect(retry).toHaveBeenCalledOnce()
    })
  })

  describe('pre-CP5 state-machine hardening', () => {
    const EXPIRED_CONTEXT_RESOLUTION = {
      status: 'EXPIRED' as const,
      isLoading: false,
      error: false,
      retry: vi.fn(),
    }

    function createDeferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    function claimReadyCalls() {
      return mockUseActivationClaimWhenReady.mock.calls.filter(
        (call) => call[0]?.ready === true,
      )
    }

    it('auth-sync Retry double-submit protection ignores a second refresh while the first retry is in flight', async () => {
      const user = userEvent.setup()
      let isAuthenticated = false
      const pendingRetryRefresh = createDeferred<{
        id: string
        email: string
        emailConfirmed: boolean
      } | null>()
      const refresh = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(() => pendingRetryRefresh.promise)
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated,
        user: isAuthenticated
          ? {
              id: '1',
              email: 'alex@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await waitFor(() => {
        expect(screen.getByTestId('activation-auth-sync-notice')).toBeInTheDocument()
      })
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(signUp).toHaveBeenCalledTimes(1)

      const retryButton = screen.getByRole('button', { name: 'Retry' })
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(2)
        expect(screen.getByRole('button', { name: 'Signing you in…' })).toBeDisabled()
      })
      expect(signUp).toHaveBeenCalledTimes(1)

      isAuthenticated = true
      pendingRetryRefresh.resolve({
        id: '1',
        email: 'alex@example.invalid',
        emailConfirmed: true,
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-claim-pending')).toBeInTheDocument()
      })
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(signUp).toHaveBeenCalledTimes(1)
    })

    it('does not arm claim when activation context becomes EXPIRED during auth-sync recovery even after auth refresh succeeds', async () => {
      const user = userEvent.setup()
      let isAuthenticated = false
      const pendingRetryRefresh = createDeferred<{
        id: string
        email: string
        emailConfirmed: boolean
      } | null>()
      const refresh = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async () => {
          const updated = await pendingRetryRefresh.promise
          if (updated?.emailConfirmed) {
            isAuthenticated = true
          }
          return updated
        })
      const signUp = vi.fn().mockResolvedValue({
        kind: 'success',
        user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        session: {
          user: { id: '1', email: 'alex@example.invalid', emailConfirmed: true },
        },
      })

      mockUseAuthContext.mockImplementation(() => ({
        isInitializing: false,
        isAuthenticated,
        user: isAuthenticated
          ? {
              id: '1',
              email: 'alex@example.invalid',
              emailConfirmed: true,
            }
          : null,
        signOut: vi.fn(),
        refresh,
      }))

      const view = render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await waitFor(() => {
        expect(screen.getByTestId('activation-auth-sync-notice')).toBeInTheDocument()
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={EXPIRED_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      pendingRetryRefresh.resolve({
        id: '1',
        email: 'alex@example.invalid',
        emailConfirmed: true,
      })

      await waitFor(() => {
        expect(refresh).toHaveBeenCalledTimes(2)
      })

      view.rerender(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={EXPIRED_CONTEXT_RESOLUTION}
          signUp={signUp}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-expired-notice')).toBeInTheDocument()
      })
      expect(claimReadyCalls()).toHaveLength(0)
      expect(screen.queryByTestId('activation-claim-pending')).not.toBeInTheDocument()
      expect(screen.queryByText(/SignMaster is activated/i)).not.toBeInTheDocument()
      expect(document.querySelector('[data-claim-outcome="success"]')).toBeNull()
      expect(signUp).toHaveBeenCalledTimes(1)
    })

    it('still-unconfirmed email after recheck never arms claim and keeps confirmation UI', async () => {
      const user = userEvent.setup()
      const refresh = vi.fn().mockResolvedValue(null)

      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: false,
        user: null,
        signOut: vi.fn(),
        refresh,
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signUp={vi.fn().mockResolvedValue({
            kind: 'email_confirmation_required',
            user: { id: '2', email: 'pending@example.invalid', emailConfirmed: false },
          })}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await fillValidAccountForm(user)
      await user.click(screen.getByRole('button', { name: 'Create Account & Continue' }))
      await waitFor(() => {
        expect(screen.getByTestId('email-confirmation-continuation')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

      await waitFor(() => {
        expect(screen.getByTestId('email-confirmation-not-seen')).toBeInTheDocument()
        expect(
          screen.getByText(
            "We haven't seen the confirmation yet. Check your email and try again.",
          ),
        ).toBeInTheDocument()
      })

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(claimReadyCalls()).toHaveLength(0)
      expect(screen.getByTestId('email-confirmation-continuation')).toBeInTheDocument()
      expect(screen.queryByLabelText('Email Address')).not.toBeInTheDocument()
      expect(screen.queryByTestId('activation-claim-pending')).not.toBeInTheDocument()
      expect(screen.queryByText(/SignMaster is activated/i)).not.toBeInTheDocument()
    })
  })

  describe('Google OAuth (CP5)', () => {
    it('shows Continue with Google when activation context is VALID', async () => {
      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
        />,
      )

      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    })

    it('invokes Google auth once when Continue with Google is clicked', async () => {
      const user = userEvent.setup()
      const signInWithGoogle = vi.fn().mockResolvedValue({ kind: 'redirect_initiated' })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signInWithGoogle={signInWithGoogle}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

      await waitFor(() => {
        expect(signInWithGoogle).toHaveBeenCalledTimes(1)
      })
    })

    it('prevents duplicate Google OAuth requests on rapid clicks', async () => {
      let resolveOAuth!: () => void
      const signInWithGoogle = vi.fn(
        () =>
          new Promise<{ kind: 'redirect_initiated' }>((resolve) => {
            resolveOAuth = () => resolve({ kind: 'redirect_initiated' })
          }),
      )
      const user = userEvent.setup()

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signInWithGoogle={signInWithGoogle}
        />,
      )

      const googleButton = screen.getByRole('button', { name: 'Continue with Google' })
      await user.click(googleButton)
      await user.click(googleButton)

      expect(signInWithGoogle).toHaveBeenCalledTimes(1)
      resolveOAuth()
    })

    it('shows safe retryable UI when Google OAuth initiation fails', async () => {
      const user = userEvent.setup()
      const signInWithGoogle = vi.fn().mockResolvedValue({
        kind: 'error',
        error: { code: 'unknown', message: 'We could not start Google sign-in.' },
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={VALID_CONTEXT_RESOLUTION}
          signInWithGoogle={signInWithGoogle}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Google sign-in/i)
      })
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
    })

    it('does not start Google OAuth when activation context is EXPIRED', async () => {
      const user = userEvent.setup()
      const signInWithGoogle = vi.fn()
      mockResolveActivationContext.mockResolvedValue({
        kind: 'status',
        status: 'EXPIRED',
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          signInWithGoogle={signInWithGoogle}
          signUp={vi.fn()}
          buildConfirmationRedirect={async () => 'http://localhost/activation/continue'}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-expired-notice')).toBeInTheDocument()
      })

      const googleButton = screen.getByRole('button', { name: 'Continue with Google' })
      expect(googleButton).toBeDisabled()
      await user.click(googleButton)
      expect(signInWithGoogle).not.toHaveBeenCalled()
    })

    it('does not start Google OAuth when activation context is NONE', async () => {
      const user = userEvent.setup()
      const signInWithGoogle = vi.fn()
      mockResolveActivationContext.mockResolvedValue({
        kind: 'status',
        status: 'NONE',
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          signInWithGoogle={signInWithGoogle}
          signUp={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('activation-context-missing-notice')).toBeInTheDocument()
      })

      const googleButton = screen.getByRole('button', { name: 'Continue with Google' })
      expect(googleButton).toBeDisabled()
      await user.click(googleButton)
      expect(signInWithGoogle).not.toHaveBeenCalled()
    })

    it('does not arm claim when Google-authenticated user has EXPIRED context', async () => {
      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: true,
        user: {
          id: '1',
          email: 'google@example.invalid',
          emailConfirmed: true,
        },
        signOut: vi.fn(),
        refresh: vi.fn(),
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={{
            status: 'EXPIRED',
            isLoading: false,
            error: false,
            retry: vi.fn(),
          }}
        />,
      )

      expect(screen.getByTestId('activation-expired-notice')).toBeInTheDocument()
      expect(
        mockUseActivationClaimWhenReady.mock.calls.some((call) => call[0]?.ready === true),
      ).toBe(false)
    })

    it('does not arm claim when Google-authenticated user has NONE context', async () => {
      mockUseAuthContext.mockReturnValue({
        isInitializing: false,
        isAuthenticated: true,
        user: {
          id: '1',
          email: 'google@example.invalid',
          emailConfirmed: true,
        },
        signOut: vi.fn(),
        refresh: vi.fn(),
      })

      render(
        <ActivationAccountSetup
          variant="progressive"
          activationContextResolution={{
            status: 'NONE',
            isLoading: false,
            error: false,
            retry: vi.fn(),
          }}
        />,
      )

      expect(screen.getByTestId('activation-context-missing-notice')).toBeInTheDocument()
      expect(
        mockUseActivationClaimWhenReady.mock.calls.some((call) => call[0]?.ready === true),
      ).toBe(false)
    })
  })
})
