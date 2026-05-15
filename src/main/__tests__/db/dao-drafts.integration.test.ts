import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import {
  upsertDraft,
  getDraft,
  clearDraft
} from '../../db/dao/drafts'

// Purpose: DraftsDao upserts on conversation_id (UNIQUE), reads back the
// latest body, and clears cleanly. Multiple saves to the same conversation
// REPLACE the row; only one draft per conversation can exist.

describe('db/dao/drafts', () => {
  let db: Database
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
  })

  it('upsertDraft inserts a new row when none exists', () => {
    const d = upsertDraft(db, conversationId, 'hello world')
    expect(d.id).toBeGreaterThan(0)
    expect(d.conversationId).toBe(conversationId)
    expect(d.body).toBe('hello world')
    expect(d.updatedAt).toBeGreaterThan(0)
  })

  it('upsertDraft REPLACES the row on subsequent saves (UNIQUE conversation_id)', () => {
    const a = upsertDraft(db, conversationId, 'first')
    const b = upsertDraft(db, conversationId, 'second')
    // Same id — it's an upsert, not an insert
    expect(b.id).toBe(a.id)
    expect(b.body).toBe('second')
    expect(b.updatedAt).toBeGreaterThanOrEqual(a.updatedAt)
  })

  it('getDraft returns the current draft for a conversation', () => {
    upsertDraft(db, conversationId, 'persisted')
    const d = getDraft(db, conversationId)
    expect(d?.body).toBe('persisted')
  })

  it('getDraft returns null when no draft exists', () => {
    expect(getDraft(db, conversationId)).toBeNull()
  })

  it('clearDraft removes the row and returns true', () => {
    upsertDraft(db, conversationId, 'doomed')
    expect(clearDraft(db, conversationId)).toBe(true)
    expect(getDraft(db, conversationId)).toBeNull()
  })

  it('clearDraft returns false when no draft existed', () => {
    expect(clearDraft(db, conversationId)).toBe(false)
  })

  it('drafts are scoped per conversation', () => {
    const accountId = AccountsDao.createAccount(db, { label: 'Q', configDir: '/q' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P2', rootPath: '/y', defaultAccountId: accountId }).id
    const otherConv = ConversationsDao.createConversation(db, { projectId, accountId }).id

    upsertDraft(db, conversationId, 'first')
    upsertDraft(db, otherConv, 'second')

    expect(getDraft(db, conversationId)?.body).toBe('first')
    expect(getDraft(db, otherConv)?.body).toBe('second')
  })

  it('ON DELETE CASCADE removes the draft when its conversation is deleted', () => {
    upsertDraft(db, conversationId, 'will-disappear')
    ConversationsDao.deleteConversation(db, conversationId)
    expect(getDraft(db, conversationId)).toBeNull()
  })
})
