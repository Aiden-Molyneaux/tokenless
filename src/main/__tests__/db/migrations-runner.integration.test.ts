import { describe, it, expect } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'

import { runMigrations, listAppliedVersions } from '../../db/migrations/runner'
import type { Migration } from '../../db/migrations/runner'

// Purpose: the runner applies pending migrations in version order, records them
// in _meta, is idempotent across runs, and atomically rolls back a batch on
// failure (so we never end up with a half-applied schema).

describe('db/migrations/runner', () => {
  const m1: Migration = {
    version: 1,
    name: 'create_users',
    sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)'
  }
  const m2: Migration = {
    version: 2,
    name: 'add_email',
    sql: 'ALTER TABLE users ADD COLUMN email TEXT'
  }
  const broken: Migration = {
    version: 3,
    name: 'broken',
    sql: 'CREATE TABLE BAD SYNTAX(((' // invalid SQL
  }

  it('applies migrations in order and records versions in _meta', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('is idempotent — running twice applies each migration once', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1, m2])
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('skips migrations whose version is already in _meta', () => {
    const db = new BetterSqlite3(':memory:')
    runMigrations(db, [m1])
    // Re-running with both should apply only m2
    runMigrations(db, [m1, m2])
    expect(listAppliedVersions(db)).toEqual([1, 2])
  })

  it('rolls back on failure so a half-applied batch is impossible', () => {
    const db = new BetterSqlite3(':memory:')
    expect(() => runMigrations(db, [m1, broken])).toThrow()
    // m1 should NOT have been applied because the transaction wrapping the
    // batch rolls back.
    expect(listAppliedVersions(db)).toEqual([])
  })
})
