import { useEffect, useState } from 'react'

import type { CostPreview } from '@shared/types/gearing'

// Pricing duplicated from main/api/pricing.ts — the renderer needs these for
// pre-gear estimates. Keep in sync manually until Phase 6 introduces a pricing
// IPC query (or a shared module if it makes sense).
const PRICING: Record<string, { input: number; output: number; label: string }> = {
  haiku:  { input: 1.00,  output: 5.00,  label: 'Haiku 4.5'  },
  sonnet: { input: 3.00,  output: 15.00, label: 'Sonnet 4.6' },
  opus:   { input: 15.00, output: 75.00, label: 'Opus 4.7'   }
}

interface UseLiveCostEstimateInput {
  readonly prompt: string
  readonly model: string
  readonly breadth: string
  readonly debounceMs?: number
}

function estimateInputTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

function defaultOutputTokens(breadth: string): number {
  if (breadth === 'terse') return 400
  if (breadth === 'thorough') return 1600
  return 800
}

export function useLiveCostEstimate(input: UseLiveCostEstimateInput): CostPreview | null {
  // Initialize with empty prompt so the estimate starts null until the debounce
  // fires — this ensures debouncing applies from the very first render.
  const [debounced, setDebounced] = useState({ prompt: '', model: input.model, breadth: input.breadth })

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({ prompt: input.prompt, model: input.model, breadth: input.breadth })
    }, input.debounceMs ?? 500)
    return () => clearTimeout(timer)
  }, [input.prompt, input.model, input.breadth, input.debounceMs])

  if (debounced.prompt.length === 0) return null
  const p = PRICING[debounced.model]
  if (!p) return null
  const inputTokens = estimateInputTokens(debounced.prompt)
  const outputTokens = defaultOutputTokens(debounced.breadth)
  const dollars = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  return {
    expectedDollars: dollars,
    expectedInputTokens: inputTokens,
    expectedOutputTokens: outputTokens,
    modelLabel: p.label,
    haikuMetaDollars: 0
  }
}
