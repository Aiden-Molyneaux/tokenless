import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { ConversationsHandler } from '../../ipc/conversations-handler'
import { Logger } from '../../observability/logger'
import { ProjectsDao } from '../../db'

function makeLogger(): Logger {
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn(), write: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/conversations-handler', () => {
  let db: Database
  let projectId: number
  let broadcast: ReturnType<typeof vi.fn>
  let handler: ConversationsHandler

  beforeEach(() => {
    db = createTestDb()
    projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x' }).id
    broadcast = vi.fn()
    handler = new ConversationsHandler(db, makeLogger(), broadcast)
  })

  it('listByProject returns empty initially', async () => {
    const result = await handler.listByProject({ projectId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.conversations).toEqual([])
  })

  it('create + broadcasts conversations:changed', async () => {
    const result = await handler.create({ input: { projectId, title: 'Demo' } })
    expect(result.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('conversations:changed', undefined)
  })

  it('update returns NOT_FOUND for unknown id', async () => {
    const r = await handler.update({ input: { id: 999, title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })
})
