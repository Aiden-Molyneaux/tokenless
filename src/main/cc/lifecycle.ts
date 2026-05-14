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
import { Watchdog } from './watchdog'

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
  // Phase 4C
  onCrashed(event: { conversationId: number; exitCode: number; signal?: number }): void
  onHung(event: { conversationId: number; idleMs: number; severity: 'warn' | 'error' }): void
}

export interface LifecycleConfig {
  readonly watchdogWarnMs?: number   // default 60_000
  readonly watchdogErrorMs?: number  // default 90_000
}

interface Slot {
  readonly conversationId: number
  readonly sessionId: string
  readonly pty: PtyHandle
  readonly parser: CcParser
  readonly watchdog: Watchdog
  // sawGracefulPrompt is set when the parser fires prompt-ready. Used by
  // the onExit handler to distinguish "claude crashed mid-response" from
  // "claude exited cleanly after returning to a prompt."
  sawGracefulPrompt: boolean
}

export class CcLifecycle {
  private readonly slots = new Map<number, Slot>()

  constructor(
    private readonly ptyFactory: PtySpawnFn,
    private readonly cb: LifecycleCallbacks,
    private readonly config: LifecycleConfig = {}
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
      if (event.kind === 'prompt-ready') {
        const s = this.slots.get(opts.conversationId)
        if (s) s.sawGracefulPrompt = true
      }
      this.cb.onEvent({ conversationId: opts.conversationId, event })
    })

    const slot: Slot = {
      conversationId: opts.conversationId,
      sessionId,
      pty,
      parser,
      watchdog: new Watchdog({
        warnMs: this.config.watchdogWarnMs ?? 60_000,
        errorMs: this.config.watchdogErrorMs ?? 90_000,
        onIdle: (severity) => {
          const idleMs = severity === 'warn'
            ? (this.config.watchdogWarnMs ?? 60_000)
            : (this.config.watchdogErrorMs ?? 90_000)
          this.cb.onHung({ conversationId: opts.conversationId, idleMs, severity })
        }
      }),
      sawGracefulPrompt: false
    }
    this.slots.set(opts.conversationId, slot)
    slot.watchdog.start()

    pty.onData((chunk) => {
      slot.watchdog.reset()
      parser.feed(chunk)
      this.cb.onChunk({ conversationId: opts.conversationId, chunk })
    })
    pty.onExit(({ exitCode, signal }) => {
      const s = this.slots.get(opts.conversationId)
      if (s) s.watchdog.stop()
      this.slots.delete(opts.conversationId)
      // Decide if this is a crash: non-zero exit code AND we didn't see a
      // graceful prompt-ready before exit. SIGTERM/SIGINT from our own stop()
      // are NOT crashes (signal is set).
      const isCrash = exitCode !== 0 && signal === undefined && !(s?.sawGracefulPrompt ?? false)
      if (isCrash) {
        this.cb.onCrashed({ conversationId: opts.conversationId, exitCode, signal })
      }
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
      if (event.kind === 'prompt-ready') {
        const s = this.slots.get(opts.conversationId)
        if (s) s.sawGracefulPrompt = true
      }
      this.cb.onEvent({ conversationId: opts.conversationId, event })
    })

    const slot: Slot = {
      conversationId: opts.conversationId,
      sessionId: opts.sessionId, // existing — don't generate
      pty,
      parser,
      watchdog: new Watchdog({
        warnMs: this.config.watchdogWarnMs ?? 60_000,
        errorMs: this.config.watchdogErrorMs ?? 90_000,
        onIdle: (severity) => {
          const idleMs = severity === 'warn'
            ? (this.config.watchdogWarnMs ?? 60_000)
            : (this.config.watchdogErrorMs ?? 90_000)
          this.cb.onHung({ conversationId: opts.conversationId, idleMs, severity })
        }
      }),
      sawGracefulPrompt: false
    }
    this.slots.set(opts.conversationId, slot)
    slot.watchdog.start()

    pty.onData((chunk) => {
      slot.watchdog.reset()
      parser.feed(chunk)
      this.cb.onChunk({ conversationId: opts.conversationId, chunk })
    })
    pty.onExit(({ exitCode, signal }) => {
      const s = this.slots.get(opts.conversationId)
      if (s) s.watchdog.stop()
      this.slots.delete(opts.conversationId)
      // Decide if this is a crash: non-zero exit code AND we didn't see a
      // graceful prompt-ready before exit. SIGTERM/SIGINT from our own stop()
      // are NOT crashes (signal is set).
      const isCrash = exitCode !== 0 && signal === undefined && !(s?.sawGracefulPrompt ?? false)
      if (isCrash) {
        this.cb.onCrashed({ conversationId: opts.conversationId, exitCode, signal })
      }
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
    try {
      slot.pty.write(data + '\r')
    } catch (err) {
      const tagged = new Error(
        `pty.write failed for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`
      ) as Error & { code?: string; cause?: unknown }
      tagged.code = 'PTY_WRITE_FAILED'
      tagged.cause = err
      throw tagged
    }
  }

  resize(conversationId: number, cols: number, rows: number): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    slot.pty.resize(cols, rows)
  }

  stop(conversationId: number, signal: string = 'SIGINT'): void {
    const slot = this.slots.get(conversationId)
    if (!slot) return
    // node-pty on Windows does not support signal-based kill — calling
    // pty.kill(signal) throws "Signals not supported on windows." Use the
    // no-arg form which terminates the process unconditionally on all platforms.
    if (process.platform === 'win32') {
      slot.pty.kill()
    } else {
      slot.pty.kill(signal)
    }
  }

  closeAll(): void {
    for (const slot of this.slots.values()) {
      // Same Windows compatibility fix as stop() above.
      if (process.platform === 'win32') {
        slot.pty.kill()
      } else {
        slot.pty.kill('SIGTERM')
      }
    }
    this.slots.clear()
  }

  activeCount(): number {
    return this.slots.size
  }
}
