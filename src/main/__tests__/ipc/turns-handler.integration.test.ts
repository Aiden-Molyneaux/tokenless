import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { TurnsHandler } from '../../ipc/turns-handler'
import { TurnsDao } from '../../db'
import { Logger } from '../../observability/logger'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/turns-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let handler: TurnsHandler
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    broadcast = vi.fn()
    handler = new TurnsHandler(db, makeLogger(), broadcast)

    // Seed: create account -> project -> conversation
    const acct = AccountsDao.createAccount(db, {
      label: 'test-account',
      configDir: '/test',
      apiKey: 'sk-test'
    })
    const proj = ProjectsDao.createProject(db, {
      name: 'test-project',
      rootPath: '/test-root',
      defaultAccountId: acct.id
    })
    const conv = ConversationsDao.createConversation(db, {
      projectId: proj.id,
      title: 'test-conversation'
    })
    conversationId = conv.id

    // Create a couple of assistant turns to query
    TurnsDao.createAssistantTurn(db, {
      conversationId,
      responseText: 'Response 1',
      responseTokens: 100,
      modelUsed: null
    })
    TurnsDao.createAssistantTurn(db, {
      conversationId,
      responseText: 'Response 2',
      responseTokens: 150,
      modelUsed: null
    })
  })

  it('listByConversation returns ok with the turns for a conversation', async () => {
    const r = await handler.listByConversation({ conversationId })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.turns).toHaveLength(2)
      expect(r.data.turns[0].role).toBe('assistant')
      expect(r.data.turns[0].responseText).toBe('Response 1')
      expect(r.data.turns[1].responseText).toBe('Response 2')
    }
  })

  it('listByConversation returns empty list for conversation with no turns', async () => {
    const acct = AccountsDao.createAccount(db, {
      label: 'test-account-2',
      configDir: '/test2',
      apiKey: 'sk-test-2'
    })
    const proj = ProjectsDao.createProject(db, {
      name: 'test-project-2',
      rootPath: '/test-root-2',
      defaultAccountId: acct.id
    })
    const conv = ConversationsDao.createConversation(db, {
      projectId: proj.id,
      title: 'empty-conversation'
    })
    const r = await handler.listByConversation({ conversationId: conv.id })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.turns).toHaveLength(0)
  })

  it('updateFeedback flips the feedback bit + broadcasts turns:changed', async () => {
    const turns = TurnsDao.listByConversation(db, conversationId)
    const t = turns[0]
    const r = await handler.updateFeedback({ id: t.id, feedback: 'up' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.id).toBe(t.id)
      expect(r.data.feedback).toBe('up')
    }
    expect(broadcast).toHaveBeenCalledWith('turns:changed', undefined)
    // Verify the DB was updated
    const updated = TurnsDao.getById(db, t.id)
    expect(updated?.feedback).toBe('up')
  })

  it('updateFeedback returns NOT_FOUND for unknown turn id', async () => {
    const r = await handler.updateFeedback({ id: 99999, feedback: 'down' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('getFeedbackSummary returns aggregate feedback counts', async () => {
    // Update some feedback
    const turns = TurnsDao.listByConversation(db, conversationId)
    TurnsDao.updateFeedback(db, turns[0].id, 'up')
    TurnsDao.updateFeedback(db, turns[1].id, 'down')

    const r = await handler.getFeedbackSummary()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.summary.up).toBe(1)
      expect(r.data.summary.down).toBe(1)
      expect(r.data.summary.shrug).toBe(0)
      expect(r.data.summary.unrated).toBe(0)
    }
  })
})
