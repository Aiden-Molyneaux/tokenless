import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '@main/db/migrations/runner'
import { MIGRATIONS } from '@main/db/migrations'

describe('migration 004_remove_commit_push_prompts', () => {
  function buildV3Db(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const v3Only = MIGRATIONS.filter((m) => m.version <= 3)
    runMigrations(db, v3Only)
    return db
  }

  it('drops default_commit_prompt and default_push_prompt from projects', () => {
    const db = buildV3Db()
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('default_commit_prompt')
    expect(names).not.toContain('default_push_prompt')
  })

  it('preserves other project fields and existing rows', () => {
    const db = buildV3Db()
    db.exec(`
      INSERT INTO projects (id, name, root_path, default_commit_prompt, default_push_prompt, created_at, updated_at)
        VALUES (1, 'Test', '/p', 'My commit msg', 'My push msg', 0, 0);
    `)
    runMigrations(db, MIGRATIONS)
    const row = db.prepare('SELECT id, name, root_path FROM projects WHERE id = 1').get() as { id: number; name: string; root_path: string }
    expect(row).toEqual({ id: 1, name: 'Test', root_path: '/p' })
  })
})
