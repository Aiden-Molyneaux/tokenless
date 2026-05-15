import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  createAccount,
  getAccountById,
  listAccounts,
  updateAccount,
  deleteAccount
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

  it('updateAccount patches only specified fields, preserves others', () => {
    const a = createAccount(db, { label: 'Personal', configDir: '/p', apiKey: 'k1' })
    const updated = updateAccount(db, { id: a.id, label: 'Renamed' })
    expect(updated?.label).toBe('Renamed')
    expect(updated?.configDir).toBe('/p')
    expect(updated?.apiKey).toBe('k1')
  })

  it('updateAccount can set apiKey to null', () => {
    const a = createAccount(db, { label: 'X', configDir: '/x', apiKey: 'k' })
    const updated = updateAccount(db, { id: a.id, apiKey: null })
    expect(updated?.apiKey).toBeNull()
  })

  it('updateAccount returns null for unknown id', () => {
    expect(updateAccount(db, { id: 99999, label: 'X' })).toBeNull()
  })

  it('deleteAccount removes the row', () => {
    const a = createAccount(db, { label: 'Doomed', configDir: '/d' })
    expect(deleteAccount(db, a.id)).toBe(true)
    expect(getAccountById(db, a.id)).toBeNull()
  })

  it('deleteAccount returns false for unknown id', () => {
    expect(deleteAccount(db, 99999)).toBe(false)
  })
})
