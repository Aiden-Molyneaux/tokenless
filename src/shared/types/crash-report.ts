import type { LogRecord } from '../observability'

export interface CrashReport {
  readonly source: 'main' | 'renderer'
  readonly message: string
  readonly stack: string | null
  readonly timestamp: number
  // Snapshot of the most recent log records before the crash.
  readonly recentLogs: readonly LogRecord[]
  // Lightweight system info (no PII).
  readonly system: {
    readonly platform: string
    readonly electronVersion: string
    readonly nodeVersion: string
    readonly appVersion: string
  }
}
