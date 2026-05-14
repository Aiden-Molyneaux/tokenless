// useCcSubscription — subscribe to cc:output-chunk + cc:exit IPC events for a
// specific conversationId. Caller passes onChunk(chunk) and optional onExit({
// exitCode, signal }) callbacks. Returns nothing — pure side-effect.
//
// The callbacks live in a ref so the IPC subscription only re-attaches when
// conversationId changes — not every time the parent re-renders and produces
// a fresh callbacks object literal. Without this, every parent render would
// churn the cc:output-chunk listener, opening a brief window where chunks
// could arrive between unsubscribe and resubscribe.

import { useEffect, useRef } from 'react'

interface UseCcSubscriptionCallbacks {
  onChunk(chunk: string): void
  onExit?(event: { exitCode: number; signal?: number }): void
}

export function useCcSubscription(
  conversationId: number | null,
  callbacks: UseCcSubscriptionCallbacks
): void {
  const callbacksRef = useRef(callbacks)
  // Keep the ref in sync with the latest callbacks on every render.
  callbacksRef.current = callbacks

  useEffect(() => {
    if (conversationId === null) return undefined
    const unsubChunk = window.tokenless.cc.onOutputChunk((payload) => {
      if (payload.conversationId === conversationId) {
        callbacksRef.current.onChunk(payload.chunk)
      }
    })
    const unsubExit = window.tokenless.cc.onExit((payload) => {
      if (payload.conversationId === conversationId && callbacksRef.current.onExit) {
        callbacksRef.current.onExit({
          exitCode: payload.exitCode,
          signal: payload.signal
        })
      }
    })
    return () => {
      unsubChunk()
      unsubExit()
    }
  }, [conversationId])
}
