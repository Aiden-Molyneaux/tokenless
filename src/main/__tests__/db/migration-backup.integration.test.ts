import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { backupDb, pruneOldBackups } from '../../db/migrations/backup'

describe('db/migrations/backup', () => {
  let tmpDir: string
  let dbPath: string
  let backupsDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tl-backup-test-'))
    dbPath = join(tmpDir, 'tokenless.db')
    backupsDir = join(tmpDir, 'backups')
    writeFileSync(dbPath, 'fake-db-content')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('backupDb copies the DB file with a versioned name', () => {
    backupDb(dbPath, backupsDir, 1, 2)
    const files = readdirSync(backupsDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^tokenless-pre-v1-to-v2-\d+\.db$/)
  })

  it('backupDb is a no-op when the source DB does not exist (first run)', () => {
    rmSync(dbPath)
    backupDb(dbPath, backupsDir, 1, 2)
    expect(existsSync(backupsDir)).toBe(false)
  })

  it('pruneOldBackups keeps the N most recent backups', async () => {
    for (let i = 1; i <= 7; i++) {
      backupDb(dbPath, backupsDir, i, i + 1)
      await new Promise((r) => setTimeout(r, 5))
    }
    pruneOldBackups(backupsDir, 5)
    const files = readdirSync(backupsDir)
    expect(files).toHaveLength(5)
  })

  it('pruneOldBackups is a no-op when there are fewer than the keep count', () => {
    backupDb(dbPath, backupsDir, 1, 2)
    backupDb(dbPath, backupsDir, 2, 3)
    pruneOldBackups(backupsDir, 5)
    expect(readdirSync(backupsDir)).toHaveLength(2)
  })
})
