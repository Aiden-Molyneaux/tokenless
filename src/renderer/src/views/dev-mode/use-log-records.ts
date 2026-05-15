import { useEffect, useRef, useState } from 'react'
import type { LogRecord } from '@shared/observability'

interface UseLogRecordsOptions {
  // If provided, use these as the initial set of records (useful for dev/E2E).
  // Live records subscribed via window.tokenless.log are still appended on top.
  mockRecords?: readonly LogRecord[]

  // If true, do NOT subscribe to the live IPC stream. Defaults to false.
  // Set to true in E2E tests that want to drive the panel purely with mocks.
  mockOnly?: boolean
}

export interface UseLogRecordsReturn {
  readonly records: readonly LogRecord[]
  readonly isBackfilling: boolean
}

// Hook that returns the current set of log records seen by the Dev Mode panel.
// Subscribes to the live IPC stream on mount and unsubscribes on unmount.
// Optionally seeds with mock records for dev/test workflows.
//
// IMPORTANT: `mockRecords` is captured by the useState and useRef initializers
// only on mount. Passing a new array reference after mount does NOT update the
// internal seen-ids dedup set, so callers cannot dynamically swap mock sets at
// runtime. Phase 1B's only caller (DevModePanel) passes the module-level
// MOCK_RECORDS constant which has stable identity; Phase 2A keeps this pattern.
// If a future caller needs dynamic mocks, this hook needs to be reworked to
// track mockRecords as a useEffect dependency.

export function useLogRecords({ mockRecords = [], mockOnly = false }: UseLogRecordsOptions = {}): UseLogRecordsReturn {
  const [records, setRecords] = useState<readonly LogRecord[]>(() => mockRecords)
  const [isBackfilling, setIsBackfilling] = useState(true)
  const seenIds = useRef<Set<string>>(new Set(mockRecords.map((r) => r.id)))

  useEffect(() => {
    if (mockOnly) {
      setIsBackfilling(false)
      return undefined
    }
    if (typeof window === 'undefined' || !window.tokenless?.log) {
      setIsBackfilling(false)
      return undefined
    }

    // Fetch up to 5000 historical records on mount — matches the main-process
    // ring buffer capacity (Logger constructed with `new Logger(fileSink, 5000)`).
    void window.tokenless.log
      .getRecent(5000)
      .then((recent) => {
        setRecords((prev) => {
          const next = [...prev]
          for (const r of recent) {
            if (!seenIds.current.has(r.id)) {
              seenIds.current.add(r.id)
              next.push(r)
            }
          }
          return next
        })
      })
      .catch(() => {
        // Initial fetch failure is non-fatal — live stream still works
      })
      .finally(() => setIsBackfilling(false))

    // Subscribe to the live stream
    const unsubscribe = window.tokenless.log.subscribe((record: LogRecord) => {
      setRecords((prev) => {
        if (seenIds.current.has(record.id)) return prev
        seenIds.current.add(record.id)
        return [...prev, record]
      })
    })

    return unsubscribe
  }, [mockOnly])

  return { records, isBackfilling }
}
