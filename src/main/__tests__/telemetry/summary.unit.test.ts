import { describe, it, expect } from 'vitest'

import { computeTelemetrySummary, type PricingFn } from '../../telemetry/summary'
import type { TokenSummary } from '../../db/dao/turns'

describe('telemetry/summary.computeTelemetrySummary', () => {
  const pricing: PricingFn = (model) => {
    if (model === 'sonnet') return { inputPerMillion: 1, outputPerMillion: 5 }
    if (model === 'haiku') return { inputPerMillion: 0.5, outputPerMillion: 2.5 }
    return null
  }
  const haikuKey = 'haiku'

  const tokens: TokenSummary = {
    haikuMetaTokens: 1_000_000,
    originalInputTokens: 200_000,
    gearedInputTokens: 100_000,
    responseOutputTokens: 50_000,
    byModel: {
      sonnet: {
        haikuMetaTokens: 1_000_000,
        originalInputTokens: 200_000,
        gearedInputTokens: 100_000,
        responseOutputTokens: 50_000
      }
    }
  }

  it('computes haiku cost from haikuMetaTokens × haiku input price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    expect(s.haikuCostDollars).toBeCloseTo(0.5, 5)
  })

  it('computes per-model spend = geared-input × input-price + response × output-price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    const sonnet = s.byModel.find((m) => m.model === 'sonnet')
    expect(sonnet?.inputCostDollars).toBeCloseTo(0.1, 5)
    expect(sonnet?.outputCostDollars).toBeCloseTo(0.25, 5)
    expect(s.spendDollars).toBeCloseTo(0.35, 5)
  })

  it('computes per-model savings = (original − geared) × input-price', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    const sonnet = s.byModel.find((m) => m.model === 'sonnet')
    expect(sonnet?.savingsDollars).toBeCloseTo(0.1, 5)
    expect(s.grossSavingsDollars).toBeCloseTo(0.1, 5)
  })

  it('computes netSavings = grossSavings − haikuCost (can be negative)', () => {
    const s = computeTelemetrySummary(tokens, null, pricing, haikuKey)
    expect(s.netSavingsDollars).toBeCloseTo(-0.4, 5)
  })

  it('passes sinceMs through unchanged', () => {
    const s = computeTelemetrySummary(tokens, 1234567890, pricing, haikuKey)
    expect(s.sinceMs).toBe(1234567890)
  })

  it('skips models with no pricing entry without throwing', () => {
    const withUnknown: TokenSummary = {
      ...tokens,
      byModel: {
        ...tokens.byModel,
        mystery: {
          haikuMetaTokens: 0,
          originalInputTokens: 0,
          gearedInputTokens: 10000,
          responseOutputTokens: 5000
        }
      }
    }
    const s = computeTelemetrySummary(withUnknown, null, pricing, haikuKey)
    const mystery = s.byModel.find((m) => m.model === 'mystery')
    expect(mystery?.inputCostDollars).toBe(0)
    expect(mystery?.outputCostDollars).toBe(0)
    expect(mystery?.savingsDollars).toBe(0)
  })

  it('excludes the haiku model from byModel breakdown (its tokens are counted under haikuCost)', () => {
    const withHaiku: TokenSummary = {
      ...tokens,
      byModel: {
        ...tokens.byModel,
        haiku: {
          haikuMetaTokens: 500_000,
          originalInputTokens: 0,
          gearedInputTokens: 0,
          responseOutputTokens: 0
        }
      }
    }
    const s = computeTelemetrySummary(withHaiku, null, pricing, haikuKey)
    expect(s.byModel.some((m) => m.model === 'haiku')).toBe(false)
  })
})
