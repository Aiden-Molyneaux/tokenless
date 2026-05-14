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

  beforeEach(() => {
    lastPty = null
    factory = (_bin, _args, opts) => {
      lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
      return lastPty
    }
    onChunk = vi.fn()
    onExit = vi.fn()
  })

  it('start spawns + stores + returns sessionId', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
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
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lastPty!.emitData('hello world')
    expect(onChunk).toHaveBeenCalledWith({ conversationId: 7, chunk: 'hello world' })
  })

  it('write delegates to the underlying pty + appends \\r line ending', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.write(7, 'a prompt')
    expect(lastPty!.writes).toEqual(['a prompt\r'])
  })

  it('write to unknown conversationId throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    expect(() => lc.write(999, 'x')).toThrow(/no active pty/i)
  })

  it('stop kills + removes from map + emits onExit', async () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
    lc.start({ conversationId: 7, cwd: 'C:/x', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    lc.stop(7)
    expect(lastPty!.killed).toBe(true)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(lc.get(7)).toBeNull()
    expect(onExit).toHaveBeenCalledWith({ conversationId: 7, exitCode: 0, signal: undefined })
  })

  it('only one pty per conversationId — second start throws', () => {
    const lc = new CcLifecycle(factory, { onChunk, onExit })
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
    const lc = new CcLifecycle(localFactory, { onChunk, onExit })
    lc.start({ conversationId: 1, cwd: 'C:/a', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty1 = lc.get(1) as unknown as MockPty
    lc.start({ conversationId: 2, cwd: 'C:/b', cols: 100, rows: 30, env: { CLAUDE_CONFIG_DIR: 'C:/c' } })
    const pty2 = lc.get(2) as unknown as MockPty
    lc.closeAll()
    expect(pty1.killed).toBe(true)
    expect(pty2.killed).toBe(true)
  })
})
