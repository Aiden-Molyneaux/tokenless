// DraftsDao — upsert / get / clear keyed by conversation_id (UNIQUE).
// 750ms debounced saves from the composer; load on conversation switch;
// clear on Send. Schema: drafts(id, conversation_id, body, updated_at).

import type { Database } from 'better-sqlite3'

import type { Draft } from '@shared/types/drafts'

interface DraftRow {
  id: number
  conversation_id: number
  body: string
  updated_at: number
}

function rowToDraft(r: DraftRow): Draft {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    body: r.body,
    updatedAt: r.updated_at
  }
}

export function upsertDraft(db: Database, conversationId: number, body: string): Draft {
  const now = Date.now()
  // SQLite: INSERT ... ON CONFLICT(conversation_id) DO UPDATE
  // The schema has UNIQUE(conversation_id) so the conflict target is well-defined.
  db.prepare(
    `INSERT INTO drafts (conversation_id, body, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       body = excluded.body,
       updated_at = excluded.updated_at`
  ).run(conversationId, body, now)
  return getDraft(db, conversationId) as Draft
}

export function getDraft(db: Database, conversationId: number): Draft | null {
  const row = db
    .prepare<[number], DraftRow>('SELECT * FROM drafts WHERE conversation_id = ?')
    .get(conversationId)
  return row ? rowToDraft(row) : null
}

export function clearDraft(db: Database, conversationId: number): boolean {
  const result = db.prepare('DELETE FROM drafts WHERE conversation_id = ?').run(conversationId)
  return result.changes > 0
}
