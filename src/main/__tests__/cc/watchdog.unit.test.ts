import { describe, it, expect, vi } from 'vitest'

import { Watchdog } from '../../cc/watchdog'

// Purpose: Watchdog fires onIdle callbacks after configured idle periods.
// reset() restarts the timers. stop() cancels them. Two thresholds: warn
// (default 60s) and error (default 90s). Fully time-injected for tests.

describe('cc/watchdog', () => {
  function makeClock() {
    let now = 0
    const queued: { fireAt: number; fn: () => void; cancelled: boolean }[] = []
    const setTimeoutFn: typeof setTimeout = ((fn: () => void, ms: number) => {
      const entry = { fireAt: now + ms, fn, cancelled: false }
      queued.push(entry)
      return entry as unknown as ReturnType<typeof setTimeout>
    }) as never
    const clearTimeoutFn: typeof clearTimeout = ((timer: { cancelled: boolean }) => {
      timer.cancelled = true
    }) as never
    return {
      advance(ms: number): void {
        now += ms
        for (const e of queued) {
          if (!e.cancelled && e.fireAt <= now) {
            e.cancelled = true
            e.fn()
          }
        }
      },
      setTimeoutFn,
      clearTimeoutFn
    }
  }

  it('fires warn callback after warnMs, error callback after errorMs', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(1000)
    expect(onIdle).toHaveBeenCalledWith('warn')
    clock.advance(1000)
    expect(onIdle).toHaveBeenCalledWith('error')
  })

  it('reset cancels pending timers and starts fresh', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(500)
    wd.reset()
    clock.advance(800) // total 1300 — would have fired if not reset
    expect(onIdle).not.toHaveBeenCalled()
    clock.advance(200) // 1000 since reset
    expect(onIdle).toHaveBeenCalledWith('warn')
  })

  it('stop cancels all pending timers', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    wd.stop()
    clock.advance(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('does not double-fire if reset happens after warn', () => {
    const onIdle = vi.fn()
    const clock = makeClock()
    const wd = new Watchdog({
      warnMs: 1000,
      errorMs: 2000,
      onIdle,
      setTimeout: clock.setTimeoutFn,
      clearTimeout: clock.clearTimeoutFn
    })
    wd.start()
    clock.advance(1000) // warn fires
    expect(onIdle).toHaveBeenCalledTimes(1)
    wd.reset()
    clock.advance(1000) // warn fires again (fresh)
    expect(onIdle).toHaveBeenCalledTimes(2)
  })
})
