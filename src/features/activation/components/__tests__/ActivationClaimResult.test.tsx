import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ActivationClaimResult from '../ActivationClaimResult'
import type { ActivationClaimState } from '../../hooks/useActivationClaimWhenReady'
import type { ActivationCompletionResult } from '../../../../lib/api/activationCompletionApi'

function renderResult(
  claimState: ActivationClaimState,
  overrides: Partial<Parameters<typeof ActivationClaimResult>[0]> = {},
) {
  return render(<ActivationClaimResult claimState={claimState} {...overrides} />)
}

describe('ActivationClaimResult', () => {
  it('renders nothing while the claim is idle', () => {
    const { container } = renderResult({ kind: 'idle' })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a loading state while the claim is in flight', () => {
    renderResult({ kind: 'loading' })
    expect(screen.getByText('Activating your access…')).toBeInTheDocument()
  })

  it('finalises via Continue then enters the app once, skipping the redundant success screen', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    const complete = vi
      .fn<() => Promise<ActivationCompletionResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'completed' })

    renderResult({ kind: 'outcome', outcome: 'success' }, { complete, onContinue })

    expect(
      screen.getByText("You're in. SignMaster is activated"),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-claim-outcome="success"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
    // Finalisation runs exactly once and the user is taken into the app rather
    // than left on a second redundant "access is active" success screen.
    expect(complete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Opening SignMaster…')).toBeInTheDocument()
    expect(
      screen.queryByText('Your SignMaster access is active'),
    ).not.toBeInTheDocument()
  })

  it('does not auto-navigate on a transient finalisation error, then navigates once after retry succeeds', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    const complete = vi
      .fn<() => Promise<ActivationCompletionResult>>()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockResolvedValueOnce({ kind: 'outcome', outcome: 'completed' })

    renderResult({ kind: 'outcome', outcome: 'success' }, { complete, onContinue })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(
        screen.getByText(/We couldn't finish tidying up your activation session/i),
      ).toBeInTheDocument()
    })
    // A transient completion failure must NOT enter the app.
    expect(onContinue).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(onContinue).toHaveBeenCalledTimes(1)
    })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('does NOT show activated when finalisation returns not_eligible', async () => {
    const complete = vi
      .fn<() => Promise<ActivationCompletionResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'not_eligible' })
    const onRestartActivation = vi.fn()
    const user = userEvent.setup()

    renderResult(
      { kind: 'outcome', outcome: 'success' },
      { complete, onRestartActivation },
    )

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText("We couldn't confirm your access")).toBeInTheDocument()
    })
    expect(screen.queryByText('Your SignMaster access is active')).not.toBeInTheDocument()
    expect(screen.queryByText("You're in. SignMaster is activated")).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-continuation-view="finalize_not_eligible"]'),
    ).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Use another order' }))
    expect(onRestartActivation).toHaveBeenCalledTimes(1)
  })

  it('does NOT show activated when finalisation reports email not confirmed', async () => {
    const complete = vi
      .fn<() => Promise<ActivationCompletionResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'email_not_confirmed' })
    const user = userEvent.setup()

    renderResult({ kind: 'outcome', outcome: 'success' }, { complete, onSignIn: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Confirm your email to finish')).toBeInTheDocument()
    })
    expect(screen.queryByText('Your SignMaster access is active')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-continuation-view="finalize_email_not_confirmed"]'),
    ).not.toBeNull()
  })

  it('does NOT show activated when finalisation reports unauthenticated', async () => {
    const complete = vi
      .fn<() => Promise<ActivationCompletionResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'unauthenticated' })
    const onSignIn = vi.fn()
    const user = userEvent.setup()

    renderResult({ kind: 'outcome', outcome: 'success' }, { complete, onSignIn })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByText('Sign in to finish activating')).toBeInTheDocument()
    })
    expect(screen.queryByText('Your SignMaster access is active')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-continuation-view="finalize_unauthenticated"]'),
    ).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it('offers sign in and use-another-order for an order claimed by another account', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()
    const onRestartActivation = vi.fn()

    renderResult(
      { kind: 'outcome', outcome: 'already_claimed' },
      { onSignIn, onRestartActivation },
    )

    expect(
      screen.getByText('This order is linked to another account'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Use another order' }))
    expect(onRestartActivation).toHaveBeenCalledTimes(1)
  })

  it('shows safe ineligible copy without leaking an internal reason', () => {
    renderResult(
      { kind: 'outcome', outcome: 'not_eligible' },
      { onRestartActivation: vi.fn() },
    )

    expect(
      screen.getByText('This order can no longer be used to activate SignMaster.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/returned/i)).not.toBeInTheDocument()
  })

  it('offers verification recovery for a missing context', async () => {
    const user = userEvent.setup()
    const onRestartActivation = vi.fn()

    renderResult({ kind: 'outcome', outcome: 'no_context' }, { onRestartActivation })

    expect(screen.getByText("Let's verify your order")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Verify my order' }))
    expect(onRestartActivation).toHaveBeenCalledTimes(1)
  })

  it('offers restart recovery for an expired context', () => {
    renderResult(
      { kind: 'outcome', outcome: 'context_expired' },
      { onRestartActivation: vi.fn() },
    )
    expect(screen.getByText('Your activation session expired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart activation' })).toBeInTheDocument()
  })

  it('offers an explicit retry for a transient claim error', async () => {
    const user = userEvent.setup()
    const onRetryClaim = vi.fn()

    renderResult({ kind: 'service_unavailable' }, { onRetryClaim })

    expect(
      screen.getByText("We couldn't activate your access right now"),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryClaim).toHaveBeenCalledTimes(1)
  })
})
