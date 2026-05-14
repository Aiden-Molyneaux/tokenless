import { describe, expect, it } from 'vitest'

describe('Phase 0 smoke', () => {
  it('vitest is wired up and can run a test', () => {
    expect(1 + 1).toBe(2)
  })

  it('typescript strict mode allows typed arithmetic', () => {
    const a: number = 2
    const b: number = 3
    expect(a + b).toBe(5)
  })
})
