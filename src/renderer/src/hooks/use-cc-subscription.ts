// useCcSubscription — subscribe to cc:output-chunk + cc:exit IPC events for a
// specific conversationId. Caller passes onChunk(chunk) and optional onExit({
// exitCode, signal }) callbacks. Returns nothing — pure side-effect.

import { useEffect } from 'react'

interface UseCcSubscriptionCallbacks {
  onChunk(chunk: string): void
  onExit?(event: { exitCode: number; signal?: number }): void
}

export function useCcSubscription(
  conversationId: number | null,
  callbacks: UseCcSubscriptionCallbacks
): void {
  useEffect(() => {
    if (conversationId === null) return undefined
    const { onChunk, onExit } = callbacks
    const unsubChunk = window.tokenless.cc.onOutputChunk((payload) => {
      if (payload.conversationId === conversationId) {
        onChunk(payload.chunk)
      }
    })
    const unsubExit = window.tokenless.cc.onExit((payload) => {
      if (payload.conversationId === conversationId && onExit) {
        onExit({ exitCode: payload.exitCode, signal: payload.signal })
      }
    })
    return () => {
      unsubChunk()
      unsubExit()
    }
  }, [conversationId, callbacks])
}
