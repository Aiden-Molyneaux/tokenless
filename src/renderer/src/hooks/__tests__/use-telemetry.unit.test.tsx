// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useTelemetry } from '../use-telemetry'

describe('hooks/use-telemetry', () => {
  let listener: ((tick: { conversationId: number; contextUsed: number | null; contextTotal: number | null; contextPercent: number | null; tickAt: number }) => void) | null
  let unsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listener = null
    unsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      telemetry: {
        onTick: (fn: typeof listener) => {
          listener = fn
          return unsub
        }
      }
    }
  })

  it('returns null tick until one arrives for the conversation', () => {
    const { result } = renderHook(() => useTelemetry(7))
    expect(result.current).toBeNull()
  })

  it('returns the matching tick when one arrives', () => {
    const { result } = renderHook(() => useTelemetry(7))
    act(() => listener?.({
      conversationId: 7,
      contextUsed: 1000,
      contextTotal: 200000,
      contextPercent: 1,
      tickAt: 123
    }))
    expect(result.current?.contextPercent).toBe(1)
  })

  it('ignores ticks for other conversations', () => {
    const { result } = renderHook(() => useTelemetry(7))
    act(() => listener?.({
      conversationId: 99,
      contextUsed: 5000,
      contextTotal: 200000,
      contextPercent: 3,
      tickAt: 123
    }))
    expect(result.current).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useTelemetry(7))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    renderHook(() => useTelemetry(null))
    expect(listener).toBeNull()
  })
})
