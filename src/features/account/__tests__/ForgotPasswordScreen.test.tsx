import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ForgotPasswordScreen from '../components/ForgotPasswordScreen'
import { AUTH_MESSAGES, type PasswordResetRequestResult } from '../../../lib/auth/types'

const VALID_EMAIL = 'alex@example.invalid'
const buildRedirect = () => 'https://app.example/reset-password'

function renderScreen(
  requestReset = vi.fn().mockResolvedValue({ kind: 'sent' } as PasswordResetRequestResult),
  onBackToSignIn = vi.fn(),
) {
  render(
    <ForgotPasswordScreen
      requestReset={requestReset}
      buildRedirect={buildRedirect}
      onBackToSignIn={onBackToSignIn}
    />,
  )
  return { requestReset, onBackToSignIn }
}

describe('ForgotPasswordScreen', () => {
  it('renders the email field and submit CTA', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument()
  })

  it('shows a validation error and does not request a reset for an invalid email', async () => {
    const user = userEvent.setup()
    const { requestReset } = renderScreen()

    await user.type(screen.getByLabelText('Email Address'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(screen.getByText(/Enter a valid email address/i)).toBeInTheDocument()
    expect(requestReset).not.toHaveBeenCalled()
  })

  it('shows the generic anti-enumeration confirmation on success', async () => {
    const user = userEvent.setup()
    const { requestReset } = renderScreen()

    await user.type(screen.getByLabelText('Email Address'), VALID_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByText(AUTH_MESSAGES.passwordResetSent)).toBeInTheDocument()
    })
    expect(requestReset).toHaveBeenCalledWith(VALID_EMAIL, {
      redirectTo: 'https://app.example/reset-password',
    })
  })

  it('shows the same generic confirmation when the account does not exist', async () => {
    const user = userEvent.setup()
    // Supabase never reveals account-not-found; the service collapses it to `sent`.
    const requestReset = vi.fn().mockResolvedValue({ kind: 'sent' })
    renderScreen(requestReset)

    await user.type(screen.getByLabelText('Email Address'), 'ghost@example.invalid')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByText(AUTH_MESSAGES.passwordResetSent)).toBeInTheDocument()
    })
  })

  it('shows a loading state and prevents duplicate submissions', async () => {
    const user = userEvent.setup()
    let resolveRequest: (value: PasswordResetRequestResult) => void = () => undefined
    const requestReset = vi.fn(
      (): Promise<PasswordResetRequestResult> =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )
    renderScreen(requestReset)

    await user.type(screen.getByLabelText('Email Address'), VALID_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(screen.getByText('Sending reset link…')).toBeInTheDocument()
    expect(requestReset).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Sending reset link…' }))
    expect(requestReset).toHaveBeenCalledOnce()

    resolveRequest({ kind: 'sent' })
    await waitFor(() => {
      expect(screen.getByText(AUTH_MESSAGES.passwordResetSent)).toBeInTheDocument()
    })
  })

  it('shows a retryable temporary-failure alert on transient errors', async () => {
    const user = userEvent.setup()
    const requestReset = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockResolvedValueOnce({ kind: 'sent' })
    renderScreen(requestReset)

    await user.type(screen.getByLabelText('Email Address'), VALID_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        AUTH_MESSAGES.passwordResetTemporaryFailure,
      )
    })

    // The email is not revealed and the user can retry.
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByText(AUTH_MESSAGES.passwordResetSent)).toBeInTheDocument()
    })
    expect(requestReset).toHaveBeenCalledTimes(2)
  })

  it('treats a rejected request as a temporary failure (never leaks the error)', async () => {
    const user = userEvent.setup()
    const requestReset = vi.fn().mockRejectedValue(new Error('boom'))
    renderScreen(requestReset)

    await user.type(screen.getByLabelText('Email Address'), VALID_EMAIL)
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        AUTH_MESSAGES.passwordResetTemporaryFailure,
      )
    })
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('invokes the back-to-sign-in handler', async () => {
    const user = userEvent.setup()
    const { onBackToSignIn } = renderScreen()

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(onBackToSignIn).toHaveBeenCalledOnce()
  })
})
