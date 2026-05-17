import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import { createProject } from '../../db/dao/projects'
import {
  createConversation,
  getConversationById,
  listConversationsByProject,
  updateConversation,
  deleteConversation
} from '../../db/dao/conversations'

// Purpose: ConversationsDao supports create/read/list-by-project/update/delete
// with the project-scoped index used by the sidebar and correct default status.

describe('db/dao/conversations', () => {
  let db: Database
  let projectId: number
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = createAccount(db, { label: 'P', configDir: '/p' }).id
    projectId = createProject(db, {
      name: 'TokenLess',
      rootPath: '/x',
      defaultAccountId: accountId
    }).id
  })

  it('createConversation inserts with status=active and timestamps', () => {
    const c = createConversation(db, { projectId, accountId, title: 'Hello' })
    expect(c.id).toBeGreaterThan(0)
    expect(c.projectId).toBe(projectId)
    expect(c.status).toBe('active')
    expect(c.createdAt).toBeGreaterThan(0)
    expect(c.updatedAt).toBe(c.createdAt)
  })

  it('listConversationsByProject returns project-scoped rows in updated_at DESC order', async () => {
    const c1 = createConversation(db, { projectId, title: 'first' })
    // Force distinct timestamps
    await new Promise((r) => setTimeout(r, 5))
    const c2 = createConversation(db, { projectId, title: 'second' })
    // A conversation in a different project should not show up
    const otherProject = createProject(db, { name: 'Other', rootPath: '/o' }).id
    createConversation(db, { projectId: otherProject, title: 'elsewhere' })

    const list = listConversationsByProject(db, projectId)
    expect(list.map((c) => c.id)).toEqual([c2.id, c1.id])
  })

  it('updateConversation patches title and bumps updatedAt', async () => {
    const c = createConversation(db, { projectId, title: 'before' })
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateConversation(db, {
      id: c.id,
      title: 'after'
    })
    expect(updated?.title).toBe('after')
    expect(updated?.updatedAt).toBeGreaterThan(c.updatedAt)
  })

  it('updateConversation status="ended" sets endedAt', () => {
    const c = createConversation(db, { projectId, title: 'live' })
    const updated = updateConversation(db, { id: c.id, status: 'ended' })
    expect(updated?.status).toBe('ended')
    expect(updated?.endedAt).not.toBeNull()
    expect(updated?.endedAt).toBeGreaterThan(0)
  })

  it('deleteConversation removes the row', () => {
    const c = createConversation(db, { projectId, title: 'doomed' })
    expect(deleteConversation(db, c.id)).toBe(true)
    expect(getConversationById(db, c.id)).toBeNull()
  })
})
