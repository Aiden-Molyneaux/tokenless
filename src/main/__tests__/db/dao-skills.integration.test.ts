import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  upsertSkill,
  listSkills,
  toggleFavorite,
  toggleHidden,
  markStale
} from '../../db/dao/skills'

describe('db/dao/skills', () => {
  let db: Database
  beforeEach(() => { db = createTestDb() })

  it('upsertSkill INSERTs new row and returns the Skill', () => {
    const now = Date.now()
    const s = upsertSkill(db, {
      source: 'user', name: 'simplify',
      description: 'review code for reuse', path: '/u/.claude/skills/simplify'
    }, now)
    expect(s.id).toBeGreaterThan(0)
    expect(s.name).toBe('simplify')
    expect(s.favorited).toBe(false)
    expect(s.hidden).toBe(false)
    expect(s.lastSeenAt).toBe(now)
  })

  it('upsertSkill UPDATEs name/description on conflict but preserves favorited/hidden', () => {
    const t1 = Date.now()
    const s1 = upsertSkill(db, {
      source: 'user', name: 'old-name',
      description: 'old', path: '/u/.claude/skills/x'
    }, t1)
    toggleFavorite(db, s1.id, true)
    const t2 = t1 + 1000
    const s2 = upsertSkill(db, {
      source: 'user', name: 'new-name',
      description: 'new', path: '/u/.claude/skills/x'
    }, t2)
    expect(s2.id).toBe(s1.id)
    expect(s2.name).toBe('new-name')
    expect(s2.description).toBe('new')
    expect(s2.favorited).toBe(true)
    expect(s2.lastSeenAt).toBe(t2)
  })

  it('toggleFavorite flips the bit; toggleHidden flips independently', () => {
    const s = upsertSkill(db, {
      source: 'user', name: 'x', description: null, path: '/x'
    }, Date.now())
    toggleFavorite(db, s.id, true)
    toggleHidden(db, s.id, true)
    const all = listSkills(db)
    expect(all[0].favorited).toBe(true)
    expect(all[0].hidden).toBe(true)
  })

  it('listSkills returns rows sorted favorited DESC, hidden ASC, name COLLATE NOCASE ASC', () => {
    const t = Date.now()
    upsertSkill(db, { source: 'user', name: 'beta', description: null, path: '/b' }, t)
    const alpha = upsertSkill(db, { source: 'user', name: 'alpha', description: null, path: '/a' }, t)
    const charlie = upsertSkill(db, { source: 'user', name: 'charlie', description: null, path: '/c' }, t)
    toggleFavorite(db, charlie.id, true)
    toggleHidden(db, alpha.id, true)
    const sorted = listSkills(db).map((s) => s.name)
    expect(sorted).toEqual(['charlie', 'beta', 'alpha'])
  })

  it('markStale updates last_seen_at to before a cutoff', () => {
    const t1 = Date.now()
    const s = upsertSkill(db, { source: 'user', name: 'x', description: null, path: '/x' }, t1)
    const cutoff = t1 + 5000
    markStale(db, s.id, cutoff - 1)
    const rows = listSkills(db)
    expect(rows[0].lastSeenAt).toBe(cutoff - 1)
  })
})
