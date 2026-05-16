import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '@main/db/migrations/runner'
import { MIGRATIONS } from '@main/db/migrations'

describe('migration 003_v2_headless', () => {
  // Helper: build a v1-shaped DB (apply only migrations 1 + 2).
  function buildV1Db(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const v1Only = MIGRATIONS.filter((m) => m.version <= 2)
    runMigrations(db, v1Only)
    return db
  }

  it('drops PTY-shaped columns from conversations', () => {
    const db = buildV1Db()
    // Seed a project + conversation with PTY fields set
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (project_id, cc_session_id, summary, parent_conversation_id, branched_at_turn_id, created_at, updated_at)
        VALUES (1, 'old-session', 'old summary', NULL, NULL, 0, 0);
    `)
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('cc_session_id')
    expect(names).not.toContain('summary')
    expect(names).not.toContain('summary_updated_at')
    expect(names).not.toContain('parent_conversation_id')
    expect(names).not.toContain('branched_at_turn_id')
    // The conversation row survives (data preservation):
    expect(db.prepare('SELECT COUNT(*) AS n FROM conversations').get() as { n: number }).toEqual({ n: 1 })
  })

  it('drops assistant-side columns + deletes assistant turn rows', () => {
    const db = buildV1Db()
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (1, 1, 0, 0);
      INSERT INTO turns (conversation_id, role, original_prompt, sent_at) VALUES (1, 'user', 'hi', 0);
      INSERT INTO turns (conversation_id, role, response_text, sent_at) VALUES (1, 'assistant', 'hello', 0);
    `)
    expect((db.prepare('SELECT COUNT(*) AS n FROM turns').get() as { n: number }).n).toBe(2)
    runMigrations(db, MIGRATIONS)
    const cols = db.prepare("PRAGMA table_info(turns)").all() as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).not.toContain('role')
    expect(names).not.toContain('response_text')
    expect(names).not.toContain('response_tokens')
    expect(names).not.toContain('feedback')
    // The user-side turn row survives, assistant row gone:
    expect((db.prepare('SELECT COUNT(*) AS n FROM turns').get() as { n: number }).n).toBe(1)
  })

  it('drops idx_turns_feedback as a side effect of dropping the feedback column', () => {
    const db = buildV1Db()
    runMigrations(db, MIGRATIONS)
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>
    const names = indexes.map((i) => i.name)
    expect(names).not.toContain('idx_turns_feedback')
  })

  it('preserves drafts + projects + accounts unchanged', () => {
    const db = buildV1Db()
    db.exec(`
      INSERT INTO accounts (id, label, config_dir, created_at) VALUES (1, 'A', '/cfg', 0);
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (1, 'P', '/p', 0, 0);
      INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (1, 1, 0, 0);
      INSERT INTO drafts (conversation_id, body, updated_at) VALUES (1, 'unfinished prompt', 0);
    `)
    runMigrations(db, MIGRATIONS)
    expect((db.prepare('SELECT COUNT(*) AS n FROM drafts').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT body FROM drafts WHERE conversation_id = 1').get() as { body: string }).body).toBe('unfinished prompt')
    expect((db.prepare('SELECT COUNT(*) AS n FROM projects').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n).toBe(1)
  })
})
