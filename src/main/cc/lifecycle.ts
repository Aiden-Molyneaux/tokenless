// CcLifecycle — owns active claude PTY subprocesses keyed by conversationId.
// Phase 4A enforces one PTY per conversationId at a time. The spawn factory
// is injected so production wires node-pty's spawn and tests wire MockPty.
//
// Session IDs are generated here (UUID v4 via node:crypto) and returned to the
// caller so the IPC handler can persist conversations.cc_session_id (ADR-016).
//
// Data + exit events are fanned out via the constructor callbacks rather than
// EventEmitter so the test for "onChunk fires" is trivial.

import { randomUUID } from 'node:crypto'

import type { CcEvent } from '@shared/types/cc-events'

import { spawnClaude } from './spawner'
import type { PtyHandle, PtySpawnFn } from './types'
import { CcParser } from './parser'

export interface LifecycleStartOptions {
  readonly conversationId: number
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: { readonly CLAUDE_CONFIG_DIR: string; readonly ANTHROPIC_API_KEY?: string }
  readonly claudeBin?: string
}

export interface LifecycleResumeOptions {
  readonly conversationId: number
  readonly sessionId: string
  readonly cwd: string
  readonly cols: number
  readonly rows: number
  readonly env: { readonly CLAUDE_CONFIG_DIR: string; readonly ANTHROPIC_API_KEY?: string }
  readonly claudeBin?: string
}

export interface LifecycleStartResult {
  readonly sessionId: string
  readonly pid: number
}

export interface LifecycleCallbacks {
  onChunk(event: { conversationId: number; chunk: string }): void
  onExit(event: { conversationId: number; exitCode: number; signal?: number }): void
  onEvent(event: { conversationId: number; event: CcEvent }): void
}

interface Slot {
  readonly conversationId: number
  readonly sessionId: string
  readonly pty: PtyHandle
  readonly parser: CcParser
}

export class CcLifecycle {
  private readonly slots = new Map<number, Slot>()

  constructor(
    private readonly ptyFactory: PtySpawnFn,
    private readonly cb: LifecycleCallbacks
  ) {}

  start(opts: LifecycleStartOptions): LifecycleStartResult {
    if (this.slots.has(opts.conversationId)) {
      throw new Error(`conversation ${opts.conversationId} already active — one PTY per conversation`)
    }
    const sessionId = randomUUID()
    const pty = spawnClaude(
      {
        conversationId: opts.conversationId,
        sessionId,
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
        env: opts.env,
        claudeBin: opts.claudeBin
      },
      this.ptyFactory
    )
    const parser = new CcParser((event) => {
      this.cb.onEvent({ conversationId: opts.conversationId, event })
    })
    const slot: Slot = { conversationId: opts.conversationId, sessionId, pty, parser }
    this.slots.set(opts.conversationId, slot)

    pty.onData((chunk) => {
      parser.feed(chunk)
      this.cb.onChunk({ conversationId: opts.conversationId, chunk })
    })
    pty.onExit(({ exitCode, signal }) => {
      this.slots.delete(opts.conversationId)
      this.cb.onExit({ conversationId: opts.conversationId, exitCode, signal })
    })

    return { sessionId, pid: pty.pid }
  }

  resume(opts: LifecycleResumeOptions): LifecycleStartResult {
    if (this.slots.has(opts.conversationId)) {
      throw new Error(`conversation ${opts.conversationId} already active — one PTY per conversation`)
    }
    const pty = spawnClaude(
      {
        conversationId: opts.conversationId,
        sessionId: opts.sessionId,
        resume: true,
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
        env: opts.env,
        claudeBin: opts.claudeBin
      },
      this.ptyFactory
    )
    const parser = new CcParser((event) => {
      this.cb.onEvent({ conversationId: opts.conversationId, event })
    })
    const slot: Slot = {
      conversationId: opts.conversationId,
      sessionId: opts.sessionId, // existing — don't generate
      pty,
      parser
    }
    this.slots.set(opts.conversationId, slot)

    pty.onData((chunk) => {
      parser.feed(chunk)
      this.cb.onChunk({ conversationId: opts.conversationId, chunk })
    })
    pty.onExit(({ exitCode, signal }) => {
      this.slots.delete(opts.conversationId)
      this.cb.onExit({ conversationId: opts.conversationId, exitCode, signal })
    })

    return { sessionId: opts.sessionId, pid: pty.pid }
  }

  get(conversationId: number): PtyHandle | null {
    return this.slots.get(conversationId)?.pty ?? null
  }

  getSessionId(conversationId: number): string | null {
    return this.slots.get(conversationId)?.sessionId ?? null
  }

  write(conversationId: number, data: string): void {
    const slot = this.slots.get(conversationId)
    if (!slot) throw new Error(`no active pty for conversation ${conversationId}`)
    slot.pty.write(data + '\r')
  }

  resize(conversationId: number, cols: number, rows: number): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    slot.pty.resize(cols, rows)
  }

  stop(conversationId: number, signal: string = 'SIGINT'): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    slot.pty.kill(signal)
  }

  closeAll(): void {
    for (const slot of this.slots.values()) {
      slot.pty.kill('SIGTERM')
    }
    this.slots.clear()
  }

  activeCount(): number {
    return this.slots.size
  }
}
