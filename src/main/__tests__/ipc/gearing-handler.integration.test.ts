import { describe, it, expect, beforeEach, vi } from 'vitest'

import { GearingHandler } from '../../ipc/gearing-handler'
import { AnthropicClientRegistry } from '../../api'
import { MockAnthropicClient, type MockFixture } from '../../../../test/doubles/mock-anthropic-client'
import { createTestDb } from '../../../../test/doubles/test-db'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'
import { Logger } from '../../observability/logger'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'

function loadFixture(name: string): { response: { text: string; inputTokens: number; outputTokens: number; stopReason: string; model: string } } {
  return JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/api', name), 'utf8'))
}

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/gearing-handler', () => {
  // Purpose: verify GearingHandler resolves the account from the conversation,
  // constructs a per-account client via the registry, and propagates errors correctly.
  let db: Database
  let handler: GearingHandler
  let conversationId: number
  let registry: AnthropicClientRegistry

  beforeEach(() => {
    db = createTestDb()
    const fx = loadFixture('gear-simple.json')
    const mockFixtures: Record<string, MockFixture> = {
      '*': { response: fx.response }
    }
    registry = new AnthropicClientRegistry(makeLogger(), () => new MockAnthropicClient(mockFixtures))
    handler = new GearingHandler(db, makeLogger(), registry)

    const accountId = AccountsDao.createAccount(db, { label: 'P', configDir: '/p', apiKey: 'sk-test' }).id
    const projectId = ProjectsDao.createProject(db, { name: 'P', rootPath: '/x', defaultAccountId: accountId }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id
  })

  it('gear returns the GearResult envelope', async () => {
    const result = await handler.gear({
      conversationId,
      accountId: null,
      originalPrompt: 'Refactor the auth middleware',
      configs: { model: 'sonnet', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.result.gearedPrompt).toContain('Refactor')
      expect(result.data.result.costPreview.expectedDollars).toBeGreaterThan(0)
    }
  })

  it('returns API_AUTH_FAILED when account has no apiKey', async () => {
    const noKeyAccountId = AccountsDao.createAccount(db, { label: 'NoKey', configDir: '/nk', apiKey: null }).id
    const projectId2 = ProjectsDao.createProject(db, { name: 'NK', rootPath: '/nk', defaultAccountId: noKeyAccountId }).id
    const noKeyConvId = ConversationsDao.createConversation(db, { projectId: projectId2, accountId: noKeyAccountId }).id

    const result = await handler.gear({
      conversationId: noKeyConvId,
      accountId: null,
      originalPrompt: 'x',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })

  it('propagates API errors through the IpcResult envelope', async () => {
    const errFixtures: Record<string, MockFixture> = {
      '*': { error: { code: 'API_AUTH_FAILED', message: 'bad key' } }
    }
    const errRegistry = new AnthropicClientRegistry(makeLogger(), () => new MockAnthropicClient(errFixtures))
    const errHandler = new GearingHandler(db, makeLogger(), errRegistry)
    const result = await errHandler.gear({
      conversationId,
      accountId: null,
      originalPrompt: 'x',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })

  it('returns API_AUTH_FAILED when no account is resolvable', async () => {
    const result = await handler.gear({
      conversationId: null,
      accountId: null,
      originalPrompt: 'x',
      configs: { model: 'haiku', breadth: 'normal', format: 'prose', skill: null }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('API_AUTH_FAILED')
  })
})
