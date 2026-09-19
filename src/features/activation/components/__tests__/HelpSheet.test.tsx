import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HelpSheet from '../HelpSheet'

const SUPPORT_EMAIL = 'support@signmastercards.co.uk'

describe('HelpSheet support email row', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the support section with email and Copy controls', async () => {
    render(
      <HelpSheet
        title="SignMaster activation help"
        initialSection={2}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'I still need help' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText(SUPPORT_EMAIL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Email SignMaster support' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })
    expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
  })

  it('renders the support email row as one grouped control with a divider before Copy', () => {
    render(
      <HelpSheet
        title="SignMaster activation help"
        initialSection={2}
        onClose={() => undefined}
      />,
    )

    const row = screen.getByTestId('help-support-email-row')
    const copy = screen.getByTestId('help-support-copy-button')

    expect(row.className).toMatch(/\boverflow-hidden\b/)
    expect(row.className).toMatch(/\brounded-md\b/)
    expect(row.className).toMatch(/\bborder\b/)
    expect(copy.className).toMatch(/\bborder-l\b/)
    expect(copy.className).toMatch(/\brounded-none\b/)
    expect(copy.className).not.toMatch(/\brounded-md\b/)
    expect(copy.className).toMatch(/\bkeyline-focus\b/)
  })
})
