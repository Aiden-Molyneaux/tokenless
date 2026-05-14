import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { seedDefaultAccount } from '../../db/seed'
import { listAccounts } from '../../db/dao/accounts'

// Purpose: seedDefaultAccount creates a "Personal" account on first boot
// (empty DB) and is a no-op on subsequent boots.

describe('db/seed', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('creates a default account when the table is empty', () => {
    seedDefaultAccount(db)
    const accounts = listAccounts(db)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].label).toBe('Personal')
  })

  it('is a no-op when at least one account already exists', () => {
    seedDefaultAccount(db)
    seedDefaultAccount(db)
    seedDefaultAccount(db)
    expect(listAccounts(db)).toHaveLength(1)
  })
})
