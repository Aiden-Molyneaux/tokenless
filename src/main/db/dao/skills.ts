import type { Database } from 'better-sqlite3'

import type { Skill, SkillSource } from '@shared/types/skills'

interface SkillRow {
  id: number
  source: string
  name: string
  description: string | null
  path: string
  favorited: number
  hidden: number
  last_seen_at: number
}

function rowToSkill(r: SkillRow): Skill {
  return {
    id: r.id,
    source: r.source as SkillSource,
    name: r.name,
    description: r.description,
    path: r.path,
    favorited: r.favorited === 1,
    hidden: r.hidden === 1,
    lastSeenAt: r.last_seen_at
  }
}

export interface UpsertSkillInput {
  readonly source: SkillSource
  readonly name: string
  readonly description: string | null
  readonly path: string
}

export function upsertSkill(db: Database, input: UpsertSkillInput, seenAt: number): Skill {
  db.prepare(`
    INSERT INTO skills (source, name, description, path, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      source = excluded.source,
      name = excluded.name,
      description = excluded.description,
      last_seen_at = excluded.last_seen_at
  `).run(input.source, input.name, input.description, input.path, seenAt)
  const row = db
    .prepare<[string], SkillRow>('SELECT * FROM skills WHERE path = ?')
    .get(input.path)
  if (!row) throw new Error(`upsertSkill returned no row for path ${input.path}`)
  return rowToSkill(row)
}

export function listSkills(db: Database): readonly Skill[] {
  const rows = db
    .prepare<[], SkillRow>(
      'SELECT * FROM skills ORDER BY favorited DESC, hidden ASC, name COLLATE NOCASE ASC'
    )
    .all()
  return rows.map(rowToSkill)
}

export function toggleFavorite(db: Database, id: number, favorited: boolean): boolean {
  const r = db.prepare('UPDATE skills SET favorited = ? WHERE id = ?').run(favorited ? 1 : 0, id)
  return r.changes > 0
}

export function toggleHidden(db: Database, id: number, hidden: boolean): boolean {
  const r = db.prepare('UPDATE skills SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id)
  return r.changes > 0
}

export function markStale(db: Database, id: number, lastSeenAt: number): boolean {
  const r = db.prepare('UPDATE skills SET last_seen_at = ? WHERE id = ?').run(lastSeenAt, id)
  return r.changes > 0
}
