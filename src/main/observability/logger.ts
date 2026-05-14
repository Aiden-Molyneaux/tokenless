import { createHash, randomUUID } from 'node:crypto'
import type { Category, LogRecord, LogRecordInput, Source } from './types'
import { RingBuffer } from './ring-buffer'
import type { FileSink } from './file-sink'

type Subscriber = (record: LogRecord) => void

// Logger is the spine of TokenLess observability. Every error path routes
// through this class (or its renderer-side counterpart). Three fan-out sinks:
//   1. In-memory ring buffer for Dev Mode 'getRecent' queries.
//   2. FileSink for durable JSONL persistence.
//   3. Subscribers for live streaming (the IPC bridge subscribes here to
//      push records to the renderer's Dev Mode panel).

export class Logger {
  private readonly buffer: RingBuffer<LogRecord>
  private readonly subscribers = new Set<Subscriber>()

  constructor(
    private readonly fileSink: FileSink,
    bufferCapacity: number = 5000,
    private readonly source: Source = 'main'
  ) {
    this.buffer = new RingBuffer<LogRecord>(bufferCapacity)
  }

  debug(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'debug', category, event, message, context })
  }

  info(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'info', category, event, message, context })
  }

  warn(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    this.log({ severity: 'warn', category, event, message, context })
  }

  error(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    this.log({ severity: 'error', category, event, message, context, stack })
  }

  fatal(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    this.log({ severity: 'fatal', category, event, message, context, stack })
  }

  // Receives a record that was already materialized by the renderer side.
  // Source on those records is 'renderer'; we do NOT overwrite it.
  ingestFromRenderer(record: LogRecord): void {
    this.dispatch(record)
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  getRecent(n: number = 1000): readonly LogRecord[] {
    const all = this.buffer.getAll()
    return all.slice(-n)
  }

  private log(input: LogRecordInput): void {
    const record = this.materialize(input)
    this.dispatch(record)
  }

  private dispatch(record: LogRecord): void {
    this.buffer.push(record)
    this.fileSink.write(record)
    for (const sub of this.subscribers) {
      try {
        sub(record)
      } catch {
        // Swallow subscriber errors so logging never cascades. If a subscriber
        // is failing repeatedly, that's an issue to surface separately — but
        // it never blocks downstream logging.
      }
    }
  }

  private materialize(input: LogRecordInput): LogRecord {
    return {
      severity: input.severity,
      category: input.category,
      event: input.event,
      message: input.message,
      context: input.context,
      stack: input.stack,
      id: randomUUID(),
      ts: Date.now(),
      source: this.source,
      fingerprint: this.fingerprint(input)
    }
  }

  private fingerprint(input: LogRecordInput): string {
    const key = `${input.category}::${input.event}::${input.stack ?? ''}`
    return createHash('sha256').update(key).digest('hex').slice(0, 16)
  }
}
