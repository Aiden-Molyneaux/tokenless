import type { Database } from 'better-sqlite3'

interface SettingRow {
  key: string
  value: string | null
}

export function getSetting(db: Database, key: string): string | null {
  const row = db
    .prepare<[string], SettingRow>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  return row?.value ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function deleteSetting(db: Database, key: string): boolean {
  const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  return result.changes > 0
}
