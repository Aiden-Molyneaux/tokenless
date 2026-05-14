// Migration runner. Applies version-numbered SQL chunks in order, recording
// applied versions in a `_meta` table. The batch is wrapped in a transaction
// — any failure rolls the whole batch back so we never have a partial schema.

import type { Database } from 'better-sqlite3'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

function ensureMetaTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)
}

export function listAppliedVersions(db: Database): readonly number[] {
  ensureMetaTable(db)
  const rows = db
    .prepare<[], { version: number }>('SELECT version FROM _meta ORDER BY version ASC')
    .all()
  return rows.map((r) => r.version)
}

export function runMigrations(db: Database, migrations: readonly Migration[]): void {
  ensureMetaTable(db)
  const applied = new Set(listAppliedVersions(db))
  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .slice()
    .sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  const apply = db.transaction((batch: readonly Migration[]) => {
    const record = db.prepare(
      'INSERT INTO _meta (version, name, applied_at) VALUES (?, ?, ?)'
    )
    for (const m of batch) {
      db.exec(m.sql)
      record.run(m.version, m.name, Date.now())
    }
  })

  apply(pending)
}
