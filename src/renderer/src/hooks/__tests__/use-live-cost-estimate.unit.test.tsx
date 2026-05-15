// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useLiveCostEstimate } from '../use-live-cost-estimate'
import type { PricingEntry } from '@shared/ipc/pricing'

// Synthetic pricing entries injected via window.tokenless mock so the hook
// does not need a live Electron preload.
const MOCK_PRICING: readonly PricingEntry[] = [
  {
    key: 'haiku',
    apiModel: 'claude-haiku-4-5-20251001',
    displayName: 'Haiku 4.5',
    description: 'fastest · cheapest',
    inputPerMillion: 1.00,
    outputPerMillion: 5.00
  },
  {
    key: 'sonnet',
    apiModel: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4.6',
    description: 'balanced',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  {
    key: 'opus',
    apiModel: 'claude-opus-4-7',
    displayName: 'Opus 4.7',
    description: 'most capable · best for hard tasks',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  }
]

describe('hooks/use-live-cost-estimate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Mock window.tokenless.pricing.list so usePricing() resolves immediately
    Object.defineProperty(window, 'tokenless', {
      value: {
        pricing: {
          list: vi.fn().mockResolvedValue({ ok: true, data: { entries: MOCK_PRICING } })
        }
      },
      writable: true,
      configurable: true
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for empty prompt', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: '', model: 'opus', breadth: 'normal' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeNull()
  })

  it('debounces — returns null until 500ms passes', async () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hello world', model: 'haiku', breadth: 'normal' }))
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(499) })
    expect(result.current).toBeNull()
    // Let the pricing IPC promise resolve
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(result.current).not.toBeNull()
  })

  it('computes expected dollars from chars/4 token estimate', async () => {
    // "a".repeat(400) → 100 input tokens. Default output 800. Haiku $1/M in, $5/M out.
    // dollars = (100/1M * 1) + (800/1M * 5) = 0.0001 + 0.004 = 0.0041
    const { result } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'haiku', breadth: 'normal' })
    )
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(result.current?.expectedDollars).toBeCloseTo(0.0041, 5)
  })

  it('halves output for terse breadth, doubles for thorough', async () => {
    const { result: terse } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'terse' })
    )
    const { result: thorough } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'thorough' })
    )
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(terse.current?.expectedOutputTokens).toBe(400)
    expect(thorough.current?.expectedOutputTokens).toBe(1600)
  })

  it('returns null for unknown model', async () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hi', model: 'fake', breadth: 'normal' }))
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(result.current).toBeNull()
  })
})
