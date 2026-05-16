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
  let handler: TurnsHandler
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    handler = new TurnsHandler(db, makeLogger())

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

    // Create a couple of user turns to query
    TurnsDao.createUserTurn(db, {
      conversationId,
      originalPrompt: 'Prompt 1',
      modelUsed: null,
      gearMeta: null
    })
    TurnsDao.createUserTurn(db, {
      conversationId,
      originalPrompt: 'Prompt 2',
      modelUsed: null,
      gearMeta: null
    })
  })

  it('listByConversation returns ok with the turns for a conversation', async () => {
    const r = await handler.listByConversation({ conversationId })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.turns).toHaveLength(2)
      expect(r.data.turns[0].originalPrompt).toBe('Prompt 1')
      expect(r.data.turns[1].originalPrompt).toBe('Prompt 2')
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
})
