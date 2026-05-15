// TemplatesDao — Template CRUD. All functions take a Database connection as
// their first argument (no module-level state) so tests can use :memory: and
// production uses the singleton from connection.ts.

import type { Database } from 'better-sqlite3'

import type { Template, CreateTemplateInput, UpdateTemplateInput } from '@shared/types/templates'

interface TemplateRow {
  id: number
  name: string
  body: string
  description: string | null
  category: string | null
  builtin: number
  created_at: number
  updated_at: number
}

function rowToTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    name: r.name,
    body: r.body,
    description: r.description,
    category: r.category,
    builtin: r.builtin === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createTemplate(db: Database, input: CreateTemplateInput): Template {
  const now = Date.now()
  const stmt = db.prepare(
    'INSERT INTO templates (name, body, description, category, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const result = stmt.run(
    input.name,
    input.body,
    input.description ?? null,
    input.category ?? null,
    input.builtin ? 1 : 0,
    now,
    now
  )
  const id = Number(result.lastInsertRowid)
  return getTemplateById(db, id) as Template
}

export function getTemplateById(db: Database, id: number): Template | null {
  const row = db.prepare<[number], TemplateRow>('SELECT * FROM templates WHERE id = ?').get(id)
  return row ? rowToTemplate(row) : null
}

export function listTemplates(db: Database): readonly Template[] {
  const rows = db
    .prepare<[], TemplateRow>(
      'SELECT * FROM templates ORDER BY builtin DESC, category ASC, name COLLATE NOCASE ASC'
    )
    .all()
  return rows.map(rowToTemplate)
}

export function updateTemplate(db: Database, input: UpdateTemplateInput): Template | null {
  const current = getTemplateById(db, input.id)
  if (!current) return null
  const next = {
    name: input.name ?? current.name,
    body: input.body ?? current.body,
    description: input.description !== undefined ? input.description : current.description,
    category: input.category !== undefined ? input.category : current.category
  }
  const now = Date.now()
  db.prepare(
    'UPDATE templates SET name = ?, body = ?, description = ?, category = ?, updated_at = ? WHERE id = ?'
  ).run(next.name, next.body, next.description, next.category, now, input.id)
  return getTemplateById(db, input.id)
}

export function deleteTemplate(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  return result.changes > 0
}
