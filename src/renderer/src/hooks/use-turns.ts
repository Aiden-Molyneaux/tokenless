import { useCallback, useEffect, useRef, useState } from 'react'

import type { Turn, Feedback, FeedbackSummary } from '@shared/types/turns'

interface UseTurnsReturn {
  readonly turns: readonly Turn[]
  readonly loading: boolean
  readonly error: string | null
  readonly refetch: () => Promise<void>
  readonly updateFeedback: (id: number, feedback: Feedback) => Promise<boolean>
}

export function useTurns(conversationId: number | null): UseTurnsReturn {
  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchTurns = useCallback(async (): Promise<void> => {
    if (conversationId === null) {
      setTurns([])
      setLoading(false)
      return
    }
    try {
      const result = await window.tokenless.turns.listByConversation({ conversationId })
      if (!mountedRef.current) return
      if (result.ok) {
        setTurns(result.data.turns)
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
  }, [conversationId])

  useEffect(() => {
    mountedRef.current = true
    void fetchTurns()
    const unsubscribe = window.tokenless.turns.onChanged(() => { void fetchTurns() })
    return () => { mountedRef.current = false; unsubscribe() }
  }, [fetchTurns])

  const updateFeedback = useCallback(async (id: number, feedback: Feedback): Promise<boolean> => {
    const r = await window.tokenless.turns.updateFeedback({ id, feedback })
    return r.ok
  }, [])

  return { turns, loading, error, refetch: fetchTurns, updateFeedback }
}

export function useFeedbackSummary(): FeedbackSummary | null {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null)
  useEffect(() => {
    let cancelled = false
    const fetch = async (): Promise<void> => {
      const r = await window.tokenless.turns.getFeedbackSummary()
      if (!cancelled && r.ok) setSummary(r.data.summary)
    }
    void fetch()
    const unsub = window.tokenless.turns.onChanged(() => { void fetch() })
    return () => { cancelled = true; unsub() }
  }, [])
  return summary
}
