import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { reconcile } from '../../skills/reconciler'
import { listSkills, upsertSkill, toggleFavorite } from '../../db/dao/skills'

describe('skills/reconciler', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('inserts new skills', () => {
    const r = reconcile(db, [
      { source: 'user', name: 'simplify', description: 'd', path: '/u/.claude/skills/simplify' }
    ], Date.now())
    expect(r.inserted).toBe(1)
    expect(r.updated).toBe(0)
    expect(r.markedStale).toBe(0)
    expect(listSkills(db)).toHaveLength(1)
  })

  it('updates description on subsequent scan, preserves favorited', () => {
    const t1 = Date.now()
    upsertSkill(db, { source: 'user', name: 'x', description: 'old', path: '/x' }, t1)
    const created = listSkills(db)[0]
    toggleFavorite(db, created.id, true)
    const t2 = t1 + 1000
    const r = reconcile(db, [
      { source: 'user', name: 'x', description: 'new', path: '/x' }
    ], t2)
    expect(r.inserted).toBe(0)
    expect(r.updated).toBe(1)
    const rows = listSkills(db)
    expect(rows[0].description).toBe('new')
    expect(rows[0].favorited).toBe(true)
  })

  it('marks rows stale when path is not in the latest scan; preserves the row', () => {
    const t1 = Date.now()
    upsertSkill(db, { source: 'user', name: 'gone', description: null, path: '/gone' }, t1)
    upsertSkill(db, { source: 'user', name: 'stays', description: null, path: '/stays' }, t1)
    toggleFavorite(db, listSkills(db).find((s) => s.name === 'gone')!.id, true)
    const t2 = t1 + 1000
    const r = reconcile(db, [
      { source: 'user', name: 'stays', description: null, path: '/stays' }
    ], t2)
    expect(r.updated).toBe(1)
    expect(r.markedStale).toBe(1)
    const rows = listSkills(db)
    expect(rows).toHaveLength(2)
    const gone = rows.find((s) => s.name === 'gone')!
    expect(gone.favorited).toBe(true)
    expect(gone.lastSeenAt).toBeLessThan(t2)
  })
})
