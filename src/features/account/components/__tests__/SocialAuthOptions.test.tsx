import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SocialAuthOptions from '../SocialAuthOptions'

describe('SocialAuthOptions', () => {
  it('shows Google and hides Apple by default', () => {
    render(<SocialAuthOptions onGoogleClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).not.toBeInTheDocument()
  })

  it('shows Apple when showApple is enabled', () => {
    render(
      <SocialAuthOptions onGoogleClick={vi.fn()} showApple onAppleClick={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument()
  })
})
