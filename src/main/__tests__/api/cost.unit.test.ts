import { describe, it, expect } from 'vitest'
import { estimateCost, estimateInputTokens } from '../../api/cost'

describe('api/cost', () => {
  it('estimates dollar cost from token counts × pricing', () => {
    // Haiku: $1/M input, $5/M output. 1000 in + 500 out = 0.001 + 0.0025 = $0.0035
    const cost = estimateCost('haiku', 1000, 500)
    expect(cost).toBeCloseTo(0.0035, 6)
  })

  it('returns 0 for unknown model', () => {
    expect(estimateCost('moonshot', 1000, 1000)).toBe(0)
  })

  it('estimateInputTokens approximates chars/4', () => {
    expect(estimateInputTokens('a'.repeat(400))).toBe(100)
    expect(estimateInputTokens('')).toBe(0)
  })

  it('estimateInputTokens rounds up', () => {
    expect(estimateInputTokens('hello')).toBe(2) // 5/4 = 1.25 → 2
  })
})
