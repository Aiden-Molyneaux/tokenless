// useCcEvents — subscribe to parsed cc:event IPC for a conversationId.
// Callback held in a ref so the IPC listener only re-attaches when
// conversationId changes (same pattern as useCcSubscription).

import { useEffect, useRef } from 'react'

import type { CcEvent } from '@shared/types/cc-events'

export function useCcEvents(
  conversationId: number | null,
  onEvent: (event: CcEvent) => void
): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (conversationId === null) return undefined
    const unsub = window.tokenless.cc.onEvent((payload) => {
      if (payload.conversationId === conversationId) {
        onEventRef.current(payload.event)
      }
    })
    return () => unsub()
  }, [conversationId])
}
