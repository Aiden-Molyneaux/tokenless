// Opens, configures, and closes the SQLite connection for the main process.
// Single-purpose: pragmas + close idempotency. Migration application is the
// runner's job (db/migrations/runner.ts). Tests use :memory: paths.

import BetterSqlite3, { type Database } from 'better-sqlite3'

export function openDatabase(filePath: string): Database {
  const db = new BetterSqlite3(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function closeDatabase(db: Database): void {
  if (db.open) {
    db.close()
  }
}

export type { Database }
