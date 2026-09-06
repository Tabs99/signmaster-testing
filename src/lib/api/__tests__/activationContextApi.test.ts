import { describe, expect, it, vi } from 'vitest'
import {
  createActivationContext,
  resolveActivationContext,
} from '../activationContextApi.ts'

describe('activationContextApi', () => {
  it('creates activation context with credentials included', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'CREATED' }), { status: 200 }),
    )

    await expect(
      createActivationContext('205-1234567-1234567', { fetchFn }),
    ).resolves.toEqual({ kind: 'created' })

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/activation/context',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })

  it('maps not eligible responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'NOT_ELIGIBLE' }), { status: 400 }),
    )

    await expect(
      createActivationContext('205-1234567-1234567', { fetchFn }),
    ).resolves.toEqual({ kind: 'not_eligible' })
  })

  it('resolves activation context statuses without exposing order data', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'VALID' }), { status: 200 }),
    )

    await expect(resolveActivationContext({ fetchFn })).resolves.toEqual({
      kind: 'status',
      status: 'VALID',
    })
  })
})
