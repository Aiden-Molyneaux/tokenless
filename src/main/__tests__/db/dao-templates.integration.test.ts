import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import {
  createTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate
} from '../../db/dao/templates'

// Purpose: TemplatesDao creates rows with createdAt/updatedAt set, retrieves by id,
// lists in builtin DESC, category ASC, name ASC order, and patches on update.

describe('db/dao/templates', () => {
  let db: Database
  beforeEach(() => {
    db = createTestDb()
  })

  it('createTemplate inserts a row and returns the Template', () => {
    const t = createTemplate(db, {
      name: 'Foo',
      body: 'do foo',
      description: 'desc',
      category: 'refactor'
    })
    expect(t.id).toBeGreaterThan(0)
    expect(t.name).toBe('Foo')
    expect(t.body).toBe('do foo')
    expect(t.description).toBe('desc')
    expect(t.category).toBe('refactor')
    expect(t.builtin).toBe(false)
    expect(t.createdAt).toBeGreaterThan(0)
  })

  it('createTemplate flags builtin=true when requested', () => {
    const t = createTemplate(db, { name: 'B', body: 'x', builtin: true })
    expect(t.builtin).toBe(true)
  })

  it('listTemplates returns rows sorted builtin DESC, category ASC, name ASC', () => {
    createTemplate(db, { name: 'Zeta', body: 'z', category: 'refactor', builtin: true })
    createTemplate(db, { name: 'Alpha', body: 'a', category: 'docs', builtin: false })
    createTemplate(db, { name: 'Beta', body: 'b', category: 'refactor', builtin: true })
    const list = listTemplates(db)
    expect(list.map((t) => t.name)).toEqual(['Beta', 'Zeta', 'Alpha'])
  })

  it('getTemplateById returns null for unknown id', () => {
    expect(getTemplateById(db, 99999)).toBeNull()
  })

  it('updateTemplate patches fields and bumps updated_at', async () => {
    const t = createTemplate(db, { name: 'Old', body: 'o' })
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateTemplate(db, { id: t.id, name: 'New' })
    expect(updated?.name).toBe('New')
    expect(updated?.body).toBe('o')
    expect(updated?.updatedAt).toBeGreaterThan(t.updatedAt)
  })

  it('updateTemplate returns null for unknown id', () => {
    expect(updateTemplate(db, { id: 99999, name: 'X' })).toBeNull()
  })

  it('deleteTemplate removes the row', () => {
    const t = createTemplate(db, { name: 'X', body: 'x' })
    expect(deleteTemplate(db, t.id)).toBe(true)
    expect(getTemplateById(db, t.id)).toBeNull()
  })

  it('deleteTemplate returns false for unknown id', () => {
    expect(deleteTemplate(db, 99999)).toBe(false)
  })
})
