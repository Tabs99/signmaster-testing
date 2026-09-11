import { describe, expect, it, vi } from 'vitest'
import {
  buildConfirmationContinuationRedirect,
  ACTIVATION_CONTINUE_ROUTE,
} from '../confirmationRedirect'

const ORIGIN = 'https://signmastercards.co.uk'
const REFERENCE = 'cross-device-reference-abcdefghijklmnopqrstuvwxyz012345'

describe('buildConfirmationContinuationRedirect', () => {
  it('embeds the opaque reference when a continuation is created', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'created', reference: REFERENCE })

    const url = await buildConfirmationContinuationRedirect('owner@example.invalid', {
      origin: ORIGIN,
      request,
    })

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`${ORIGIN}${ACTIVATION_CONTINUE_ROUTE}`)
    expect(parsed.searchParams.get('ref')).toBe(REFERENCE)
    expect(request).toHaveBeenCalledWith('owner@example.invalid')
  })

  it('returns the plain continue route when there is no context', async () => {
    const url = await buildConfirmationContinuationRedirect('owner@example.invalid', {
      origin: ORIGIN,
      request: vi.fn().mockResolvedValue({ kind: 'no_context' }),
    })

    expect(url).toBe(`${ORIGIN}${ACTIVATION_CONTINUE_ROUTE}`)
    expect(url).not.toContain('ref=')
  })

  it('falls back to the plain route if minting errors', async () => {
    const url = await buildConfirmationContinuationRedirect('owner@example.invalid', {
      origin: ORIGIN,
      request: vi.fn().mockRejectedValue(new Error('offline')),
    })

    expect(url).toBe(`${ORIGIN}${ACTIVATION_CONTINUE_ROUTE}`)
  })
})
