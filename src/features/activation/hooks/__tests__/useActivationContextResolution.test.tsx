import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActivationContextResolveResult } from '../../../../lib/api/activationContextApi'
import { useActivationContextResolution } from '../useActivationContextResolution'

describe('useActivationContextResolution', () => {
  it('sets error when the initial API call fails', async () => {
    const resolveContext = vi.fn().mockResolvedValue({ kind: 'service_unavailable' })

    const { result } = renderHook(() =>
      useActivationContextResolution({ resolveContext }),
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe(true)
    expect(result.current.status).toBeNull()
  })

  it('retries after failure and clears error on VALID', async () => {
    const resolveContext = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'connection_error' })
      .mockResolvedValueOnce({ kind: 'status', status: 'VALID' })

    const { result } = renderHook(() =>
      useActivationContextResolution({ resolveContext }),
    )

    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })

    act(() => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('VALID')
      expect(result.current.error).toBe(false)
    })

    expect(resolveContext).toHaveBeenCalledTimes(2)
  })

  it('ignores overlapping retry requests while a request is in flight', async () => {
    let resolvePending: ((value: { kind: 'status'; status: 'VALID' }) => void) | undefined
    const resolveContext = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePending = resolve
          }),
      )

    const { result } = renderHook(() =>
      useActivationContextResolution({ resolveContext }),
    )

    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })

    act(() => {
      result.current.retry()
      result.current.retry()
    })

    expect(resolveContext).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolvePending?.({ kind: 'status', status: 'VALID' })
    })

    await waitFor(() => {
      expect(result.current.status).toBe('VALID')
    })
  })

  it('does not update state after unmount', async () => {
    let resolvePending: ((value: ActivationContextResolveResult) => void) | undefined
    const resolveContext = vi.fn(
      (): Promise<ActivationContextResolveResult> =>
        new Promise((resolve) => {
          resolvePending = resolve
        }),
    )

    const { result, unmount } = renderHook(() =>
      useActivationContextResolution({ resolveContext }),
    )

    unmount()

    await act(async () => {
      resolvePending?.({ kind: 'status', status: 'VALID' })
    })

    expect(result.current.status).toBeNull()
    expect(result.current.error).toBe(false)
  })
})
