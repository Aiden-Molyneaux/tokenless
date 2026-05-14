// Watchdog — per-slot idle timer. Fires `onIdle('warn')` after warnMs of no
// reset, then `onIdle('error')` after errorMs. `reset()` cancels both and
// restarts; the production wiring resets on every PTY data chunk so a
// streaming conversation never trips the watchdog.
//
// Timer functions are injected so tests don't need fake timers from vitest.

export type WatchdogSeverity = 'warn' | 'error'

interface WatchdogOptions {
  readonly warnMs: number
  readonly errorMs: number
  readonly onIdle: (severity: WatchdogSeverity) => void
  readonly setTimeout?: (fn: () => void, ms: number) => unknown
  readonly clearTimeout?: (timer: unknown) => void
}

export class Watchdog {
  private warnTimer: unknown = null
  private errorTimer: unknown = null
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown
  private readonly clearTimeoutFn: (timer: unknown) => void

  constructor(private readonly opts: WatchdogOptions) {
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimeoutFn = opts.clearTimeout ?? ((t) => globalThis.clearTimeout(t as never))
  }

  start(): void {
    this.scheduleBoth()
  }

  reset(): void {
    this.clearBoth()
    this.scheduleBoth()
  }

  stop(): void {
    this.clearBoth()
  }

  private scheduleBoth(): void {
    this.warnTimer = this.setTimeoutFn(() => {
      this.warnTimer = null
      this.opts.onIdle('warn')
    }, this.opts.warnMs)
    this.errorTimer = this.setTimeoutFn(() => {
      this.errorTimer = null
      this.opts.onIdle('error')
    }, this.opts.errorMs)
  }

  private clearBoth(): void {
    if (this.warnTimer !== null) {
      this.clearTimeoutFn(this.warnTimer)
      this.warnTimer = null
    }
    if (this.errorTimer !== null) {
      this.clearTimeoutFn(this.errorTimer)
      this.errorTimer = null
    }
  }
}
