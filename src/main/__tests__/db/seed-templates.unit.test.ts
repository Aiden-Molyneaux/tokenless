import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { seedBuiltinTemplates } from '../../db/seed-templates'
import { listTemplates, createTemplate } from '../../db/dao/templates'

// Purpose: seedBuiltinTemplates inserts 8 built-in templates, is idempotent
// (skip if already seeded), and does not affect user-created templates.

describe('db/seed-templates', () => {
  let db: Database
  beforeEach(() => {
    db = createTestDb()
  })

  it('inserts 8 built-in templates', () => {
    seedBuiltinTemplates(db)
    const templates = listTemplates(db)
    expect(templates).toHaveLength(8)
    expect(templates.every((t) => t.builtin)).toBe(true)
  })

  it('is idempotent: calling twice does not duplicate', () => {
    seedBuiltinTemplates(db)
    seedBuiltinTemplates(db)
    const templates = listTemplates(db)
    expect(templates).toHaveLength(8)
  })

  it('does not affect user-created templates', () => {
    const user = createTemplate(db, { name: 'UserTemp', body: 'user' })
    seedBuiltinTemplates(db)
    const templates = listTemplates(db)
    expect(templates).toHaveLength(9)
    expect(templates.some((t) => t.id === user.id && !t.builtin)).toBe(true)
  })
})
