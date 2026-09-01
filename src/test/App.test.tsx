import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { ACCOUNT_STORAGE_KEY } from '../features/account/types'
import { ACTIVATION_STORAGE_KEY } from '../features/activation/types'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the activation screen by default', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Verify Your Purchase' }),
    ).toBeInTheDocument()
  })

  it('renders the create account screen after activation', () => {
    localStorage.setItem(ACTIVATION_STORAGE_KEY, 'true')
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Create your SignMaster account' }),
    ).toBeInTheDocument()
  })

  it('renders the account success state when registration is complete', () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, 'true')
    render(<App />)

    expect(screen.getByText('Account created!')).toBeInTheDocument()
  })
})
