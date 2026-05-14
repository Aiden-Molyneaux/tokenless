import type { LogRecord } from '@shared/observability'

declare global {
  interface Window {
    tokenless: {
      version: string
      log: {
        send(record: LogRecord): void
        subscribe(fn: (record: LogRecord) => void): () => void
        getRecent(count?: number): Promise<readonly LogRecord[]>
      }
    }
  }
}

export {}
