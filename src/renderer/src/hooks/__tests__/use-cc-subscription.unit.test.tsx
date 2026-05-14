// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useCcSubscription } from '../use-cc-subscription'

// Purpose: useCcSubscription forwards chunks for the matching conversationId
// to the onChunk callback. It ignores chunks for other conversations. It
// unsubscribes on unmount.

describe('hooks/use-cc-subscription', () => {
  let chunkListener: ((p: { conversationId: number; chunk: string }) => void) | null
  let exitListener: ((p: { conversationId: number; exitCode: number; signal?: number }) => void) | null
  let chunkUnsub: ReturnType<typeof vi.fn>
  let exitUnsub: ReturnType<typeof vi.fn>

  beforeEach(() => {
    chunkListener = null
    exitListener = null
    chunkUnsub = vi.fn()
    exitUnsub = vi.fn()
    ;(window as unknown as { tokenless: unknown }).tokenless = {
      cc: {
        start: vi.fn(),
        send: vi.fn(),
        resize: vi.fn(),
        onOutputChunk: (fn: typeof chunkListener) => {
          chunkListener = fn
          return chunkUnsub
        },
        onExit: (fn: typeof exitListener) => {
          exitListener = fn
          return exitUnsub
        }
      }
    }
  })

  it('forwards chunks for the matching conversationId', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk }))
    act(() => chunkListener?.({ conversationId: 7, chunk: 'hello' }))
    expect(onChunk).toHaveBeenCalledWith('hello')
  })

  it('ignores chunks for other conversations', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk }))
    act(() => chunkListener?.({ conversationId: 99, chunk: 'wrong' }))
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('does not subscribe when conversationId is null', () => {
    const onChunk = vi.fn()
    renderHook(() => useCcSubscription(null, { onChunk }))
    expect(chunkListener).toBeNull()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCcSubscription(7, { onChunk: vi.fn() }))
    unmount()
    expect(chunkUnsub).toHaveBeenCalled()
    expect(exitUnsub).toHaveBeenCalled()
  })

  it('forwards exits via onExit callback', () => {
    const onExit = vi.fn()
    renderHook(() => useCcSubscription(7, { onChunk: vi.fn(), onExit }))
    act(() => exitListener?.({ conversationId: 7, exitCode: 0 }))
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: undefined })
  })
})
