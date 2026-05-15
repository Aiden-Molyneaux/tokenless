import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import { createConversation } from '../../db/dao/conversations'
import {
  createUserTurn,
  createAssistantTurn,
  updateFeedback,
  getLastByConversation,
  listByConversation,
  getFeedbackSummary
} from '../../db/dao/turns'

describe('db/dao/turns', () => {
  let db: Database
  let conversationId: number

  beforeEach(() => {
    db = createTestDb()
    const account = createAccount(db, { label: 'P', configDir: '/p' })
    const project = createProject(db, { name: 'X', rootPath: '/x', defaultAccountId: account.id })
    const conv = createConversation(db, { projectId: project.id, accountId: account.id })
    conversationId = conv.id
  })

  it('createUserTurn inserts a minimal user turn (no gear meta)', () => {
    const t = createUserTurn(db, {
      conversationId,
      originalPrompt: 'fix the bug',
      modelUsed: 'sonnet',
      gearMeta: null
    })
    expect(t.id).toBeGreaterThan(0)
    expect(t.role).toBe('user')
    expect(t.originalPrompt).toBe('fix the bug')
    expect(t.gearedPrompt).toBeNull()
    expect(t.originalTokens).toBeNull()
    expect(t.status).toBe('complete')
  })

  it('createUserTurn stores gearMeta when send is from GearReviewPane', () => {
    const t = createUserTurn(db, {
      conversationId,
      originalPrompt: 'fix the bug',
      modelUsed: 'sonnet',
      gearMeta: {
        originalPrompt: 'fix the bug',
        gearedPrompt: 'Refactor src/foo.ts — focus on null-safety. Output diff only.',
        originalTokens: 4,
        gearedTokens: 18,
        haikuMetaTokens: 320,
        critiqueFlags: ['ambiguous-target']
      }
    })
    expect(t.gearedPrompt).toContain('Refactor')
    expect(t.originalTokens).toBe(4)
    expect(t.gearedTokens).toBe(18)
    expect(t.haikuMetaTokens).toBe(320)
    expect(JSON.parse(t.critiqueFlagsJson ?? '[]')).toEqual(['ambiguous-target'])
  })

  it('createAssistantTurn inserts a response row', () => {
    const t = createAssistantTurn(db, {
      conversationId,
      responseText: 'Done. Patched foo.ts at line 42.',
      responseTokens: 12,
      modelUsed: 'sonnet'
    })
    expect(t.role).toBe('assistant')
    expect(t.responseText).toContain('Done')
    expect(t.responseTokens).toBe(12)
  })

  it('updateFeedback writes feedback on an assistant turn', () => {
    const t = createAssistantTurn(db, {
      conversationId, responseText: 'r', responseTokens: 1, modelUsed: null
    })
    expect(updateFeedback(db, t.id, 'up')).toBe(true)
    const fresh = listByConversation(db, conversationId).find((x) => x.id === t.id)
    expect(fresh?.feedback).toBe('up')
  })

  it('updateFeedback returns false for unknown id', () => {
    expect(updateFeedback(db, 99999, 'up')).toBe(false)
  })

  it('getLastByConversation returns the most recent turn (DESC by sent_at, tiebreak id DESC)', () => {
    createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    createAssistantTurn(db, { conversationId, responseText: 'r1', responseTokens: 1, modelUsed: null })
    const t = createUserTurn(db, { conversationId, originalPrompt: 'q2', modelUsed: null, gearMeta: null })
    expect(getLastByConversation(db, conversationId)?.id).toBe(t.id)
  })

  it('listByConversation returns rows in send order (ASC)', () => {
    const a = createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    const b = createAssistantTurn(db, { conversationId, responseText: 'r1', responseTokens: 1, modelUsed: null })
    expect(listByConversation(db, conversationId).map((t) => t.id)).toEqual([a.id, b.id])
  })

  it('getFeedbackSummary counts assistant turns by feedback bucket', () => {
    const t1 = createAssistantTurn(db, { conversationId, responseText: 'a', responseTokens: 1, modelUsed: null })
    const t2 = createAssistantTurn(db, { conversationId, responseText: 'b', responseTokens: 1, modelUsed: null })
    const t3 = createAssistantTurn(db, { conversationId, responseText: 'c', responseTokens: 1, modelUsed: null })
    createAssistantTurn(db, { conversationId, responseText: 'd', responseTokens: 1, modelUsed: null })
    updateFeedback(db, t1.id, 'up')
    updateFeedback(db, t2.id, 'up')
    updateFeedback(db, t3.id, 'down')
    const s = getFeedbackSummary(db)
    expect(s.up).toBe(2); expect(s.down).toBe(1); expect(s.shrug).toBe(0); expect(s.unrated).toBe(1)
  })
})
