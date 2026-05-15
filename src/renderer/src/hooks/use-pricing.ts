import { useEffect, useState } from 'react'

import type { PricingEntry } from '@shared/ipc/pricing'

// Fetches the pricing table from main on mount. Returns empty array until
// the IPC resolves (briefly). Consumers should gracefully handle the empty
// state (default to '—' or similar in the UI).
export function usePricing(): readonly PricingEntry[] {
  const [entries, setEntries] = useState<readonly PricingEntry[]>([])
  useEffect(() => {
    let cancelled = false
    void window.tokenless.pricing.list().then((r) => {
      if (!cancelled && r.ok) setEntries(r.data.entries)
    })
    return () => { cancelled = true }
  }, [])
  return entries
}
