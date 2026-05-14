import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { CcLifecycle } from '../../cc/lifecycle'
import { CcHandler } from '../../ipc/cc-handler'
import { Logger } from '../../observability/logger'
import { MockPty } from '../../../../test/doubles/mock-pty'
import { AccountsDao, ProjectsDao, ConversationsDao } from '../../db'

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/cc-handler', () => {
  let db: Database
  let broadcast: ReturnType<typeof vi.fn>
  let lifecycle: CcLifecycle
  let lastPty: MockPty | null
  let handler: CcHandler
  let conversationId: number
  let accountId: number

  beforeEach(() => {
    db = createTestDb()
    accountId = AccountsDao.createAccount(db, {
      label: 'Personal',
      configDir: 'C:/Users/me/.claude-personal'
    }).id
    const projectId = ProjectsDao.createProject(db, {
      name: 'P',
      rootPath: 'C:/x',
      defaultAccountId: accountId
    }).id
    conversationId = ConversationsDao.createConversation(db, { projectId, accountId }).id

    broadcast = vi.fn()
    lastPty = null
    lifecycle = new CcLifecycle(
      (_b, _a, opts) => {
        lastPty = new MockPty({ initialCols: opts.cols, initialRows: opts.rows })
        return lastPty
      },
      {
        onChunk: (e) => broadcast('cc:output-chunk', e),
        onExit: (e) => broadcast('cc:exit', e),
        onEvent: vi.fn()
      }
    )
    handler = new CcHandler(db, makeLogger(), lifecycle)
  })

  it('start returns ok with sessionId, persists cc_session_id on the conversation', async () => {
    const result = await handler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    const conv = ConversationsDao.getConversationById(db, conversationId)
    expect(conv?.ccSessionId).toBe(result.data.sessionId)
  })

  it('start with an unknown accountId returns NOT_FOUND', async () => {
    const result = await handler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId: 99999
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('start with an unknown conversationId returns NOT_FOUND', async () => {
    const result = await handler.start({
      conversationId: 99999,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('send writes a turn row + pipes prompt to PTY stdin', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const result = await handler.send({
      conversationId,
      prompt: 'hello claude',
      model: 'sonnet',
      breadth: 'normal',
      format: 'prose'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.turnId).toBeGreaterThan(0)
    expect(lastPty!.writes).toEqual(['hello claude\r'])

    // Verify the turn row
    const turn = db
      .prepare('SELECT * FROM turns WHERE id = ?')
      .get(result.data.turnId) as { role: string; original_prompt: string; status: string }
    expect(turn.role).toBe('user')
    expect(turn.original_prompt).toBe('hello claude')
    expect(turn.status).toBe('complete')
  })

  it('send to an unstarted conversation returns NOT_FOUND', async () => {
    const result = await handler.send({
      conversationId,
      prompt: 'too early',
      model: null,
      breadth: null,
      format: null
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('PTY output is broadcast as cc:output-chunk', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    broadcast.mockClear()
    lastPty!.emitData('partial response')
    expect(broadcast).toHaveBeenCalledWith('cc:output-chunk', {
      conversationId,
      chunk: 'partial response'
    })
  })

  it('resize delegates to lifecycle', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const result = await handler.resize({ conversationId, cols: 120, rows: 40 })
    expect(result.ok).toBe(true)
    expect(lastPty!.cols).toBe(120)
    expect(lastPty!.rows).toBe(40)
  })

  it('stop kills the PTY and marks the most-recent in-flight turn as stopped', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    await handler.send({
      conversationId,
      prompt: 'do something',
      model: 'sonnet',
      breadth: 'normal',
      format: 'prose'
    })

    const result = await handler.stop({ conversationId })
    expect(result.ok).toBe(true)

    expect(lastPty!.killed).toBe(true)
    expect(lastPty!.killSignals[0]).toBe('SIGINT')

    const turn = db
      .prepare(
        `SELECT status FROM turns WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(conversationId) as { status: string }
    expect(turn.status).toBe('stopped')
  })

  it('stop on unknown conversationId returns ok but is a no-op', async () => {
    const result = await handler.stop({ conversationId: 99999 })
    expect(result.ok).toBe(true)
  })
})
