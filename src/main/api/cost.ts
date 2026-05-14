import { pricingFor } from './pricing'

// estimateCost: returns dollars given a model key and token counts.
// Returns 0 if the model is unknown (callers may render this as "—").
export function estimateCost(modelKey: string, inputTokens: number, outputTokens: number): number {
  const p = pricingFor(modelKey)
  if (!p) return 0
  return (inputTokens / 1_000_000) * p.inputPerMillion + (outputTokens / 1_000_000) * p.outputPerMillion
}

// Rough token estimator for pre-send previews — Anthropic's actual tokenization
// is a BPE variant. The "characters / 4" rule is a serviceable approximation
// for English prose. Round UP so we don't under-quote.
export function estimateInputTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}
