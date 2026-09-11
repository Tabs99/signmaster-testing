import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEntitlementResolution } from '../useEntitlementResolution.ts'
import type { EntitlementResult } from '../../../../lib/api/entitlementApi.ts'

describe('useEntitlementResolution', () => {
  it('stays idle and issues no request while disabled', async () => {
    const getEntitlement = vi.fn()

    const { result } = renderHook(() =>
      useEntitlementResolution({ enabled: false, getEntitlement }),
    )

    expect(result.current.phase).toEqual({ kind: 'idle' })
    expect(getEntitlement).not.toHaveBeenCalled()
  })

  it('loads then resolves to active', async () => {
    const getEntitlement = vi.fn().mockResolvedValue({ kind: 'active' } as EntitlementResult)

    const { result } = renderHook(() =>
      useEntitlementResolution({ enabled: true, getEntitlement }),
    )

    expect(result.current.phase).toEqual({ kind: 'loading' })
    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'active' }))
  })

  it('maps none to a none phase', async () => {
    const getEntitlement = vi.fn().mockResolvedValue({ kind: 'none' } as EntitlementResult)

    const { result } = renderHook(() =>
      useEntitlementResolution({ enabled: true, getEntitlement }),
    )

    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'none' }))
  })

  it('maps unauthenticated to an unauthenticated phase', async () => {
    const getEntitlement = vi
      .fn()
      .mockResolvedValue({ kind: 'unauthenticated' } as EntitlementResult)

    const { result } = renderHook(() =>
      useEntitlementResolution({ enabled: true, getEntitlement }),
    )

    await waitFor(() =>
      expect(result.current.phase).toEqual({ kind: 'unauthenticated' }),
    )
  })

  it.each<EntitlementResult['kind']>(['service_unavailable', 'connection_error'])(
    'maps %s to an error phase',
    async (kind) => {
      const getEntitlement = vi.fn().mockResolvedValue({ kind } as EntitlementResult)

      const { result } = renderHook(() =>
        useEntitlementResolution({ enabled: true, getEntitlement }),
      )

      await waitFor(() => expect(result.current.phase).toEqual({ kind: 'error' }))
    },
  )

  it('re-fetches on retry after a transient error', async () => {
    const getEntitlement = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' } as EntitlementResult)
      .mockResolvedValueOnce({ kind: 'active' } as EntitlementResult)

    const { result } = renderHook(() =>
      useEntitlementResolution({ enabled: true, getEntitlement }),
    )

    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'error' }))

    act(() => {
      result.current.retry()
    })

    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'active' }))
    expect(getEntitlement).toHaveBeenCalledTimes(2)
  })

  it('fetches once enabled flips from false to true (backend authority, no cache)', async () => {
    const getEntitlement = vi.fn().mockResolvedValue({ kind: 'active' } as EntitlementResult)

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useEntitlementResolution({ enabled, getEntitlement }),
      { initialProps: { enabled: false } },
    )

    expect(getEntitlement).not.toHaveBeenCalled()

    rerender({ enabled: true })

    await waitFor(() => expect(result.current.phase).toEqual({ kind: 'active' }))
    expect(getEntitlement).toHaveBeenCalledTimes(1)
  })
})
