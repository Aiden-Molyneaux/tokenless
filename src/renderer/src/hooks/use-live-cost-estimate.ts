import { useEffect, useState } from 'react'

import type { CostPreview } from '@shared/types/gearing'
import { usePricing } from './use-pricing'

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
  const pricing = usePricing()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({ prompt: input.prompt, model: input.model, breadth: input.breadth })
    }, input.debounceMs ?? 500)
    return () => clearTimeout(timer)
  }, [input.prompt, input.model, input.breadth, input.debounceMs])

  if (debounced.prompt.length === 0) return null
  const entry = pricing.find((p) => p.key === debounced.model)
  if (!entry) return null  // pricing not loaded yet OR unknown model
  const inputTokens = estimateInputTokens(debounced.prompt)
  const outputTokens = defaultOutputTokens(debounced.breadth)
  const dollars = (inputTokens / 1_000_000) * entry.inputPerMillion + (outputTokens / 1_000_000) * entry.outputPerMillion
  return {
    expectedDollars: dollars,
    expectedInputTokens: inputTokens,
    expectedOutputTokens: outputTokens,
    modelLabel: entry.displayName,
    haikuMetaDollars: 0
  }
}
