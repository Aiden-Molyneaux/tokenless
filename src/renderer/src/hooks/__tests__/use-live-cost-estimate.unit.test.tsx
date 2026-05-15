// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useLiveCostEstimate } from '../use-live-cost-estimate'

describe('hooks/use-live-cost-estimate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns null for empty prompt', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: '', model: 'opus', breadth: 'normal' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeNull()
  })

  it('debounces — returns null until 500ms passes', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hello world', model: 'haiku', breadth: 'normal' }))
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(499) })
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).not.toBeNull()
  })

  it('computes expected dollars from chars/4 token estimate', () => {
    // "a".repeat(400) → 100 input tokens. Default output 800. Haiku $1/M in, $5/M out.
    // dollars = (100/1M * 1) + (800/1M * 5) = 0.0001 + 0.004 = 0.0041
    const { result } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'haiku', breadth: 'normal' })
    )
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current?.expectedDollars).toBeCloseTo(0.0041, 5)
  })

  it('halves output for terse breadth, doubles for thorough', () => {
    const { result: terse } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'terse' })
    )
    const { result: thorough } = renderHook(() =>
      useLiveCostEstimate({ prompt: 'a'.repeat(400), model: 'opus', breadth: 'thorough' })
    )
    act(() => { vi.advanceTimersByTime(500) })
    expect(terse.current?.expectedOutputTokens).toBe(400)
    expect(thorough.current?.expectedOutputTokens).toBe(1600)
  })

  it('returns null for unknown model', () => {
    const { result } = renderHook(() => useLiveCostEstimate({ prompt: 'hi', model: 'fake', breadth: 'normal' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBeNull()
  })
})
