import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import { DraftsHandler } from '../../ipc/drafts-handler'
import { Logger } from '../../observability/logger'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/drafts-handler', () => {
  let db: Database
  let handler: DraftsHandler
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
    handler = new DraftsHandler(db, makeLogger())
  })

  it('save returns ok with the persisted draft', async () => {
    const result = await handler.save({ conversationId, body: 'hello' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.draft.body).toBe('hello')
      expect(result.data.draft.conversationId).toBe(conversationId)
    }
  })

  it('get returns the latest saved draft', async () => {
    await handler.save({ conversationId, body: 'one' })
    await handler.save({ conversationId, body: 'two' })
    const result = await handler.get({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.draft?.body).toBe('two')
  })

  it('get returns ok with draft=null when none exists', async () => {
    const result = await handler.get({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.draft).toBeNull()
  })

  it('clear returns ok with cleared=true when a draft existed', async () => {
    await handler.save({ conversationId, body: 'transient' })
    const result = await handler.clear({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.cleared).toBe(true)
    const after = await handler.get({ conversationId })
    if (after.ok) expect(after.data.draft).toBeNull()
  })

  it('clear returns ok with cleared=false when no draft existed (idempotent)', async () => {
    const result = await handler.clear({ conversationId })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.cleared).toBe(false)
  })
})
