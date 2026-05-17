import { describe, it, expect, beforeEach, vi } from 'vitest'

import { CrashHandler } from '../../ipc/crash-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100, 'main'
  )
}

describe('ipc/crash-handler', () => {
  // Verifies that CrashHandler correctly builds CrashReport payloads from
  // error inputs, including populating the ring buffer snapshot and system info.

  let logger: Logger
  let broadcast: ReturnType<typeof vi.fn>
  let handler: CrashHandler

  beforeEach(() => {
    logger = makeLogger()
    broadcast = vi.fn()
    handler = new CrashHandler(logger, broadcast)
  })

  it('getReport returns ok with a fully-populated CrashReport', async () => {
    logger.info('observability', 'test-event', 'msg', {})
    const r = await handler.getReport({ source: 'renderer', message: 'oops', stack: 'at foo:1:1' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const report = r.data.report
      expect(report.source).toBe('renderer')
      expect(report.message).toBe('oops')
      expect(report.stack).toBe('at foo:1:1')
      expect(report.timestamp).toBeGreaterThan(0)
      expect(report.recentLogs.length).toBeGreaterThanOrEqual(1)
      expect(report.system.platform).toBeDefined()
      expect(report.system.electronVersion).toBeDefined()
      expect(report.system.nodeVersion).toBeDefined()
      // __APP_VERSION__ is bake-time only; runtime tests see the fallback
      expect(report.system.appVersion).toBe('unknown')
    }
  })

  it('buildReport caps recentLogs at 100 entries even when ring buffer has more', () => {
    for (let i = 0; i < 200; i++) {
      logger.info('observability', 'spam', `msg-${i}`, {})
    }
    const report = handler.buildReport({ source: 'main', message: 'crash', stack: null })
    expect(report.recentLogs.length).toBeLessThanOrEqual(100)
  })
})
