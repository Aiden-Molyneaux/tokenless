import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import type { LogRecord } from '@shared/observability'
import type { FileSink } from '../file-sink'

function fakeFileSink(): FileSink & { written: LogRecord[] } {
  const written: LogRecord[] = []
  return {
    written,
    write: (record: LogRecord) => {
      written.push(record)
    }
  } as unknown as FileSink & { written: LogRecord[] }
}

describe('Logger', () => {
  it('records info() call into ring buffer and file sink', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.info('observability', 'startup', 'Logger online', { pid: 123 })

    expect(sink.written.length).toBe(1)
    const rec = sink.written[0]
    expect(rec.severity).toBe('info')
    expect(rec.category).toBe('observability')
    expect(rec.event).toBe('startup')
    expect(rec.message).toBe('Logger online')
    expect(rec.context).toEqual({ pid: 123 })
    expect(rec.source).toBe('main')
    expect(typeof rec.id).toBe('string')
    expect(rec.id.length).toBeGreaterThan(0)
    expect(typeof rec.ts).toBe('number')
    expect(rec.fingerprint.length).toBe(16)
  })

  it('all 5 severity methods produce records with correct severity', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.debug('observability', 'd', 'd')
    logger.info('observability', 'i', 'i')
    logger.warn('observability', 'w', 'w')
    logger.error('observability', 'e', 'e')
    logger.fatal('observability', 'f', 'f')
    expect(sink.written.map((r) => r.severity)).toEqual(['debug', 'info', 'warn', 'error', 'fatal'])
  })

  it('error() and fatal() accept an optional stack', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.error('observability', 'oops', 'broke', { x: 1 }, 'Error: broke\n  at foo')
    expect(sink.written[0].stack).toBe('Error: broke\n  at foo')
  })

  it('fingerprint is stable for identical event/category/stack and differs otherwise', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    logger.error('observability', 'a', 'x', {}, 'stack-1')
    logger.error('observability', 'a', 'x', {}, 'stack-1')
    logger.error('observability', 'a', 'x', {}, 'stack-2')
    expect(sink.written[0].fingerprint).toBe(sink.written[1].fingerprint)
    expect(sink.written[0].fingerprint).not.toBe(sink.written[2].fingerprint)
  })

  it('getRecent returns the last N records', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    for (let i = 0; i < 5; i++) logger.info('observability', `event-${i}`, `msg-${i}`)
    const recent = logger.getRecent(3)
    expect(recent.length).toBe(3)
    expect(recent.map((r) => r.event)).toEqual(['event-2', 'event-3', 'event-4'])
  })

  it('subscribers receive every dispatched record', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const subscriber = vi.fn()
    const unsubscribe = logger.subscribe(subscriber)
    logger.info('observability', 'one', 'one')
    logger.info('observability', 'two', 'two')
    unsubscribe()
    logger.info('observability', 'three', 'three')
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(subscriber.mock.calls[0][0].event).toBe('one')
    expect(subscriber.mock.calls[1][0].event).toBe('two')
  })

  it('a throwing subscriber does not stop dispatch to others or break the logger', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const bad = vi.fn(() => { throw new Error('subscriber failed') })
    const good = vi.fn()
    logger.subscribe(bad)
    logger.subscribe(good)
    logger.info('observability', 'event', 'msg')
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
    expect(sink.written.length).toBe(1)
  })

  it('ingestFromRenderer pushes a pre-materialized record through dispatch (no re-materialize)', () => {
    const sink = fakeFileSink()
    const logger = new Logger(sink, 100, 'main')
    const rendererRecord: LogRecord = {
      id: 'renderer-uuid',
      ts: 1234567890,
      severity: 'warn',
      category: 'ui',
      event: 'react-warning',
      message: 'something weird',
      context: { component: 'App' },
      fingerprint: 'rendererfp123456',
      source: 'renderer'
    }
    logger.ingestFromRenderer(rendererRecord)
    expect(sink.written.length).toBe(1)
    expect(sink.written[0]).toEqual(rendererRecord)
  })
})
