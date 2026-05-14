import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { createAccount } from '../../db/dao/accounts'
import {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject
} from '../../db/dao/projects'

// Purpose: ProjectsDao supports full CRUD, serializes the json array columns
// correctly, and survives "no default account" (null FK).

describe('db/dao/projects', () => {
  let db: Database
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = createAccount(db, { label: 'Personal', configDir: '/p' }).id
  })

  it('createProject inserts and returns with defaults populated', () => {
    const p = createProject(db, {
      name: 'TokenLess',
      rootPath: 'C:/personal/tokenless',
      defaultAccountId: accountId
    })
    expect(p.id).toBeGreaterThan(0)
    expect(p.name).toBe('TokenLess')
    expect(p.alwaysIncludeFiles).toEqual([])
    expect(p.relevantSkillIds).toEqual([])
    expect(p.createdAt).toBeGreaterThan(0)
    expect(p.updatedAt).toBe(p.createdAt)
  })

  it('createProject works with no defaultAccountId', () => {
    const p = createProject(db, { name: 'Anon', rootPath: '/x' })
    expect(p.defaultAccountId).toBeNull()
  })

  it('listProjects returns rows ordered by name asc', () => {
    const a = createProject(db, { name: 'Zebra', rootPath: '/z' })
    const b = createProject(db, { name: 'Apple', rootPath: '/a' })
    expect(listProjects(db).map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('updateProject sets fields, bumps updatedAt, and persists json columns', () => {
    const p = createProject(db, { name: 'Initial', rootPath: '/init' })
    const updated = updateProject(db, {
      id: p.id,
      name: 'Renamed',
      alwaysIncludeFiles: ['README.md', 'package.json']
    })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.alwaysIncludeFiles).toEqual(['README.md', 'package.json'])
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(p.updatedAt)
  })

  it('updateProject returns null when id does not exist', () => {
    expect(updateProject(db, { id: 99999, name: 'X' })).toBeNull()
  })

  it('deleteProject removes the row and returns true', () => {
    const p = createProject(db, { name: 'Doomed', rootPath: '/x' })
    expect(deleteProject(db, p.id)).toBe(true)
    expect(getProjectById(db, p.id)).toBeNull()
  })

  it('deleteProject returns false when id does not exist', () => {
    expect(deleteProject(db, 99999)).toBe(false)
  })
})
