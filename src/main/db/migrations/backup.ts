import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// Copy the DB file to a versioned backup path before applying migrations.
// No-op if the DB doesn't exist yet (first run — there's nothing to back up).
export function backupDb(dbPath: string, backupsDir: string, fromVersion: number, toVersion: number): void {
  if (!existsSync(dbPath)) return
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true })
  const filename = `tokenless-pre-v${fromVersion}-to-v${toVersion}-${Date.now()}.db`
  copyFileSync(dbPath, join(backupsDir, filename))
}

// Keep the N most recent backups; delete older ones. Sorted by mtime DESC.
export function pruneOldBackups(backupsDir: string, keepCount: number): void {
  if (!existsSync(backupsDir)) return
  const entries = readdirSync(backupsDir)
    .filter((f) => f.startsWith('tokenless-pre-') && f.endsWith('.db'))
    .map((f) => ({ name: f, mtime: statSync(join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const entry of entries.slice(keepCount)) {
    unlinkSync(join(backupsDir, entry.name))
  }
}
