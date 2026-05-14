import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { ProjectsHandler } from '../../ipc/projects-handler'
import { Logger } from '../../observability/logger'

// Purpose: ProjectsHandler routes IPC requests through the DAO, returns
// IpcResult envelopes, and broadcasts a `projects:changed` event after writes.

function makeLogger(): Logger {
  // tiny fake — Phase 1B's Logger constructor takes (fileSink, ringSize, source)
  // here we pass a noop sink and small ring
  return new Logger(
    { append: vi.fn(), close: vi.fn(), flush: vi.fn(), write: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/projects-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: ProjectsHandler

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    handler = new ProjectsHandler(db, makeLogger(), broadcast)
  })

  it('list returns ok envelope with empty array initially', async () => {
    const result = await handler.list()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.projects).toEqual([])
  })

  it('create returns ok envelope and broadcasts projects:changed', async () => {
    const result = await handler.create({
      input: { name: 'Demo', rootPath: '/x' }
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.project.name).toBe('Demo')
    expect(broadcast).toHaveBeenCalledWith('projects:changed', undefined)
  })

  it('update returns error envelope when id does not exist', async () => {
    const result = await handler.update({
      input: { id: 99999, name: 'X' }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.logId).toMatch(/.+/)
    }
  })

  it('delete returns ok and broadcasts after removing', async () => {
    const created = await handler.create({ input: { name: 'P', rootPath: '/p' } })
    if (!created.ok) throw new Error('precondition')
    broadcast.mockClear()

    const result = await handler.delete({ id: created.data.project.id })
    expect(result.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('projects:changed', undefined)
  })
})
