import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from '../ProtectedRoute.tsx'
import type { EntitlementResult } from '../../../../lib/api/entitlementApi.ts'
import type { ActivationContextResolveResult } from '../../../../lib/api/activationContextApi.ts'

vi.mock('../../../auth/context/AuthProvider', () => ({
  useAuthContext: vi.fn(),
}))

import { useAuthContext } from '../../../auth/context/AuthProvider'

const mockUseAuthContext = vi.mocked(useAuthContext)

interface HarnessOptions {
  getEntitlement?: () => Promise<EntitlementResult>
  resolveContext?: () => Promise<ActivationContextResolveResult>
}

function renderGuard(options: HarnessOptions = {}) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute
              getEntitlement={options.getEntitlement}
              resolveContext={options.resolveContext}
            >
              <div>PROTECTED CONTENT</div>
            </ProtectedRoute>
          }
        />
        <Route path="/sign-in" element={<div>SIGN IN PAGE</div>} />
        <Route path="/create-account" element={<div>RESUME PAGE</div>} />
        <Route path="/activate" element={<div>ACTIVATE PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const signOut = vi.fn().mockResolvedValue(undefined)

function authState(overrides: Partial<ReturnType<typeof useAuthContext>> = {}) {
  return {
    isInitializing: false,
    isAuthenticated: true,
    user: { id: '1', email: 'a@example.invalid', emailConfirmed: true },
    signOut,
    ...overrides,
  }
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue(authState())
  })

  it('shows a neutral loading state and never flashes protected content while auth initialises', () => {
    mockUseAuthContext.mockReturnValue(authState({ isInitializing: true }))

    renderGuard({ getEntitlement: () => new Promise(() => {}) })

    expect(screen.getByTestId('protected-route-loading')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('does not render protected content while the entitlement check is in flight', () => {
    renderGuard({ getEntitlement: () => new Promise(() => {}) })

    expect(screen.getByTestId('protected-route-loading')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('redirects to sign-in when the user is not authenticated', async () => {
    mockUseAuthContext.mockReturnValue(authState({ isAuthenticated: false }))

    renderGuard({ getEntitlement: async () => ({ kind: 'active' }) })

    expect(await screen.findByText('SIGN IN PAGE')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('renders protected content for an active entitlement', async () => {
    renderGuard({ getEntitlement: async () => ({ kind: 'active' }) })

    expect(await screen.findByText('PROTECTED CONTENT')).toBeInTheDocument()
  })

  it('treats a backend-rejected token as signed out', async () => {
    renderGuard({ getEntitlement: async () => ({ kind: 'unauthenticated' }) })

    expect(await screen.findByText('SIGN IN PAGE')).toBeInTheDocument()
  })

  it('resumes activation when there is no entitlement but a valid context', async () => {
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'status', status: 'VALID' }),
    })

    expect(await screen.findByText('RESUME PAGE')).toBeInTheDocument()
  })

  it('shows the activation-required (B10) state when there is no entitlement and no context', async () => {
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'status', status: 'NONE' }),
    })

    expect(
      await screen.findByRole('heading', { name: 'Finish activating SignMaster' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your account is ready. Verify your Amazon order to activate access.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify my order' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use another account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get support' })).toBeInTheDocument()
  })

  it('shows activation-required for an expired (non-resumable) context', async () => {
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'status', status: 'EXPIRED' }),
    })

    expect(
      await screen.findByRole('heading', { name: 'Finish activating SignMaster' }),
    ).toBeInTheDocument()
  })

  it('"Verify my order" routes to the activation entry point', async () => {
    const user = userEvent.setup()
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'status', status: 'NONE' }),
    })

    await user.click(await screen.findByRole('button', { name: 'Verify my order' }))
    expect(await screen.findByText('ACTIVATE PAGE')).toBeInTheDocument()
  })

  it('"Use another account" signs out and returns to sign in', async () => {
    const user = userEvent.setup()
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'status', status: 'NONE' }),
    })

    await user.click(await screen.findByRole('button', { name: 'Use another account' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('SIGN IN PAGE')).toBeInTheDocument()
  })

  it('fails closed with a retryable error when the entitlement lookup fails, then recovers on retry', async () => {
    const user = userEvent.setup()
    const getEntitlement = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' } as EntitlementResult)
      .mockResolvedValueOnce({ kind: 'active' } as EntitlementResult)

    renderGuard({ getEntitlement })

    expect(await screen.findByTestId('protected-route-error')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('PROTECTED CONTENT')).toBeInTheDocument()
  })

  it('fails closed when the activation-context lookup errors (no entitlement)', async () => {
    renderGuard({
      getEntitlement: async () => ({ kind: 'none' }),
      resolveContext: async () => ({ kind: 'service_unavailable' }),
    })

    expect(await screen.findByTestId('protected-route-error')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })
})
