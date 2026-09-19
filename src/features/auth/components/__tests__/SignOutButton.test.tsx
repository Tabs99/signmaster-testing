import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import SignOutButton from '../SignOutButton'

const signOut = vi.fn().mockResolvedValue(undefined)

vi.mock('../../context/AuthProvider', () => ({
  useAuthContext: () => ({
    signOut,
  }),
}))

function renderSignOut(initialPath = '/app') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/app" element={<SignOutButton />} />
        <Route path="/sign-in" element={<p>SIGN IN PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SignOutButton', () => {
  it('signs out and navigates to sign-in', async () => {
    const user = userEvent.setup()
    signOut.mockClear()
    signOut.mockResolvedValue(undefined)

    renderSignOut()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('SIGN IN PAGE')).toBeInTheDocument()
  })

  it('does not navigate when sign-out fails', async () => {
    const user = userEvent.setup()
    signOut.mockClear()
    signOut.mockRejectedValueOnce({
      code: 'unknown',
      message: 'We could not sign you out right now.',
    })

    renderSignOut()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('SIGN IN PAGE')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('We could not sign you out right now.')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('ignores duplicate clicks while sign-out is in progress', async () => {
    const user = userEvent.setup()
    signOut.mockClear()

    let resolveSignOut: () => void = () => {}
    signOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve
        }),
    )

    renderSignOut()

    const button = screen.getByRole('button', { name: 'Sign out' })
    await user.click(button)
    await user.click(button)

    expect(signOut).toHaveBeenCalledTimes(1)

    resolveSignOut()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled())
  })

  it('supports a custom sign-in path', async () => {
    const user = userEvent.setup()
    signOut.mockClear()
    signOut.mockResolvedValue(undefined)

    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<SignOutButton signInPath="/custom-sign-in" />} />
          <Route path="/custom-sign-in" element={<p>CUSTOM SIGN IN</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('CUSTOM SIGN IN')).toBeInTheDocument()
  })
})
