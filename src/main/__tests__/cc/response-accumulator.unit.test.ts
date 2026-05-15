import { describe, it, expect } from 'vitest'

import { ResponseAccumulator } from '../../cc/response-accumulator'

describe('cc/response-accumulator', () => {
  it('ignores events when not collecting', () => {
    const a = new ResponseAccumulator()
    expect(a.handle({ kind: 'response-chunk', text: 'lost' })).toBe(false)
    expect(a.handle({ kind: 'response-complete' })).toBe(false)
  })

  it('collects chunks between startCollecting and response-complete', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    expect(a.handle({ kind: 'response-chunk', text: 'line 1' })).toBe(false)
    expect(a.handle({ kind: 'response-chunk', text: 'line 2' })).toBe(false)
    expect(a.handle({ kind: 'response-complete' })).toBe(true)
    expect(a.drain().text).toBe('line 1\nline 2')
  })

  it('captures the last tokens-used count', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    a.handle({ kind: 'tokens-used', used: 100, total: 200000 })
    a.handle({ kind: 'response-chunk', text: 'ok' })
    a.handle({ kind: 'tokens-used', used: 250, total: 200000 })
    a.handle({ kind: 'response-complete' })
    const drained = a.drain()
    expect(drained.text).toBe('ok')
    expect(drained.responseTokens).toBe(250)
  })

  it('drain resets state — next startCollecting begins fresh', () => {
    const a = new ResponseAccumulator()
    a.startCollecting()
    a.handle({ kind: 'response-chunk', text: 'a' })
    a.handle({ kind: 'response-complete' })
    a.drain()
    a.startCollecting()
    a.handle({ kind: 'response-chunk', text: 'b' })
    a.handle({ kind: 'response-complete' })
    expect(a.drain().text).toBe('b')
  })
})
