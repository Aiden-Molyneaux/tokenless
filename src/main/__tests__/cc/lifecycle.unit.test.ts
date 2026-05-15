import { describe, it, expect, vi, beforeEach } from 'vitest'

import { CcLifecycle } from '../../cc/lifecycle'
import type { PtySpawnFn } from '../../cc/types'
import { MockPty } from '../../../../test/doubles/mock-pty'

// Purpose: markUserSend arms the per-slot ResponseAccumulator so that the
// next response-complete event causes onAssistantTurn to fire with the
// accumulated text and token count.

describe('cc/lifecycle — ResponseAccumulator wiring', () => {
  let factory: PtySpawnFn
  let lastPty: MockPty | null

  beforeEach(() => {
    lastPty = null
    factory = (_bin, _args, opts) => {
      lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      return lastPty
    }
  })

  it('onAssistantTurn fires after markUserSend + response-complete with accumulated text', () => {
    const onAssistantTurn = vi.fn()
    const lc = new CcLifecycle(factory, {
      onChunk: vi.fn(),
      onExit: vi.fn(),
      onEvent: vi.fn(),
      onCrashed: vi.fn(),
      onHung: vi.fn(),
      onAssistantTurn
    })

    lc.start({ conversationId: 42, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })

    // Arm the accumulator as if a user turn was sent
    lc.markUserSend(42)

    // Feed PTY output that the parser will convert to response-chunk events
    // (any line not matching a known pattern) then a response-complete
    lastPty!.emitData('Hello from assistant\n')
    lastPty!.emitData('tokens: 123 / 200000\n')
    // "[mock-claude] received:" triggers response-complete in the parser
    lastPty!.emitData('[mock-claude] received: something\n')

    expect(onAssistantTurn).toHaveBeenCalledOnce()
    const call = onAssistantTurn.mock.calls[0][0]
    expect(call.conversationId).toBe(42)
    expect(call.text).toContain('Hello from assistant')
    expect(call.responseTokens).toBe(123)
  })

  it('onAssistantTurn does NOT fire if markUserSend was never called', () => {
    const onAssistantTurn = vi.fn()
    const lc = new CcLifecycle(factory, {
      onChunk: vi.fn(),
      onExit: vi.fn(),
      onEvent: vi.fn(),
      onCrashed: vi.fn(),
      onHung: vi.fn(),
      onAssistantTurn
    })

    lc.start({ conversationId: 42, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })

    // No markUserSend — accumulator not collecting
    lastPty!.emitData('Hello from assistant\n')
    lastPty!.emitData('[mock-claude] received: something\n')

    expect(onAssistantTurn).not.toHaveBeenCalled()
  })

  it('markUserSend is a no-op for unknown conversationId', () => {
    const lc = new CcLifecycle(factory, {
      onChunk: vi.fn(),
      onExit: vi.fn(),
      onEvent: vi.fn(),
      onCrashed: vi.fn(),
      onHung: vi.fn()
    })

    // Should not throw
    expect(() => lc.markUserSend(999)).not.toThrow()
  })

  it('onAssistantTurn fires after markUserSend via resume path', () => {
    const onAssistantTurn = vi.fn()
    const lc = new CcLifecycle(factory, {
      onChunk: vi.fn(),
      onExit: vi.fn(),
      onEvent: vi.fn(),
      onCrashed: vi.fn(),
      onHung: vi.fn(),
      onAssistantTurn
    })

    lc.resume({
      conversationId: 5,
      sessionId: 'existing-session-id',
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })

    lc.markUserSend(5)

    lastPty!.emitData('Resumed response text\n')
    lastPty!.emitData('[mock-claude] received: something\n')

    expect(onAssistantTurn).toHaveBeenCalledOnce()
    const call = onAssistantTurn.mock.calls[0][0]
    expect(call.conversationId).toBe(5)
    expect(call.text).toContain('Resumed response text')
  })

  it('omitting onAssistantTurn does not throw when response-complete fires', () => {
    // Existing callers that omit onAssistantTurn must continue to work
    const lc = new CcLifecycle(factory, {
      onChunk: vi.fn(),
      onExit: vi.fn(),
      onEvent: vi.fn(),
      onCrashed: vi.fn(),
      onHung: vi.fn()
      // onAssistantTurn intentionally omitted
    })

    lc.start({ conversationId: 42, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.markUserSend(42)

    expect(() => {
      lastPty!.emitData('Some text\n')
      lastPty!.emitData('[mock-claude] received: something\n')
    }).not.toThrow()
  })
})
