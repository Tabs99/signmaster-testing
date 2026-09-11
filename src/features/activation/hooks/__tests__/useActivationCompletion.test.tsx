import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActivationCompletion } from '../useActivationCompletion'

describe('useActivationCompletion', () => {
  it('starts idle and does not complete until run is called', () => {
    const complete = vi.fn()

    const { result } = renderHook(() => useActivationCompletion({ complete }))

    expect(result.current.state).toEqual({ kind: 'idle' })
    expect(complete).not.toHaveBeenCalled()
  })

  it('runs completion once and maps a definitive outcome', async () => {
    const complete = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'completed' })

    const { result } = renderHook(() => useActivationCompletion({ complete }))

    act(() => {
      result.current.run()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'completed' })
    })

    act(() => {
      result.current.run()
    })

    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('does not issue duplicate concurrent completion requests', async () => {
    let resolveComplete: (value: { kind: 'outcome'; outcome: 'completed' }) => void = () =>
      undefined
    const complete = vi.fn(
      () =>
        new Promise<{ kind: 'outcome'; outcome: 'completed' }>((resolve) => {
          resolveComplete = resolve
        }),
    )

    const { result } = renderHook(() => useActivationCompletion({ complete }))

    act(() => {
      result.current.run()
      result.current.run()
    })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(result.current.state).toEqual({ kind: 'loading' })

    await act(async () => {
      resolveComplete({ kind: 'outcome', outcome: 'completed' })
    })

    expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'completed' })
  })

  it('remains retryable after a transient service failure', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'service_unavailable' })
      .mockResolvedValueOnce({ kind: 'outcome', outcome: 'completed' })

    const { result } = renderHook(() => useActivationCompletion({ complete }))

    act(() => {
      result.current.run()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'service_unavailable' })
    })

    act(() => {
      result.current.run()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'completed' })
    })

    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('treats no_context as terminal (already finalised) and blocks another attempt', async () => {
    const complete = vi.fn().mockResolvedValue({ kind: 'outcome', outcome: 'no_context' })

    const { result } = renderHook(() => useActivationCompletion({ complete }))

    act(() => {
      result.current.run()
    })

    await waitFor(() => {
      expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'no_context' })
    })

    act(() => {
      result.current.run()
    })

    expect(complete).toHaveBeenCalledTimes(1)
  })

  it.each(['not_eligible', 'email_not_confirmed', 'unauthenticated'] as const)(
    'keeps completion retryable after a non-terminal %s outcome',
    async (outcome) => {
      const complete = vi
        .fn()
        .mockResolvedValueOnce({ kind: 'outcome', outcome })
        .mockResolvedValueOnce({ kind: 'outcome', outcome: 'completed' })

      const { result } = renderHook(() => useActivationCompletion({ complete }))

      act(() => {
        result.current.run()
      })

      await waitFor(() => {
        expect(result.current.state).toEqual({ kind: 'outcome', outcome })
      })

      act(() => {
        result.current.run()
      })

      await waitFor(() => {
        expect(result.current.state).toEqual({ kind: 'outcome', outcome: 'completed' })
      })

      expect(complete).toHaveBeenCalledTimes(2)
    },
  )
})
