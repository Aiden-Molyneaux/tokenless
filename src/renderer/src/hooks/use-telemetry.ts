import { useEffect, useState } from 'react'

import type { TelemetryTick } from '@shared/types/telemetry'

export function useTelemetry(conversationId: number | null): TelemetryTick | null {
  const [tick, setTick] = useState<TelemetryTick | null>(null)

  useEffect(() => {
    if (conversationId === null) {
      setTick(null)
      return undefined
    }
    // Reset on conversation switch
    setTick(null)
    const unsub = window.tokenless.telemetry.onTick((incoming) => {
      if (incoming.conversationId === conversationId) {
        setTick(incoming)
      }
    })
    return () => unsub()
  }, [conversationId])

  return tick
}
