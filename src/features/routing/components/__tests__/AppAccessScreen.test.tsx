import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppAccessScreen from '../AppAccessScreen'

vi.mock('../../../auth/components/SignOutButton', () => ({
  default: () => <button type="button">Sign out</button>,
}))

describe('AppAccessScreen', () => {
  it('shows active access copy and a sign-out control', () => {
    render(
      <MemoryRouter>
        <AppAccessScreen />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('app-access')).toBeInTheDocument()
    expect(screen.getByText('SignMaster access is active.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
