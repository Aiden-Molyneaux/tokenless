import type { Database } from 'better-sqlite3'

import type { Turn, TurnRole, TurnStatus, Feedback, GearMeta } from '@shared/types/turns'

interface TurnRow {
  id: number
  conversation_id: number
  role: string
  original_prompt: string | null
  geared_prompt: string | null
  response_text: string | null
  original_tokens: number | null
  geared_tokens: number | null
  response_tokens: number | null
  haiku_meta_tokens: number | null
  model_used: string | null
  feedback: string | null
  critique_flags_json: string | null
  status: string
  sent_at: number
}

function rowToTurn(r: TurnRow): Turn {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as TurnRole,
    originalPrompt: r.original_prompt,
    gearedPrompt: r.geared_prompt,
    responseText: r.response_text,
    originalTokens: r.original_tokens,
    gearedTokens: r.geared_tokens,
    responseTokens: r.response_tokens,
    haikuMetaTokens: r.haiku_meta_tokens,
    modelUsed: r.model_used,
    feedback: r.feedback === null ? null : (r.feedback as Feedback),
    critiqueFlagsJson: r.critique_flags_json,
    status: r.status as TurnStatus,
    sentAt: r.sent_at
  }
}

export interface CreateUserTurnInput {
  readonly conversationId: number
  readonly originalPrompt: string
  readonly modelUsed: string | null
  readonly gearMeta: GearMeta | null
}

export function createUserTurn(db: Database, input: CreateUserTurnInput): Turn {
  const now = Date.now()
  // Store null instead of "[]" for empty critiqueFlags — keeps telemetry readable.
  const critiqueFlagsJson = input.gearMeta && input.gearMeta.critiqueFlags.length > 0
    ? JSON.stringify(input.gearMeta.critiqueFlags)
    : null
  const result = db.prepare(`
    INSERT INTO turns (
      conversation_id, role, original_prompt, geared_prompt,
      original_tokens, geared_tokens, haiku_meta_tokens,
      model_used, critique_flags_json, status, sent_at
    ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, 'complete', ?)
  `).run(
    input.conversationId,
    input.gearMeta?.originalPrompt ?? input.originalPrompt,
    input.gearMeta?.gearedPrompt ?? null,
    input.gearMeta?.originalTokens ?? null,
    input.gearMeta?.gearedTokens ?? null,
    input.gearMeta?.haikuMetaTokens ?? null,
    input.modelUsed,
    critiqueFlagsJson,
    now
  )
  const created = getById(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('createUserTurn: SELECT after INSERT returned no row')
  return created
}

export function getById(db: Database, id: number): Turn | null {
  const row = db.prepare<[number], TurnRow>('SELECT * FROM turns WHERE id = ?').get(id)
  return row ? rowToTurn(row) : null
}

export function getLastByConversation(db: Database, conversationId: number): Turn | null {
  const row = db
    .prepare<[number], TurnRow>(
      'SELECT * FROM turns WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1'
    )
    .get(conversationId)
  return row ? rowToTurn(row) : null
}

export function listByConversation(db: Database, conversationId: number): readonly Turn[] {
  const rows = db
    .prepare<[number], TurnRow>(
      'SELECT * FROM turns WHERE conversation_id = ? ORDER BY sent_at ASC, id ASC'
    )
    .all(conversationId)
  return rows.map(rowToTurn)
}

export interface ModelTokenBreakdown {
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
}

export interface TokenSummary {
  readonly haikuMetaTokens: number
  readonly originalInputTokens: number
  readonly gearedInputTokens: number
  readonly responseOutputTokens: number
  readonly byModel: Readonly<Record<string, ModelTokenBreakdown>>
}

interface AggregateRow {
  model_used: string | null
  haiku_total: number | null
  original_total: number | null
  geared_total: number | null
  response_total: number | null
}

export function getTokenSummary(db: Database, sinceMs?: number): TokenSummary {
  const where = sinceMs !== undefined ? 'WHERE sent_at >= ?' : ''
  const params: unknown[] = sinceMs !== undefined ? [sinceMs] : []
  const rows = db
    .prepare<unknown[], AggregateRow>(`
      SELECT
        model_used,
        COALESCE(SUM(haiku_meta_tokens), 0) AS haiku_total,
        COALESCE(SUM(original_tokens), 0) AS original_total,
        COALESCE(SUM(geared_tokens), 0) AS geared_total,
        COALESCE(SUM(response_tokens), 0) AS response_total
      FROM turns
      ${where}
      GROUP BY model_used
    `)
    .all(...params)

  const byModel: Record<string, ModelTokenBreakdown> = {}
  let haikuMetaTokens = 0
  let originalInputTokens = 0
  let gearedInputTokens = 0
  let responseOutputTokens = 0
  for (const r of rows) {
    const haiku = r.haiku_total ?? 0
    const original = r.original_total ?? 0
    const geared = r.geared_total ?? 0
    const response = r.response_total ?? 0
    haikuMetaTokens += haiku
    originalInputTokens += original
    gearedInputTokens += geared
    responseOutputTokens += response
    if (r.model_used !== null) {
      byModel[r.model_used] = {
        haikuMetaTokens: haiku,
        originalInputTokens: original,
        gearedInputTokens: geared,
        responseOutputTokens: response
      }
    }
  }
  return { haikuMetaTokens, originalInputTokens, gearedInputTokens, responseOutputTokens, byModel }
}
