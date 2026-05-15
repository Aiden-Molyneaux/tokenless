import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsHandler } from '../../ipc/accounts-handler'
import { Logger } from '../../observability/logger'
import { AnthropicClientRegistry } from '../../api/client-registry'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn(), write: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/accounts-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: AccountsHandler
  let registry: AnthropicClientRegistry

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    registry = new AnthropicClientRegistry(makeLogger(), () => new MockAnthropicClient({}))
    handler = new AccountsHandler(db, makeLogger(), broadcast, registry)
  })

  it('list returns ok envelope (seed default Personal is empty until seedDefaultAccount runs)', async () => {
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.accounts).toEqual([])
  })

  it('create returns the new account + broadcasts accounts:changed', async () => {
    const result = await handler.create({
      input: { label: 'Work', configDir: 'C:/Users/me/.claude' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.account.label).toBe('Work')
    expect(broadcast).toHaveBeenCalledWith('accounts:changed', undefined)
  })

  it('update returns ok + broadcasts + invalidates registry', async () => {
    const created = await handler.create({ input: { label: 'A', configDir: '/a', apiKey: 'k1' } })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const invalidateSpy = vi.spyOn(registry, 'invalidate')

    const result = await handler.update({
      input: { id: created.data.account.id, label: 'Renamed', apiKey: 'k2' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.account.label).toBe('Renamed')
      expect(result.data.account.apiKey).toBe('k2')
    }
    expect(invalidateSpy).toHaveBeenCalledWith(created.data.account.id)
    expect(broadcast).toHaveBeenCalledWith('accounts:changed', undefined)
  })

  it('update returns NOT_FOUND for unknown id', async () => {
    const result = await handler.update({ input: { id: 99999, label: 'X' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('delete returns ok + broadcasts + invalidates registry', async () => {
    const created = await handler.create({ input: { label: 'Doomed', configDir: '/d' } })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const invalidateSpy = vi.spyOn(registry, 'invalidate')

    const result = await handler.delete({ id: created.data.account.id })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.id).toBe(created.data.account.id)
    expect(invalidateSpy).toHaveBeenCalledWith(created.data.account.id)
    expect(broadcast).toHaveBeenCalledWith('accounts:changed', undefined)
  })

  it('delete returns NOT_FOUND for unknown id', async () => {
    const result = await handler.delete({ id: 99999 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })
})
