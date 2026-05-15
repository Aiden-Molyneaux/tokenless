import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { TemplatesHandler } from '../../ipc/templates-handler'
import { TemplatesDao } from '../../db'
import { seedBuiltinTemplates } from '../../db/seed-templates'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/templates-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: TemplatesHandler

  beforeEach(() => {
    db = createTestDb()
    seedBuiltinTemplates(db)
    broadcast = vi.fn()
    handler = new TemplatesHandler(db, makeLogger(), broadcast)
  })

  it('list returns ok with 8 builtin templates', async () => {
    const r = await handler.list()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.templates).toHaveLength(8)
      expect(r.data.templates.every((t) => t.builtin)).toBe(true)
    }
  })

  it('create inserts a user template + broadcasts templates:changed', async () => {
    const r = await handler.create({ input: { name: 'My', body: 'b', category: 'custom' } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.template.name).toBe('My')
      expect(r.data.template.builtin).toBe(false)
    }
    expect(broadcast).toHaveBeenCalledWith('templates:changed', undefined)
  })

  it('update patches a non-builtin + broadcasts', async () => {
    const create = await handler.create({ input: { name: 'Old', body: 'o' } })
    expect(create.ok).toBe(true)
    if (!create.ok) return
    broadcast.mockClear()
    const r = await handler.update({ input: { id: create.data.template.id, name: 'New' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.template.name).toBe('New')
    expect(broadcast).toHaveBeenCalledWith('templates:changed', undefined)
  })

  it('update returns NOT_FOUND for unknown id', async () => {
    const r = await handler.update({ input: { id: 99999, name: 'X' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('update returns BUILTIN_PROTECTED when targeting a builtin row', async () => {
    const builtin = TemplatesDao.listTemplates(db).find((t) => t.builtin)!
    const r = await handler.update({ input: { id: builtin.id, name: 'tampered' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('BUILTIN_PROTECTED')
  })

  it('delete removes a non-builtin + broadcasts', async () => {
    const create = await handler.create({ input: { name: 'X', body: 'x' } })
    expect(create.ok).toBe(true)
    if (!create.ok) return
    broadcast.mockClear()
    const r = await handler.delete({ id: create.data.template.id })
    expect(r.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('templates:changed', undefined)
  })

  it('delete returns BUILTIN_PROTECTED when targeting a builtin row', async () => {
    const builtin = TemplatesDao.listTemplates(db).find((t) => t.builtin)!
    const r = await handler.delete({ id: builtin.id })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('BUILTIN_PROTECTED')
  })

  it('delete returns NOT_FOUND for unknown id', async () => {
    const r = await handler.delete({ id: 99999 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })
})
