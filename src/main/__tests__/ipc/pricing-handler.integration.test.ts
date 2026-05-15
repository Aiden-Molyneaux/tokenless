import { describe, it, expect, vi } from 'vitest'

import { PricingHandler } from '../../ipc/pricing-handler'
import { Logger } from '../../observability/logger'
import type { PricingEntry } from '@shared/ipc/pricing'

// Purpose: verify PricingHandler.list() returns all pricing entries with the
// documented fields populated, and that the provider is injectable for tests.

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

const TEST_ENTRIES: readonly PricingEntry[] = [
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

describe('ipc/pricing-handler', () => {
  it('list returns ok with 3 entries (haiku, sonnet, opus)', async () => {
    const handler = new PricingHandler(makeLogger(), () => TEST_ENTRIES)
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.entries).toHaveLength(3)
      const keys = result.data.entries.map((e) => e.key)
      expect(keys).toContain('haiku')
      expect(keys).toContain('sonnet')
      expect(keys).toContain('opus')
    }
  })

  it('each entry has all documented fields populated', async () => {
    const handler = new PricingHandler(makeLogger(), () => TEST_ENTRIES)
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) {
      for (const entry of result.data.entries) {
        expect(typeof entry.key).toBe('string')
        expect(entry.key.length).toBeGreaterThan(0)
        expect(typeof entry.apiModel).toBe('string')
        expect(entry.apiModel.length).toBeGreaterThan(0)
        expect(typeof entry.displayName).toBe('string')
        expect(entry.displayName.length).toBeGreaterThan(0)
        expect(typeof entry.description).toBe('string')
        expect(entry.description.length).toBeGreaterThan(0)
        expect(typeof entry.inputPerMillion).toBe('number')
        expect(entry.inputPerMillion).toBeGreaterThan(0)
        expect(typeof entry.outputPerMillion).toBe('number')
        expect(entry.outputPerMillion).toBeGreaterThan(0)
      }
    }
  })

  it('list returns error envelope when provider throws', async () => {
    const handler = new PricingHandler(makeLogger(), () => {
      throw new Error('provider error')
    })
    const result = await handler.list()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR')
    }
  })
})
