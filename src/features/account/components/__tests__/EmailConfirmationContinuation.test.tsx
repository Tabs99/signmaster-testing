import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EmailConfirmationContinuation from '../EmailConfirmationContinuation'
import { AUTH_MESSAGES } from '../../../../lib/auth/types'

describe('EmailConfirmationContinuation', () => {
  it('renders the B3A waiting state', () => {
    render(
      <EmailConfirmationContinuation
        onConfirmed={vi.fn()}
        recheck={vi.fn().mockResolvedValue(false)}
      />,
    )

    expect(screen.getByText('Confirm your email')).toBeInTheDocument()
    expect(screen.getByText(AUTH_MESSAGES.emailConfirmationRequired)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: "I've confirmed my email" }),
    ).toBeInTheDocument()
  })

  it('continues when the re-check confirms the email', async () => {
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    const recheck = vi.fn().mockResolvedValue(true)

    render(
      <EmailConfirmationContinuation onConfirmed={onConfirmed} recheck={recheck} />,
    )

    await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.queryByTestId('email-confirmation-not-seen'),
    ).not.toBeInTheDocument()
  })

  it('shows the B3A-prime message when still unconfirmed', async () => {
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    const recheck = vi.fn().mockResolvedValue(false)

    render(
      <EmailConfirmationContinuation onConfirmed={onConfirmed} recheck={recheck} />,
    )

    await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

    await waitFor(() => {
      expect(
        screen.getByText(
          "We haven't seen the confirmation yet. Check your email and try again.",
        ),
      ).toBeInTheDocument()
    })
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('shows a checking state and runs a single re-check while in flight', async () => {
    const user = userEvent.setup()
    let resolveRecheck: (value: boolean) => void = () => undefined
    const recheck = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRecheck = resolve
        }),
    )

    render(
      <EmailConfirmationContinuation onConfirmed={vi.fn()} recheck={recheck} />,
    )

    await user.click(screen.getByRole('button', { name: "I've confirmed my email" }))

    expect(recheck).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeInTheDocument()

    resolveRecheck(false)
    await waitFor(() => {
      expect(screen.getByTestId('email-confirmation-not-seen')).toBeInTheDocument()
    })
    expect(recheck).toHaveBeenCalledTimes(1)
  })

  it('exposes change-email and sign-in affordances', async () => {
    const user = userEvent.setup()
    const onChangeEmail = vi.fn()
    const onSignIn = vi.fn()

    render(
      <EmailConfirmationContinuation
        onConfirmed={vi.fn()}
        onChangeEmail={onChangeEmail}
        onSignIn={onSignIn}
        recheck={vi.fn().mockResolvedValue(false)}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Change email' }))
    expect(onChangeEmail).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})
