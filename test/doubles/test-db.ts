// In-memory SQLite for unit/integration tests. Returns a fresh, fully migrated
// DB on each call. Tests do not share state. Used by DAO + IPC-handler tests.

import Database, { type Database as DB } from 'better-sqlite3'

import { runMigrations } from '../../src/main/db/migrations/runner'
import { MIGRATIONS } from '../../src/main/db/migrations/index'

export function createTestDb(): DB {
  const db = new Database(':memory:')
  db.pragma('journal_mode = MEMORY')
  db.pragma('foreign_keys = ON')
  runMigrations(db, MIGRATIONS)
  return db
}
