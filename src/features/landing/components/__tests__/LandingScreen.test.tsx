import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LandingScreen from '../LandingScreen'

function renderLanding() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingScreen />} />
        <Route path="/activate" element={<p>Activate screen</p>} />
        <Route path="/sign-in" element={<p>Sign in screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LandingScreen', () => {
  it('leads with what the buyer already owns', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', { name: /master the road/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/included with your flash cards/i)).toBeInTheDocument()
    expect(screen.getByTestId('landing-activate')).toHaveTextContent(/get started/i)
    expect(
      screen.getByRole('link', { name: /i already have an account/i }),
    ).toBeInTheDocument()
  })

  it('sends a new customer to activation', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByTestId('landing-activate'))

    expect(screen.getByText('Activate screen')).toBeInTheDocument()
  })

  it('sends a returning customer to sign in', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByTestId('landing-sign-in'))

    expect(screen.getByText('Sign in screen')).toBeInTheDocument()
  })

  it('offers support without promising a response time', () => {
    renderLanding()

    const support = screen.getByRole('link', {
      name: 'support@signmastercards.co.uk',
    })

    expect(support).toHaveAttribute('href', 'mailto:support@signmastercards.co.uk')
    expect(screen.queryByText(/within \d+ hours/i)).not.toBeInTheDocument()
  })
})
