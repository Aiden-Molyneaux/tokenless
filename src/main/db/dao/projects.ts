// ProjectsDao — Project CRUD with snake_case <-> camelCase mapping and
// JSON serialization for array columns (always_include_files_json,
// relevant_skill_ids_json).

import type { Database } from 'better-sqlite3'

import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ModelHint,
  BreadthHint,
  FormatHint
} from '@shared/types/projects'

interface ProjectRow {
  id: number
  name: string
  root_path: string
  default_account_id: number | null
  default_model: string | null
  default_breadth: string | null
  default_format: string | null
  notes: string | null
  always_include_files_json: string | null
  relevant_skill_ids_json: string | null
  created_at: number
  updated_at: number
}

function parseJsonArray<T>(value: string | null): readonly T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    rootPath: r.root_path,
    defaultAccountId: r.default_account_id,
    defaultModel: r.default_model as ModelHint | null,
    defaultBreadth: r.default_breadth as BreadthHint | null,
    defaultFormat: r.default_format as FormatHint | null,
    notes: r.notes,
    alwaysIncludeFiles: parseJsonArray<string>(r.always_include_files_json),
    relevantSkillIds: parseJsonArray<number>(r.relevant_skill_ids_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function createProject(db: Database, input: CreateProjectInput): Project {
  const now = Date.now()
  const stmt = db.prepare(`
    INSERT INTO projects (
      name, root_path, default_account_id, default_model, default_breadth,
      default_format, notes, always_include_files_json, relevant_skill_ids_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    input.name,
    input.rootPath,
    input.defaultAccountId ?? null,
    input.defaultModel ?? null,
    input.defaultBreadth ?? null,
    input.defaultFormat ?? null,
    input.notes ?? null,
    JSON.stringify([]),
    JSON.stringify([]),
    now,
    now
  )
  return getProjectById(db, Number(result.lastInsertRowid)) as Project
}

export function getProjectById(db: Database, id: number): Project | null {
  const row = db.prepare<[number], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(id)
  return row ? rowToProject(row) : null
}

export function listProjects(db: Database): readonly Project[] {
  const rows = db
    .prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY name COLLATE NOCASE ASC')
    .all()
  return rows.map(rowToProject)
}

export function updateProject(db: Database, input: UpdateProjectInput): Project | null {
  const current = getProjectById(db, input.id)
  if (!current) return null

  const next: Project = {
    ...current,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.rootPath !== undefined && { rootPath: input.rootPath }),
    ...(input.defaultAccountId !== undefined && { defaultAccountId: input.defaultAccountId }),
    ...(input.defaultModel !== undefined && { defaultModel: input.defaultModel }),
    ...(input.defaultBreadth !== undefined && { defaultBreadth: input.defaultBreadth }),
    ...(input.defaultFormat !== undefined && { defaultFormat: input.defaultFormat }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.alwaysIncludeFiles !== undefined && { alwaysIncludeFiles: input.alwaysIncludeFiles }),
    ...(input.relevantSkillIds !== undefined && { relevantSkillIds: input.relevantSkillIds }),
    updatedAt: Date.now()
  }

  db.prepare(`
    UPDATE projects SET
      name = ?,
      root_path = ?,
      default_account_id = ?,
      default_model = ?,
      default_breadth = ?,
      default_format = ?,
      notes = ?,
      always_include_files_json = ?,
      relevant_skill_ids_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.rootPath,
    next.defaultAccountId,
    next.defaultModel,
    next.defaultBreadth,
    next.defaultFormat,
    next.notes,
    JSON.stringify(next.alwaysIncludeFiles),
    JSON.stringify(next.relevantSkillIds),
    next.updatedAt,
    next.id
  )
  return next
}

export function deleteProject(db: Database, id: number): boolean {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return result.changes > 0
}
