import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  createAccount,
  getAccountById,
  listAccounts
} from '../../db/dao/accounts'

// Purpose: AccountsDao creates rows with createdAt set, retrieves by id, and
// lists in insertion order.

describe('db/dao/accounts', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('createAccount inserts a row and returns the new Account', () => {
    const a = createAccount(db, { label: 'Personal', configDir: 'C:/Users/me/.claude-personal' })
    expect(a.id).toBeGreaterThan(0)
    expect(a.label).toBe('Personal')
    expect(a.configDir).toBe('C:/Users/me/.claude-personal')
    expect(a.apiKey).toBeNull()
    expect(a.createdAt).toBeGreaterThan(0)
  })

  it('getAccountById returns the account or null', () => {
    const a = createAccount(db, { label: 'Work', configDir: 'C:/Users/me/.claude' })
    expect(getAccountById(db, a.id)).toEqual(a)
    expect(getAccountById(db, 99999)).toBeNull()
  })

  it('listAccounts returns rows in id order (insertion order)', () => {
    const a = createAccount(db, { label: 'Personal', configDir: '/p' })
    const b = createAccount(db, { label: 'Work', configDir: '/w' })
    expect(listAccounts(db)).toEqual([a, b])
  })

  it('createAccount stores apiKey when provided', () => {
    const a = createAccount(db, { label: 'Work', configDir: '/c', apiKey: 'sk-ant-test-123' })
    expect(a.apiKey).toBe('sk-ant-test-123')
  })

  it('createAccount stores null apiKey when omitted', () => {
    const a = createAccount(db, { label: 'Personal', configDir: '/p' })
    expect(a.apiKey).toBeNull()
  })
})
