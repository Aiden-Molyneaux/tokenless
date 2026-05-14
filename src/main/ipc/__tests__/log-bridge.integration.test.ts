import { describe, expect, it, vi } from 'vitest'
import { LogBridge } from '../log-bridge'
import type { Logger } from '@main/observability'
import type { LogRecord } from '@shared/observability'

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    id: 'r-id',
    ts: 1234567890,
    severity: 'info',
    category: 'observability',
    event: 'test',
    message: 'msg',
    context: {},
    fingerprint: 'fp',
    source: 'renderer',
    ...overrides
  }
}

function fakeLogger() {
  const subscribers: Array<(r: LogRecord) => void> = []
  let ingestedRecords: LogRecord[] = []
  const logger = {
    ingestFromRenderer: vi.fn((r: LogRecord) => {
      ingestedRecords.push(r)
      subscribers.forEach((s) => s(r))
    }),
    subscribe: vi.fn((fn: (r: LogRecord) => void) => {
      subscribers.push(fn)
      return () => {
        const i = subscribers.indexOf(fn)
        if (i >= 0) subscribers.splice(i, 1)
      }
    }),
    getRecent: vi.fn((_n?: number) => [] as LogRecord[])
  } as unknown as Logger
  return { logger, ingestedRecords, subscribers }
}

function fakeIpcMain() {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const invokeHandlers: Record<string, (...args: unknown[]) => unknown> = {}
  const ipc = {
    on: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    }),
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      invokeHandlers[channel] = fn
    }),
    removeAllListeners: vi.fn()
  }
  return { ipc, handlers, invokeHandlers }
}

function fakeBroadcast() {
  const sent: Array<{ channel: string; payload: unknown }> = []
  return {
    sent,
    fn: vi.fn((channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    })
  }
}

describe('LogBridge', () => {
  it('forwards renderer records via ingestFromRenderer', () => {
    const { logger, ingestedRecords } = fakeLogger()
    const { ipc, handlers } = fakeIpcMain()
    const { fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    const record = makeRecord({ event: 'from-renderer' })
    // simulate the renderer firing the channel
    handlers['log:event-from-renderer']!({} as never, { record })

    expect(ingestedRecords.length).toBe(1)
    expect(ingestedRecords[0].event).toBe('from-renderer')
  })

  it('broadcasts records dispatched in the Logger to all windows', () => {
    const { logger } = fakeLogger()
    const { ipc } = fakeIpcMain()
    const { sent, fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    // Trigger via ingestFromRenderer (which calls subscribers, of which
    // the bridge is one)
    logger.ingestFromRenderer(makeRecord({ event: 'broadcasted' }))

    expect(sent.length).toBe(1)
    expect(sent[0].channel).toBe('log:event-to-renderer')
    expect((sent[0].payload as { record: LogRecord }).record.event).toBe('broadcasted')
  })

  it('responds to log:get-recent with logger.getRecent', () => {
    const { logger } = fakeLogger()
    const recentMock = [makeRecord({ event: 'a' }), makeRecord({ event: 'b' })]
    ;(logger.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(recentMock)
    const { ipc, invokeHandlers } = fakeIpcMain()
    const { fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()

    const result = invokeHandlers['log:get-recent']!({} as never, { count: 500 })
    expect(logger.getRecent).toHaveBeenCalledWith(500)
    expect(result).toEqual({ records: recentMock })
  })

  it('uninstall removes listeners and unsubscribes from the Logger', () => {
    const { logger } = fakeLogger()
    const { ipc } = fakeIpcMain()
    const { sent, fn: broadcast } = fakeBroadcast()

    const bridge = new LogBridge(logger, ipc as never, broadcast)
    bridge.install()
    bridge.uninstall()

    // After uninstall, dispatched records should NOT be broadcast
    logger.ingestFromRenderer(makeRecord({ event: 'after-uninstall' }))
    expect(sent.length).toBe(0)
    expect(ipc.removeAllListeners).toHaveBeenCalled()
  })
})
