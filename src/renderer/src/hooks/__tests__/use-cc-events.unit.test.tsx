// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCcEvents } from '../use-cc-events'

describe('hooks/use-cc-events', () => {
  let listener: ((p: { conversationId: number; event: unknown }) => void) | null
  let unsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    listener = null
    unsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      cc: {
        onEvent: (fn: typeof listener) => {
          listener = fn
          return unsub
        }
      }
    }
  })

  it('forwards events for the matching conversationId', () => {
    const onEvent = vi.fn()
    renderHook(() => useCcEvents(7, onEvent))
    act(() => listener?.({ conversationId: 7, event: { kind: 'prompt-ready' } }))
    expect(onEvent).toHaveBeenCalledWith({ kind: 'prompt-ready' })
  })

  it('ignores events for other conversations', () => {
    const onEvent = vi.fn()
    renderHook(() => useCcEvents(7, onEvent))
    act(() => listener?.({ conversationId: 99, event: { kind: 'prompt-ready' } }))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    renderHook(() => useCcEvents(null, vi.fn()))
    expect(listener).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCcEvents(7, vi.fn()))
    unmount()
    expect(unsub).toHaveBeenCalled()
  })
})
