import { describe, it, expect, beforeEach, vi } from 'vitest'

import { CcLifecycle } from '../../cc/lifecycle'
import type { PtySpawnFn } from '../../cc/types'
import { MockPty } from '../../../../test/doubles/mock-pty'

// Purpose: CcLifecycle owns the conversationId -> PtyHandle map. Start spawns,
// stores, returns sessionId. Get returns the live handle (or null). Stop kills
// and removes. CloseAll kills every active pty. onData fans out chunks. onExit
// removes the dead pty from the map.

describe('cc/lifecycle', () => {
  let factory: PtySpawnFn
  let lastPty: MockPty | null
  let onChunk: ReturnType<typeof vi.fn>
  let onExit: ReturnType<typeof vi.fn>
  let onEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    lastPty = null
    factory = (_bin, _args, opts) => {
      lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      return lastPty
    }
    onChunk = vi.fn()
    onExit = vi.fn()
    onEvent = vi.fn()
  })

  it('start spawns + stores + returns sessionId', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    const { sessionId } = lc.start({
      conversationId: 7,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(lc.get(7)).not.toBeNull()
  })

  it('emits onChunk with conversationId + chunk on PTY output', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lastPty!.emitData('hello world')
    expect(onChunk).toHaveBeenCalledWith({ conversationId: 7, chunk: 'hello world' })
  })

  it('write delegates to the underlying pty + appends \\r line ending', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.write(7, 'a prompt')
    expect(lastPty!.writes).toEqual(['a prompt\r'])
  })

  it('write to unknown conversationId throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    expect(() => lc.write(999, 'x')).toThrow(/no active pty/i)
  })

  it('stop kills + removes from map + emits onExit', async () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.stop(7)
    expect(lastPty!.killed).toBe(true)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(lc.get(7)).toBeNull()
    expect(onExit).toHaveBeenCalledWith({ conversationId: 7, exitCode: 0, signal: undefined })
  })

  it('only one pty per conversationId — second start throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    expect(() =>
      lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    ).toThrow(/already active/i)
  })

  it('closeAll kills every pty', () => {
    const localFactory: PtySpawnFn = (_b, _a, opts) => {
      const p = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      return p
    }
    const lc = new CcLifecycle(localFactory, { onChunk, onExit, onEvent, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 1, cwd: 'C:/a', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty1 = lc.get(1) as unknown as MockPty
    lc.start({ conversationId: 2, cwd: 'C:/b', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty2 = lc.get(2) as unknown as MockPty
    lc.closeAll()
    expect(pty1.killed).toBe(true)
    expect(pty2.killed).toBe(true)
  })

  it('feeds chunks through the parser and emits cc:events', () => {
    const onEventLocal = vi.fn()
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent: onEventLocal, onCrashed: vi.fn(), onHung: vi.fn() })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lastPty!.emitData('claude-mock> ')
    expect(onEventLocal).toHaveBeenCalledWith({
      conversationId: 7,
      event: { kind: 'prompt-ready' }
    })
  })

  it('resume spawns with the provided sessionId and stores it in the slot', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung: vi.fn() })
    const r = lc.resume({
      conversationId: 5,
      sessionId: 'existing-uuid-here',
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    expect(r.sessionId).toBe('existing-uuid-here')
    expect(lc.getSessionId(5)).toBe('existing-uuid-here')
  })

  it('emits onCrashed when the PTY exits with non-zero code and no graceful prompt seen', async () => {
    const onCrashed = vi.fn()
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    // Simulate crash — no prompt-ready event before exit
    lastPty!.emitExit(1, undefined)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(onCrashed).toHaveBeenCalledWith({ conversationId: 7, exitCode: 1, signal: undefined })
  })

  it('does NOT emit onCrashed when SIGINT/SIGTERM caused the exit (signal set)', async () => {
    const onCrashed = vi.fn()
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    // Simulate a signal-driven exit (our own stop() path)
    lastPty!.emitExit(1, 2)  // signal=2 (SIGINT)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(onCrashed).not.toHaveBeenCalled()
  })

  it('does NOT emit onCrashed when a graceful prompt-ready was seen before exit', async () => {
    const onCrashed = vi.fn()
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed, onHung: vi.fn() }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    // Receive a graceful prompt, THEN exit non-zero (unusual but possible)
    lastPty!.emitData('claude-mock> ')
    lastPty!.emitExit(1, undefined)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(onCrashed).not.toHaveBeenCalled()
  })

  it('emits onHung after the configured warn/error thresholds', () => {
    vi.useFakeTimers()
    const onHung = vi.fn()
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung },
      { watchdogWarnMs: 1000, watchdogErrorMs: 2000 }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    vi.advanceTimersByTime(1000)
    expect(onHung).toHaveBeenCalledWith({ conversationId: 7, idleMs: 1000, severity: 'warn' })
    vi.advanceTimersByTime(1000)
    expect(onHung).toHaveBeenCalledWith({ conversationId: 7, idleMs: 2000, severity: 'error' })
    vi.useRealTimers()
  })

  it('watchdog resets on every onData chunk so streaming conversations never hang', () => {
    vi.useFakeTimers()
    const onHung = vi.fn()
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung },
      { watchdogWarnMs: 1000, watchdogErrorMs: 2000 }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500)
      lastPty!.emitData('chunk')
    }
    // 2.5s elapsed with regular activity — no hang
    expect(onHung).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('write throws PTY_WRITE_FAILED-tagged error when the underlying pty.write throws', () => {
    const lc = new CcLifecycle(
      factory,
      { onChunk, onExit, onEvent: vi.fn(), onCrashed: vi.fn(), onHung: vi.fn() }
    )
    lc.start({
      conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30,
      env: { CLAUDE_CONFIG_DIR: 'C:/c' }
    })
    // Inject a write failure by marking the pty as disposed (MockPty.write
    // throws for disposed ptys per its definition).
    lastPty!.markDisposed()
    let caught: (Error & { code?: string }) | null = null
    try {
      lc.write(7, 'hi')
    } catch (e) {
      caught = e as Error & { code?: string }
    }
    expect(caught?.code).toBe('PTY_WRITE_FAILED')
  })
})
