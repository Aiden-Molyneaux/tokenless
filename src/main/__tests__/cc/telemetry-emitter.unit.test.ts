import { describe, it, expect, vi } from 'vitest'

import { TelemetryEmitter } from '../../cc/telemetry-emitter'

describe('cc/telemetry-emitter', () => {
  it('emits a tick when handle is called with tokens-used; coalesces multiple within interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 7, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.handle({ conversationId: 7, event: { kind: 'tokens-used', used: 150, total: 200000 } })
    expect(emit).not.toHaveBeenCalled() // Not yet — waiting for interval
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 7,
      contextUsed: 150,
      contextTotal: 200000,
      contextPercent: expect.any(Number)
    }))
    vi.useRealTimers()
  })

  it('does not emit when nothing changed in the last interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    vi.advanceTimersByTime(3000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('emits independent ticks for different conversations', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.handle({ conversationId: 2, event: { kind: 'tokens-used', used: 5000, total: 200000 } })
    vi.advanceTimersByTime(1000)
    expect(emit).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('stop cancels the interval', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.stop()
    vi.advanceTimersByTime(5000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('removeConversation clears state so subsequent ticks for that id stop', () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const te = new TelemetryEmitter({ intervalMs: 1000, emit })
    te.start()
    te.handle({ conversationId: 1, event: { kind: 'tokens-used', used: 100, total: 200000 } })
    te.removeConversation(1)
    vi.advanceTimersByTime(1000)
    expect(emit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
