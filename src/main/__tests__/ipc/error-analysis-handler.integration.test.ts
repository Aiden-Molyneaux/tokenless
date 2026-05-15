import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'

import { createTestDb } from '../../../../test/doubles/test-db'
import { MockAnthropicClient } from '../../../../test/doubles/mock-anthropic-client'
import { ErrorAnalysisHandler } from '../../ipc/error-analysis-handler'
import { AnthropicClientRegistry } from '../../api/client-registry'
import { AccountsDao } from '../../db'
import { Logger } from '../../observability/logger'

// Purpose: verify ErrorAnalysisHandler resolves an account, reads the ring
// buffer for the target record + context, calls Haiku, and wraps the result
// in an IpcResult envelope. Also covers auth-failure + not-found error paths.

function makeLogger(): Logger {
  return new Logger(
    { write: vi.fn(), append: vi.fn(), close: vi.fn(), flush: vi.fn() } as never,
    100,
    'main'
  )
}

describe('ipc/error-analysis-handler', () => {
  let db: Database
  let logger: Logger
  let handler: ErrorAnalysisHandler
  let mockClient: MockAnthropicClient

  beforeEach(() => {
    db = createTestDb()
    logger = makeLogger()
    mockClient = new MockAnthropicClient({
      '*': {
        response: {
          text: 'Likely cause: foo. Fix: bar.',
          inputTokens: 100,
          outputTokens: 50,
          stopReason: 'end_turn',
          model: 'claude-haiku-4-5-20251001'
        }
      }
    })
    const registry = new AnthropicClientRegistry(logger, () => mockClient)
    handler = new ErrorAnalysisHandler(db, logger, registry)
  })

  it('returns API_AUTH_FAILED when no account has an apiKey', async () => {
    AccountsDao.createAccount(db, { label: 'NoKey', configDir: '/p' })
    logger.error('cc', 'test-event', 'msg', {})
    const recent = logger.getRecent()
    const errorId = recent[recent.length - 1].id
    const r = await handler.analyzeError({ errorRecordId: errorId })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('API_AUTH_FAILED')
  })

  it('returns NOT_FOUND when errorRecordId is not in the buffer', async () => {
    AccountsDao.createAccount(db, { label: 'P', configDir: '/p', apiKey: 'sk-ant-x' })
    const r = await handler.analyzeError({ errorRecordId: 'nonexistent-id' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('returns the analysis when account + record + Haiku all succeed', async () => {
    AccountsDao.createAccount(db, { label: 'P', configDir: '/p', apiKey: 'sk-ant-x' })
    logger.error('cc', 'test-event', 'something failed', { foo: 'bar' })
    const recent = logger.getRecent()
    const errorId = recent[recent.length - 1].id

    const r = await handler.analyzeError({ errorRecordId: errorId })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.analysis).toContain('cause')
    }
  })
})
