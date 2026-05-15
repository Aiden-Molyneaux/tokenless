import { useCallback, useEffect, useRef, useState } from 'react'

import type { TelemetrySummary } from '@shared/types/telemetry-summary'

interface UseTelemetrySummaryReturn {
  readonly summary: TelemetrySummary | null
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
}

export function useTelemetrySummary(sinceMs: number | null): UseTelemetrySummaryReturn {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchSummary = useCallback(async (): Promise<void> => {
    try {
      const result = await window.tokenless.telemetry.getSummary({ sinceMs })
      if (!mountedRef.current) return
      if (result.ok) {
        setSummary(result.data.summary)
        setError(null)
      } else {
        setError(result.error.message)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [sinceMs])

  useEffect(() => {
    mountedRef.current = true
    void fetchSummary()
    const unsub = window.tokenless.turns.onChanged(() => { void fetchSummary() })
    return () => { mountedRef.current = false; unsub() }
  }, [fetchSummary])

  return { summary, loading, error, refetch: fetchSummary }
}
