import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { getSetting, setSetting, deleteSetting } from '../../db/dao/settings'

describe('db/dao/settings', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('getSetting returns null for unknown key', () => {
    expect(getSetting(db, 'doesNotExist')).toBeNull()
  })

  it('setSetting persists a value; getSetting reads it back', () => {
    setSetting(db, 'lastActiveAccountId', '42')
    expect(getSetting(db, 'lastActiveAccountId')).toBe('42')
  })

  it('setSetting overwrites on conflict (UPSERT)', () => {
    setSetting(db, 'k', 'v1')
    setSetting(db, 'k', 'v2')
    expect(getSetting(db, 'k')).toBe('v2')
  })

  it('deleteSetting removes the key', () => {
    setSetting(db, 'k', 'v')
    expect(deleteSetting(db, 'k')).toBe(true)
    expect(getSetting(db, 'k')).toBeNull()
  })

  it('deleteSetting returns false for non-existent key', () => {
    expect(deleteSetting(db, 'missing')).toBe(false)
  })
})
