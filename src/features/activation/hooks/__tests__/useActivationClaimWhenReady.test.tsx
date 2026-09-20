import { act, renderHook, waitFor } from '@testing-library/react'
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
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'success' })
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
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'success' })
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
      expect(result.current.state).toEqual({
        kind: 'outcome',
        outcome: 'already_claimed',
      })
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
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'not_eligible' })
    })
  })

  it('exposes rate_limited with retryAfterMs', async () => {
    const claim = vi
      .fn()
      .mockResolvedValue({ kind: 'rate_limited', retryAfterMs: 90_000 })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toEqual({
        kind: 'rate_limited',
        retryAfterMs: 90_000,
      })
    })
  })

  it('retries after a transient service error and does not run concurrently', async () => {
    const claim = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockResolvedValueOnce({ kind: 'outcome', outcome: 'success' })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'service_unavailable' })
    })

    act(() => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'success' })
    })

    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('does not claim again if ready toggles after a definitive success', async () => {
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
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'success' })
    })

    rerender({ ready: false })
    rerender({ ready: true })

    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('ignores retry after a definitive outcome', async () => {
    const claim = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'success' })

    const { result } = renderHook(() =>
      useActivationClaimWhenReady({
        ready: true,
        claim,
      }),
    )

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'success' })
    })

    act(() => {
      result.current.retry()
    })

    expect(claim).toHaveBeenCalledTimes(1)
  })
})
