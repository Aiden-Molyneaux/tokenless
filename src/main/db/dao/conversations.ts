// ConversationsDao — Conversation CRUD scoped to projects.
// listByProject uses the (project_id, updated_at DESC) index.

import type { Database } from 'better-sqlite3'

import type {
  Conversation,
  CreateConversationInput,
  UpdateConversationInput,
  ConversationStatus
} from '@shared/types/conversations'
import type { ModelHint, BreadthHint, FormatHint } from '@shared/types/projects'

interface ConversationRow {
  id: number
  project_id: number
  account_id: number | null
  cc_session_id: string | null
  title: string | null
  model: string | null
  breadth: string | null
  format: string | null
  status: string
  summary: string | null
  summary_updated_at: number | null
  parent_conversation_id: number | null
  branched_at_turn_id: number | null
  created_at: number
  updated_at: number
  ended_at: number | null
  archived_at: number | null
}

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    projectId: r.project_id,
    accountId: r.account_id,
    ccSessionId: r.cc_session_id,
    title: r.title,
    model: r.model as ModelHint | null,
    breadth: r.breadth as BreadthHint | null,
    format: r.format as FormatHint | null,
    status: r.status as ConversationStatus,
    summary: r.summary,
    summaryUpdatedAt: r.summary_updated_at,
    parentConversationId: r.parent_conversation_id,
    branchedAtTurnId: r.branched_at_turn_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    endedAt: r.ended_at,
    archivedAt: r.archived_at
  }
}

export function createConversation(
  db: Database,
  input: CreateConversationInput
): Conversation {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO conversations (
      project_id, account_id, title, model, breadth, format, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `)
  const result = stmt.run(
    input.projectId,
    input.accountId ?? null,
    input.title ?? null,
    input.model ?? null,
    input.breadth ?? null,
    input.format ?? null,
    now,
    now
  )
  return getConversationById(db, Number(result.lastInsertRowid)) as Conversation
}

export function getConversationById(db: Database, id: number): Conversation | null {
  const row = db
    .prepare<[number], ConversationRow>('SELECT * FROM conversations WHERE id = ?')
    .get(id)
  return row ? rowToConversation(row) : null
}

export function listConversationsByProject(
  db: Database,
  projectId: number
): readonly Conversation[] {
  const rows = db
    .prepare<[number], ConversationRow>(
      'SELECT * FROM conversations WHERE project_id = ? AND archived_at IS NULL ORDER BY updated_at DESC, id DESC'
    )
    .all(projectId)
  return rows.map(rowToConversation)
}

export function updateConversation(
  db: Database,
  input: UpdateConversationInput
): Conversation | null {
  const current = getConversationById(db, input.id)
  if (!current) return null

  const now = Date.now()
  const status = input.status ?? current.status
  const endedAt =
    status === 'ended' && current.endedAt === null
      ? now
      : status === 'active' && current.endedAt !== null
        ? null
        : current.endedAt

  db.prepare(`
    UPDATE conversations SET
      title = ?,
      cc_session_id = ?,
      status = ?,
      summary = ?,
      updated_at = ?,
      ended_at = ?
    WHERE id = ?
  `).run(
    input.title !== undefined ? input.title : current.title,
    input.ccSessionId !== undefined ? input.ccSessionId : current.ccSessionId,
    status,
    input.summary !== undefined ? input.summary : current.summary,
    now,
    endedAt,
    input.id
  )
  return getConversationById(db, input.id)
}

export function deleteConversation(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return result.changes > 0
}
