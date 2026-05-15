import { describe, it, expect, vi } from 'vitest'

import { AnthropicClientRegistry } from '../../api/client-registry'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('api/client-registry', () => {
  it('returns null when account has no apiKey', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const client = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: null, createdAt: 0 })
    expect(client).toBeNull()
  })

  it('returns null when account has empty-string apiKey', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const client = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: '', createdAt: 0 })
    expect(client).toBeNull()
  })

  it('constructs and caches an AnthropicClient when apiKey is present', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const account = { id: 1, label: 'X', configDir: '/x', apiKey: 'sk-test', createdAt: 0 }
    const c1 = registry.getClient(account)
    const c2 = registry.getClient(account)
    expect(c1).not.toBeNull()
    expect(c1).toBe(c2) // cache hit
  })

  it('cache key includes apiKey — different keys for same accountId get fresh clients', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const c1 = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: 'sk-a', createdAt: 0 })
    const c2 = registry.getClient({ id: 1, label: 'X', configDir: '/x', apiKey: 'sk-b', createdAt: 0 })
    expect(c1).not.toBeNull()
    expect(c2).not.toBeNull()
    expect(c1).not.toBe(c2)
  })

  it('different accountIds get separate clients', () => {
    const registry = new AnthropicClientRegistry(makeLogger())
    const c1 = registry.getClient({ id: 1, label: 'A', configDir: '/a', apiKey: 'sk-1', createdAt: 0 })
    const c2 = registry.getClient({ id: 2, label: 'B', configDir: '/b', apiKey: 'sk-2', createdAt: 0 })
    expect(c1).not.toBe(c2)
  })
})
