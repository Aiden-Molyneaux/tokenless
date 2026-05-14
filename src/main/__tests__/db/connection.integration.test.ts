import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { openDatabase, closeDatabase } from '../../db/connection'

// Purpose: openDatabase returns a working connection with WAL + FKs enabled,
// closeDatabase is idempotent, and the file is created at the requested path.

describe('db/connection', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tokenless-conn-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('opens a writable database at the given path with WAL + foreign keys', () => {
    const db = openDatabase(join(tmp, 'test.db'))
    expect(db.open).toBe(true)
    expect(existsSync(join(tmp, 'test.db'))).toBe(true)
    const journalMode = db.pragma('journal_mode', { simple: true })
    const fks = db.pragma('foreign_keys', { simple: true })
    expect(journalMode).toBe('wal')
    expect(fks).toBe(1)
    closeDatabase(db)
  })

  it('closeDatabase is idempotent — calling twice does not throw', () => {
    const db = openDatabase(join(tmp, 'test.db'))
    closeDatabase(db)
    expect(() => closeDatabase(db)).not.toThrow()
  })
})
