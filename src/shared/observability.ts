// Shared observability types. Importable from BOTH main and renderer.
// The full Logger service (sinks, dispatch, etc.) lives in src/main/observability/
// because it touches the filesystem and IPC — but the types themselves are pure
// data and need to be referenceable everywhere.

export const CATEGORIES = [
  'api',
  'db',
  'ipc',
  'ui',
  'skill',
  'auth',
  'gearing',
  'clipboard',
  'fs',
  'observability'
] as const

export type Category = (typeof CATEGORIES)[number]

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type Source = 'main' | 'renderer'

export interface LogRecord {
  id: string
  ts: number
  severity: Severity
  category: Category
  event: string
  message: string
  context: Record<string, unknown>
  stack?: string
  fingerprint: string
  source: Source
}
