import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { ConversationsHandler } from '../../ipc/conversations-handler'
import { Logger } from '../../observability/logger'
import { ProjectsDao, AccountsDao, TurnsDao } from '../../db'

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

  it('branch creates a new conversation pointing at the parent + latest turn', async () => {
    const acc = AccountsDao.createAccount(db, { label: 'A', configDir: '/a' })
    const pr = ProjectsDao.createProject(db, { name: 'P', rootPath: '/p', defaultAccountId: acc.id })
    const parentRes = await handler.create({ input: { projectId: pr.id, accountId: acc.id, title: 'Parent' } })
    expect(parentRes.ok).toBe(true)
    if (!parentRes.ok) return
    TurnsDao.createUserTurn(db, {
      conversationId: parentRes.data.conversation.id, originalPrompt: 'q', modelUsed: null, gearMeta: null
    })

    const r = await handler.branch({ parentConversationId: parentRes.data.conversation.id })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.conversation.parentConversationId).toBe(parentRes.data.conversation.id)
      expect(r.data.conversation.branchedAtTurnId).not.toBeNull()
      expect(r.data.conversation.title).toBe('↳ Parent')
    }
    expect(broadcast).toHaveBeenCalledWith('conversations:changed', undefined)
  })

  it('branch returns NOT_FOUND when parent does not exist', async () => {
    const r = await handler.branch({ parentConversationId: 99999 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('branch returns BRANCH_EMPTY_CONVERSATION when the parent has no turns', async () => {
    const acc = AccountsDao.createAccount(db, { label: 'A', configDir: '/a' })
    const pr = ProjectsDao.createProject(db, { name: 'P', rootPath: '/p', defaultAccountId: acc.id })
    const parentRes = await handler.create({ input: { projectId: pr.id, accountId: acc.id } })
    if (!parentRes.ok) return
    const r = await handler.branch({ parentConversationId: parentRes.data.conversation.id })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('BRANCH_EMPTY_CONVERSATION')
  })
})
