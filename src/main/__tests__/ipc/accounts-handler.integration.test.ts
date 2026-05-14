import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsHandler } from '../../ipc/accounts-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/accounts-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: AccountsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    handler = new AccountsHandler(db, makeLogger(), broadcast)
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
})
