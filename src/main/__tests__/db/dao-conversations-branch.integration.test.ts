import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import {
  createConversation,
  createBranchConversation,
  getConversationById,
  updateConversation
} from '../../db/dao/conversations'
import { createUserTurn } from '../../db/dao/turns'

describe('db/dao/conversations.createBranchConversation', () => {
  let db: Database
  let projectId: number
  let accountId: number
  let parentId: number
  let parentTurnId: number

  beforeEach(() => {
    db = createTestDb()
    const a = createAccount(db, { label: 'P', configDir: '/p' })
    accountId = a.id
    const p = createProject(db, { name: 'X', rootPath: '/x', defaultAccountId: accountId })
    projectId = p.id
    const parent = createConversation(db, {
      projectId, accountId, title: 'Parent topic', model: 'sonnet', breadth: 'normal', format: 'prose'
    })
    parentId = parent.id
    updateConversation(db, { id: parentId, summary: 'Parent rolling summary text.' })
    const turn = createUserTurn(db, {
      conversationId: parentId, originalPrompt: 'q', modelUsed: 'sonnet', gearMeta: null
    })
    parentTurnId = turn.id
  })

  it('inserts a new conversation with parent + branched-at fields set', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.id).not.toBe(parentId)
    expect(branch.parentConversationId).toBe(parentId)
    expect(branch.branchedAtTurnId).toBe(parentTurnId)
    expect(branch.status).toBe('active')
    expect(branch.ccSessionId).toBeNull()
  })

  it('inherits projectId + accountId + model/breadth/format from the parent', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.projectId).toBe(projectId)
    expect(branch.accountId).toBe(accountId)
    expect(branch.model).toBe('sonnet')
    expect(branch.breadth).toBe('normal')
    expect(branch.format).toBe('prose')
  })

  it('inherits the parent summary so gearing has context on the first send', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.summary).toBe('Parent rolling summary text.')
  })

  it('prefixes the title with ↳', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    expect(branch.title).toBe('↳ Parent topic')
  })

  it('handles parent with null title', () => {
    const parentless = createConversation(db, { projectId, accountId })
    const branch = createBranchConversation(db, {
      parentConversationId: parentless.id, branchedAtTurnId: parentTurnId
    })
    expect(branch.title).toBe('↳ Untitled')
  })

  it('throws PARENT_NOT_FOUND when parent does not exist', () => {
    expect(() => createBranchConversation(db, {
      parentConversationId: 99999, branchedAtTurnId: parentTurnId
    })).toThrow(/PARENT_NOT_FOUND|not found/i)
  })

  it('the branch row is independently retrievable via getConversationById', () => {
    const branch = createBranchConversation(db, {
      parentConversationId: parentId, branchedAtTurnId: parentTurnId
    })
    const fresh = getConversationById(db, branch.id)
    expect(fresh?.parentConversationId).toBe(parentId)
    expect(fresh?.branchedAtTurnId).toBe(parentTurnId)
  })
})
