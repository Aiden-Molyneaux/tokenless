import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { SkillsHandler } from '../../ipc/skills-handler'
import { SkillsDao } from '../../db'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/skills-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let rescan: ReturnType<typeof vi.fn>
  let handler: SkillsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    rescan = vi.fn().mockResolvedValue({ inserted: 0, updated: 0, markedStale: 0 })
    handler = new SkillsHandler(db, makeLogger(), broadcast, rescan)
    SkillsDao.upsertSkill(db, {
      source: 'user',
      name: 's1',
      description: null,
      path: '/s1'
    }, Date.now())
  })

  it('list returns ok with current skills', async () => {
    const r = await handler.list()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.skills).toHaveLength(1)
  })

  it('toggleFavorite flips the bit + broadcasts skills:changed', async () => {
    const s = SkillsDao.listSkills(db)[0]
    const r = await handler.toggleFavorite({ id: s.id, favorited: true })
    expect(r.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('skills:changed', undefined)
    expect(SkillsDao.listSkills(db)[0].favorited).toBe(true)
  })

  it('toggleFavorite returns NOT_FOUND for unknown id', async () => {
    const r = await handler.toggleFavorite({ id: 99999, favorited: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('toggleHidden works analogously', async () => {
    const s = SkillsDao.listSkills(db)[0]
    const r = await handler.toggleHidden({ id: s.id, hidden: true })
    expect(r.ok).toBe(true)
    expect(SkillsDao.listSkills(db)[0].hidden).toBe(true)
  })

  it('toggleHidden returns NOT_FOUND for unknown id', async () => {
    const r = await handler.toggleHidden({ id: 99999, hidden: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('rescan calls injected rescan fn, broadcasts, returns counts + total', async () => {
    rescan.mockResolvedValueOnce({ inserted: 2, updated: 1, markedStale: 0 })
    const r = await handler.rescan()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.inserted).toBe(2)
      expect(r.data.updated).toBe(1)
      expect(r.data.total).toBe(1)
    }
    expect(broadcast).toHaveBeenCalledWith('skills:changed', undefined)
  })
})
