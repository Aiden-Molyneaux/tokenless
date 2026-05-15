import type { TokenSummary } from '../db/dao/turns'
import type { TelemetrySummary, PerModelSummary } from '@shared/types/telemetry-summary'

interface ModelPriceLite {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export type PricingFn = (modelKey: string) => ModelPriceLite | null

// Pure transformation: raw token sums + pricing => per-model cost + savings
// + aggregate net-savings figure. Caller supplies the pricing function so
// tests don't need to import the production pricing table.
export function computeTelemetrySummary(
  tokens: TokenSummary,
  sinceMs: number | null,
  pricing: PricingFn,
  haikuKey: string
): TelemetrySummary {
  const haikuPrice = pricing(haikuKey)
  const haikuCostDollars = haikuPrice
    ? (tokens.haikuMetaTokens / 1_000_000) * haikuPrice.inputPerMillion
    : 0

  const byModel: PerModelSummary[] = []
  let spendDollars = 0
  let grossSavingsDollars = 0
  for (const [model, breakdown] of Object.entries(tokens.byModel)) {
    if (model === haikuKey) continue
    const price = pricing(model)
    const inputCostDollars = price
      ? (breakdown.gearedInputTokens / 1_000_000) * price.inputPerMillion
      : 0
    const outputCostDollars = price
      ? (breakdown.responseOutputTokens / 1_000_000) * price.outputPerMillion
      : 0
    const savingsDollars = price
      ? ((breakdown.originalInputTokens - breakdown.gearedInputTokens) / 1_000_000) * price.inputPerMillion
      : 0
    byModel.push({
      model,
      haikuMetaTokens: breakdown.haikuMetaTokens,
      originalInputTokens: breakdown.originalInputTokens,
      gearedInputTokens: breakdown.gearedInputTokens,
      responseOutputTokens: breakdown.responseOutputTokens,
      inputCostDollars,
      outputCostDollars,
      savingsDollars
    })
    spendDollars += inputCostDollars + outputCostDollars
    grossSavingsDollars += savingsDollars
  }

  return {
    sinceMs,
    haikuMetaTokens: tokens.haikuMetaTokens,
    originalInputTokens: tokens.originalInputTokens,
    gearedInputTokens: tokens.gearedInputTokens,
    responseOutputTokens: tokens.responseOutputTokens,
    haikuCostDollars,
    spendDollars,
    grossSavingsDollars,
    netSavingsDollars: grossSavingsDollars - haikuCostDollars,
    byModel
  }
}
