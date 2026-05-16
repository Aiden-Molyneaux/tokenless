import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import { createConversation } from '../../db/dao/conversations'
import {
  createUserTurn,
  getLastByConversation,
  listByConversation,
  getTokenSummary
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

  it('getLastByConversation returns the most recent turn (DESC by sent_at, tiebreak id DESC)', () => {
    createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    const t = createUserTurn(db, { conversationId, originalPrompt: 'q2', modelUsed: null, gearMeta: null })
    expect(getLastByConversation(db, conversationId)?.id).toBe(t.id)
  })

  it('listByConversation returns rows in send order (ASC)', () => {
    const a = createUserTurn(db, { conversationId, originalPrompt: 'q1', modelUsed: null, gearMeta: null })
    const b = createUserTurn(db, { conversationId, originalPrompt: 'q2', modelUsed: null, gearMeta: null })
    expect(listByConversation(db, conversationId).map((t) => t.id)).toEqual([a.id, b.id])
  })

  it('getTokenSummary aggregates token columns across all rows when since is undefined', () => {
    createUserTurn(db, {
      conversationId, originalPrompt: 'q1', modelUsed: 'sonnet',
      gearMeta: {
        originalPrompt: 'q1', gearedPrompt: 'g1',
        originalTokens: 10, gearedTokens: 30, haikuMetaTokens: 200,
        critiqueFlags: []
      }
    })
    createUserTurn(db, {
      conversationId, originalPrompt: 'q2', modelUsed: 'opus',
      gearMeta: {
        originalPrompt: 'q2', gearedPrompt: 'g2',
        originalTokens: 5, gearedTokens: 20, haikuMetaTokens: 180,
        critiqueFlags: []
      }
    })

    const s = getTokenSummary(db)
    expect(s.haikuMetaTokens).toBe(380)
    expect(s.originalInputTokens).toBe(15)
    expect(s.gearedInputTokens).toBe(50)
    expect(s.responseOutputTokens).toBe(0)
    expect(s.byModel.sonnet.gearedInputTokens).toBe(30)
    expect(s.byModel.sonnet.responseOutputTokens).toBe(0)
    expect(s.byModel.opus.gearedInputTokens).toBe(20)
    expect(s.byModel.opus.responseOutputTokens).toBe(0)
  })

  it('getTokenSummary respects the sinceMs filter (sent_at >= since)', () => {
    const old = createUserTurn(db, {
      conversationId, originalPrompt: 'old', modelUsed: 'sonnet',
      gearMeta: { originalPrompt: 'o', gearedPrompt: 'g',
        originalTokens: 100, gearedTokens: 80, haikuMetaTokens: 500, critiqueFlags: [] }
    })
    db.prepare('UPDATE turns SET sent_at = ? WHERE id = ?').run(Date.now() - 3600_000, old.id)
    createUserTurn(db, {
      conversationId, originalPrompt: 'fresh', modelUsed: 'sonnet',
      gearMeta: { originalPrompt: 'o', gearedPrompt: 'g',
        originalTokens: 10, gearedTokens: 5, haikuMetaTokens: 100, critiqueFlags: [] }
    })

    const sinceTenMinutesAgo = Date.now() - 600_000
    const s = getTokenSummary(db, sinceTenMinutesAgo)
    expect(s.haikuMetaTokens).toBe(100)
    expect(s.originalInputTokens).toBe(10)
    expect(s.gearedInputTokens).toBe(5)
  })

  it('getTokenSummary returns zeros for an empty table', () => {
    const fresh = createTestDb()
    const acc = createAccount(fresh, { label: 'X', configDir: '/x' })
    const pr = createProject(fresh, { name: 'X', rootPath: '/x', defaultAccountId: acc.id })
    createConversation(fresh, { projectId: pr.id, accountId: acc.id })
    const s = getTokenSummary(fresh)
    expect(s.haikuMetaTokens).toBe(0)
    expect(s.responseOutputTokens).toBe(0)
    expect(Object.keys(s.byModel)).toEqual([])
  })
})
