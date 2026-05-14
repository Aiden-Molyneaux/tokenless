// Throwaway spike: confirms better-sqlite3 builds for Electron's ABI on Windows
// and that the basic open / migrate / insert / select cycle works.
// Run via: npm run dev (this file is imported from main/index.ts under a flag)
// or manually: npx tsx spikes/sqlite/index.ts (uses Node ABI — won't catch
// Electron ABI mismatch, but is fine for sanity).

import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'

const dbPath = join(tmpdir(), `tokenless-spike-${Date.now()}.db`)

try {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  const insert = db.prepare('INSERT INTO accounts (label, created_at) VALUES (?, ?)')
  const result = insert.run('Personal', Date.now())
  console.log('Inserted id:', result.lastInsertRowid)

  const rows = db.prepare('SELECT * FROM accounts').all()
  console.log('Rows:', rows)

  db.close()
  console.log('SQLite spike OK')
} finally {
  if (existsSync(dbPath)) unlinkSync(dbPath)
}
