import type { Category, LogRecord, Severity } from '@shared/observability'

// Renderer-side logger shim. Materializes LogRecords with source='renderer'
// and ships them to main via window.tokenless.log.send. Mirrors the main-side
// Logger's API (debug/info/warn/error/fatal) so call sites read the same way.
//
// Fingerprint uses a simple polynomial hash here rather than SHA-256 because
// crypto.subtle.digest is async-only and we want this call to stay synchronous
// for ergonomics. Fingerprints don't need cryptographic strength — they need
// stability per (category, event, stack) tuple, which a simple hash provides.

function fingerprint(category: string, event: string, stack: string | undefined): string {
  const key = `${category}::${event}::${stack ?? ''}`
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function makeRecord(
  severity: Severity,
  category: Category,
  event: string,
  message: string,
  context: Record<string, unknown>,
  stack?: string
): LogRecord {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    severity,
    category,
    event,
    message,
    context,
    stack,
    fingerprint: fingerprint(category, event, stack),
    source: 'renderer'
  }
}

function send(record: LogRecord): void {
  if (typeof window !== 'undefined' && window.tokenless?.log) {
    window.tokenless.log.send(record)
  }
  // If the bridge isn't available (e.g. SSR or unmocked test), silently drop.
}

export const rendererLogger = {
  debug(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('debug', category, event, message, context))
  },
  info(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('info', category, event, message, context))
  },
  warn(category: Category, event: string, message: string, context: Record<string, unknown> = {}): void {
    send(makeRecord('warn', category, event, message, context))
  },
  error(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    send(makeRecord('error', category, event, message, context, stack))
  },
  fatal(
    category: Category,
    event: string,
    message: string,
    context: Record<string, unknown> = {},
    stack?: string
  ): void {
    send(makeRecord('fatal', category, event, message, context, stack))
  }
}
