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
        onEvent: vi.fn(),
        onCrashed: vi.fn(),
        onHung: vi.fn()
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

  it('send with gearMeta writes a complete user turn including geared fields', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const result = await handler.send({
      conversationId,
      prompt: 'hello claude',
      model: 'sonnet',
      breadth: 'normal',
      format: 'prose',
      gearMeta: {
        originalPrompt: 'hello claude original',
        gearedPrompt: 'hello claude geared',
        originalTokens: 100,
        gearedTokens: 80,
        haikuMetaTokens: 10,
        critiqueFlags: ['flag1', 'flag2']
      }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const turnId = result.data.turnId
    const turn = db.prepare('SELECT * FROM turns WHERE id = ?').get(turnId) as {
      role: string
      original_prompt: string | null
      geared_prompt: string | null
      original_tokens: number | null
      geared_tokens: number | null
      haiku_meta_tokens: number | null
      critique_flags_json: string | null
      status: string
    }

    expect(turn.role).toBe('user')
    expect(turn.original_prompt).toBe('hello claude original')
    expect(turn.geared_prompt).toBe('hello claude geared')
    expect(turn.original_tokens).toBe(100)
    expect(turn.geared_tokens).toBe(80)
    expect(turn.haiku_meta_tokens).toBe(10)
    expect(turn.critique_flags_json).toBe(JSON.stringify(['flag1', 'flag2']))
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
    // On Windows, lifecycle.stop() calls pty.kill() without a signal argument
    // (node-pty does not support signal-based kill on Windows). On other platforms,
    // SIGINT is passed explicitly.
    if (process.platform === 'win32') {
      expect(lastPty!.killSignals[0]).toBeUndefined()
    } else {
      expect(lastPty!.killSignals[0]).toBe('SIGINT')
    }

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

  it('resume looks up cc_session_id + delegates to lifecycle.resume', async () => {
    // First start a conversation so cc_session_id is persisted
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    const conv = ConversationsDao.getConversationById(db, conversationId)
    const storedSession = conv?.ccSessionId
    expect(storedSession).toBeTruthy()
    // Close so we can resume
    await handler.stop({ conversationId })
    await new Promise((r) => queueMicrotask(() => r(undefined)))

    // Now resume
    const result = await handler.resume({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sessionId).toBe(storedSession)
    }
  })

  it('resume returns NOT_FOUND when conversation has no stored cc_session_id', async () => {
    // Fresh conversation without a start
    const result = await handler.resume({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('resume on an already-active conversation returns ok with the existing sessionId (idempotent)', async () => {
    // First start — PTY now live
    const startResult = await handler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(startResult.ok).toBe(true)
    if (!startResult.ok) return
    const liveSessionId = startResult.data.sessionId

    // Resume without stopping first — lifecycle.resume throws "already active",
    // the handler catches it and returns the live slot's session info.
    const resumeResult = await handler.resume({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(resumeResult.ok).toBe(true)
    if (!resumeResult.ok) return
    expect(resumeResult.data.sessionId).toBe(liveSessionId)
  })

  it('send returns PTY_WRITE_FAILED when pty.write throws', async () => {
    await handler.start({ conversationId, cwd: 'C:/x', cols: 100, rows: 30, accountId })
    lastPty!.markDisposed()
    const result = await handler.send({
      conversationId,
      prompt: 'hello',
      model: null, breadth: null, format: null
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PTY_WRITE_FAILED')
  })

  it('start returns CLAUDE_NOT_FOUND when the spawner fails with that code', async () => {
    const errLifecycle = new CcLifecycle(
      () => {
        const e = new Error('claude binary not found: claude.cmd') as Error & { code?: string }
        e.code = 'CLAUDE_NOT_FOUND'
        throw e
      },
      { onChunk: vi.fn(), onExit: vi.fn(), onEvent: vi.fn(), onCrashed: vi.fn(), onHung: vi.fn() }
    )
    const errHandler = new CcHandler(db, makeLogger(), errLifecycle)
    const result = await errHandler.start({
      conversationId,
      cwd: 'C:/x',
      cols: 100,
      rows: 30,
      accountId
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CLAUDE_NOT_FOUND')
  })
})
