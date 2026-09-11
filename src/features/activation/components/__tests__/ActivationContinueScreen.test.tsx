import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivationContinueScreen from '../ActivationContinueScreen'
import type { ActivationContinueResult } from '../../../../lib/api/activationContinuationApi'

vi.mock('../../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

import { useAuthContext } from '../../../auth/context/AuthProvider'

const mockUseAuthContext = vi.mocked(useAuthContext)
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'

function setAuth(overrides: Partial<ReturnType<typeof useAuthContext>> = {}) {
  mockUseAuthContext.mockReturnValue({
    isInitializing: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 'owner@example.invalid', emailConfirmed: true },
    signOut: vi.fn(),
    ...overrides,
  })
}

function renderScreen(
  path: string,
  props: Partial<Parameters<typeof ActivationContinueScreen>[0]> = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActivationContinueScreen {...props} />
    </MemoryRouter>,
  )
}

describe('ActivationContinueScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuth()
  })

  it('consumes the reference and resumes on success', async () => {
    const onResume = vi.fn()
    const consume = vi
      .fn<() => Promise<ActivationContinueResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'continued' })

    renderScreen(`/activation/continue?ref=${REFERENCE}`, { onResume, consume })

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledTimes(1)
    })
    expect(consume).toHaveBeenCalledWith(REFERENCE)
  })

  it('resumes directly when there is no reference but the session is authenticated', async () => {
    const onResume = vi.fn()
    const consume = vi.fn<() => Promise<ActivationContinueResult>>()

    renderScreen('/activation/continue', { onResume, consume })

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledTimes(1)
    })
    expect(consume).not.toHaveBeenCalled()
  })

  it('prompts sign-in when the confirming device has no session yet', async () => {
    setAuth({ isAuthenticated: false, user: null })
    const consume = vi.fn<() => Promise<ActivationContinueResult>>()

    renderScreen(`/activation/continue?ref=${REFERENCE}`, {
      consume,
      onSignIn: vi.fn(),
    })

    expect(await screen.findByText('Sign in to finish activating')).toBeInTheDocument()
    expect(consume).not.toHaveBeenCalled()
  })

  it('shows an unusable-link recovery for an invalid or already-used reference', async () => {
    const consume = vi
      .fn<() => Promise<ActivationContinueResult>>()
      .mockResolvedValue({ kind: 'outcome', outcome: 'already_consumed' })

    renderScreen(`/activation/continue?ref=${REFERENCE}`, {
      consume,
      onSignIn: vi.fn(),
      onRestartActivation: vi.fn(),
    })

    expect(
      await screen.findByText("This activation link can't be used"),
    ).toBeInTheDocument()
  })

  it('offers retry on a transient failure and resumes when it recovers', async () => {
    const onResume = vi.fn()
    const consume = vi
      .fn<() => Promise<ActivationContinueResult>>()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockResolvedValueOnce({ kind: 'outcome', outcome: 'continued' })
    const user = userEvent.setup()

    renderScreen(`/activation/continue?ref=${REFERENCE}`, { onResume, consume })

    expect(await screen.findByText("We couldn't finish just now")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledTimes(1)
    })
    expect(consume).toHaveBeenCalledTimes(2)
  })
})
