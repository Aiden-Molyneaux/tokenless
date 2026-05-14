// Re-export shared types for ergonomic imports inside main/observability.
// Plus add LogRecordInput — the slice of LogRecord the caller provides;
// id, ts, source, and fingerprint are populated by the Logger at materialize time.

export type {
  Category,
  LogRecord,
  Severity,
  Source
} from '@shared/observability'

import type { Category, Severity } from '@shared/observability'

export interface LogRecordInput {
  severity: Severity
  category: Category
  event: string
  message: string
  context: Record<string, unknown>
  stack?: string
}
