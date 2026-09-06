import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActivationClaimWhenReady } from '../useActivationClaimWhenReady'

describe('useActivationClaimWhenReady', () => {
  it('claims once when ready', async () => {
    const claim = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'success' })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'outcome', outcome: 'success' })
    })

    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('does not claim while not ready', async () => {
    const claim = vi.fn()

    renderHook(() =>
      useActivationClaimWhenReady({
        ready: false,
        claim,
      }),
    )

    await waitFor(() => {
      expect(claim).not.toHaveBeenCalled()
    })
  })

  it('does not double-claim after success', async () => {
    const claim = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'success' })

    const { rerender, result } = renderHook(
      ({ ready }) =>
        useActivationClaimWhenReady({
          ready,
          claim,
        }),
      { initialProps: { ready: true } },
    )

    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'outcome', outcome: 'success' })
    })

    rerender({ ready: true })

    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('exposes ALREADY_CLAIMED distinctly', async () => {
    const claim = vi
      .fn()
      .mockResolvedValue({ kind: 'outcome', outcome: 'already_claimed' })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'outcome', outcome: 'already_claimed' })
    })
  })

  it('exposes NOT_ELIGIBLE distinctly', async () => {
    const claim = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'not_eligible' })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'outcome', outcome: 'not_eligible' })
    })
  })
})
