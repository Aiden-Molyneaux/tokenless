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

// Hook that returns the current set of log records seen by the Dev Mode panel.
// Subscribes to the live IPC stream on mount and unsubscribes on unmount.
// Optionally seeds with mock records for dev/test workflows.

export function useLogRecords({ mockRecords = [], mockOnly = false }: UseLogRecordsOptions = {}): readonly LogRecord[] {
  const [records, setRecords] = useState<readonly LogRecord[]>(() => mockRecords)
  const seenIds = useRef<Set<string>>(new Set(mockRecords.map((r) => r.id)))

  useEffect(() => {
    if (mockOnly) return undefined
    if (typeof window === 'undefined' || !window.tokenless?.log) return undefined

    // Fetch initial recent records so the panel doesn't start empty
    void window.tokenless.log
      .getRecent(1000)
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

  return records
}
