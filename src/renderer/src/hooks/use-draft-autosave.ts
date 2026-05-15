// useDraftAutosave — implements ADR-013's per-conversation draft persistence.
// Loads existing draft on conversation switch (calls onLoad with the body so
// the composer can restore its prompt state). Debounces 750ms on prompt
// changes. Returns an imperative clear() to call on Send.

import { useCallback, useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 750

interface UseDraftAutosaveReturn {
  readonly clear: () => Promise<void>
  readonly lastSavedAt: number | null
}

export function useDraftAutosave(
  conversationId: number | null,
  prompt: string,
  onLoad: (body: string) => void
): UseDraftAutosaveReturn {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether the initial load for the current conversation has finished
  // — so we don't auto-save BEFORE we've loaded (which would race the load
  // and persist an empty string overtop of the user's draft).
  const initialLoadDone = useRef<Map<number, boolean>>(new Map())
  // Tracks whether a clear() has cancelled the pending save.
  const cancelled = useRef(false)

  // Load on conversation switch (and on initial mount).
  useEffect(() => {
    if (conversationId === null) return
    let active = true
    initialLoadDone.current.set(conversationId, false)
    void window.tokenless.drafts.get({ conversationId }).then((result) => {
      if (!active) return
      if (result.ok && result.data.draft) {
        onLoadRef.current(result.data.draft.body)
      }
      initialLoadDone.current.set(conversationId, true)
    })
    return () => {
      active = false
    }
  }, [conversationId])

  // Debounced save on prompt change.
  useEffect(() => {
    if (conversationId === null) return undefined
    if (!initialLoadDone.current.get(conversationId)) return undefined
    if (cancelled.current) {
      cancelled.current = false
      return undefined
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void window.tokenless.drafts.save({ conversationId, body: prompt }).then((result) => {
        if (result.ok) setLastSavedAt(result.data.draft.updatedAt)
      })
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
    }
  }, [conversationId, prompt])

  const clear = useCallback(async (): Promise<void> => {
    if (conversationId === null) return
    // Cancel any pending save first
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    cancelled.current = true
    await window.tokenless.drafts.clear({ conversationId })
    setLastSavedAt(null)
  }, [conversationId])

  return { clear, lastSavedAt }
}
